import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq, desc, and, ilike } from "drizzle-orm";
import OpenAI from "openai";
import * as workspaceDb from "@workspace/db";
import {
  db,
  invoicesTable,
  invoiceItemsTable,
  clientsTable,
  companiesTable,
  bankAccountsTable,
  cashMovementsTable,
  documentSeriesTable,
} from "@workspace/db";
import {
  ListInvoicesQueryParams,
  CreateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
  DeleteInvoiceParams,
  UpdateInvoiceStatusParams,
  UpdateInvoiceStatusBody,
  GetNextInvoiceNumberQueryParams,
  RegisterInvoicePaymentParams,
  RegisterInvoicePaymentBody,
} from "@workspace/api-zod";

import * as XLSX from "xlsx";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_INVOICE_MODEL = process.env.OPENAI_INVOICE_MODEL || "gpt-4o";

const invoiceUploadRoot = path.resolve(process.cwd(), "uploads", "invoices");

function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9,.-]+/g, "").trim();
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(",", ".");
  return parseFloat(normalized) || 0;
}

function parseDateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const isoMatch = value.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  const europeanMatch = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (europeanMatch) {
    const [, day, month, rawYear] = europeanMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()))
    return parsed.toISOString().split("T")[0];
  return null;
}

async function saveOriginalInvoicePdf(
  companyId: number,
  file: Express.Multer.File,
): Promise<string> {
  const companyDir = path.join(invoiceUploadRoot, String(companyId));
  await mkdir(companyDir, { recursive: true });
  const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storedName = `${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  const absolutePath = path.join(companyDir, storedName);
  await writeFile(absolutePath, file.buffer);
  return absolutePath;
}

// ============================================================================
// OPENAI PDF PARSER PARA FACTURAS EMITIDAS
// ============================================================================

type IssuedInvoiceLineItem = {
  description: string;
  productCode?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
};

type NormalizedIssuedInvoice = {
  clientName: string;
  clientTaxId: string;
  clientAddress: string;
  clientCity: string;
  clientProvince: string;
  clientPostalCode: string;
  clientEmail: string;
  clientPhone: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  concept: string;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  pageStart: number | null;
  pageEnd: number | null;
  lineItems: IssuedInvoiceLineItem[];
  allExtractedFields: Record<string, any>;
};

const issuedInvoiceLineItemSchema = {
  type: "object",
  properties: {
    description: { type: "string" },
    productCode: { type: "string" },
    productName: { type: "string" },
    quantity: { type: "number" },
    unitPrice: { type: "number" },
    amount: { type: "number" },
    taxRate: { type: "number" },
  },
  required: [
    "description",
    "productCode",
    "productName",
    "quantity",
    "unitPrice",
    "amount",
    "taxRate",
  ],
  additionalProperties: false,
};

const singleIssuedInvoiceSchema = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    clientTaxId: { type: "string" },
    clientAddress: { type: "string" },
    clientCity: { type: "string" },
    clientProvince: { type: "string" },
    clientPostalCode: { type: "string" },
    clientEmail: { type: "string" },
    clientPhone: { type: "string" },
    invoiceNumber: { type: "string" },
    issueDate: {
      type: ["string", "null"],
      description:
        "Fecha de emisión en formato YYYY-MM-DD. Si no aparece, null.",
    },
    dueDate: {
      type: ["string", "null"],
      description:
        "Fecha de vencimiento en formato YYYY-MM-DD. Si no aparece, null.",
    },
    concept: { type: "string" },
    netAmount: {
      type: "number",
      description: "Subtotal/base imponible sin impuestos.",
    },
    taxRate: {
      type: "number",
      description: "Porcentaje de IVA/impuesto principal. Ejemplo: 21.",
    },
    taxAmount: {
      type: "number",
      description: "Importe total de impuestos.",
    },
    totalAmount: {
      type: "number",
      description: "Importe total con impuestos incluidos.",
    },
    pageStart: {
      type: ["number", "null"],
      description: "Página inicial aproximada donde empieza esta factura.",
    },
    pageEnd: {
      type: ["number", "null"],
      description: "Página final aproximada donde termina esta factura.",
    },
    lineItems: {
      type: "array",
      items: issuedInvoiceLineItemSchema,
    },
  },
  required: [
    "clientName",
    "clientTaxId",
    "clientAddress",
    "clientCity",
    "clientProvince",
    "clientPostalCode",
    "clientEmail",
    "clientPhone",
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "concept",
    "netAmount",
    "taxRate",
    "taxAmount",
    "totalAmount",
    "pageStart",
    "pageEnd",
    "lineItems",
  ],
  additionalProperties: false,
};

const multiIssuedInvoiceExtractionSchema = {
  type: "object",
  properties: {
    hasMultipleInvoices: {
      type: "boolean",
      description:
        "true si el PDF contiene más de una factura emitida independiente.",
    },
    invoiceCount: {
      type: "number",
      description:
        "Número total de facturas emitidas independientes detectadas.",
    },
    detectionSummary: {
      type: "string",
      description: "Resumen breve de la detección.",
    },
    invoices: {
      type: "array",
      items: singleIssuedInvoiceSchema,
    },
  },
  required: [
    "hasMultipleInvoices",
    "invoiceCount",
    "detectionSummary",
    "invoices",
  ],
  additionalProperties: false,
};

function isPdfFile(file: Express.Multer.File): boolean {
  return (
    file.mimetype === "application/pdf" ||
    /\.pdf$/i.test(file.originalname || "")
  );
}

function toNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "");

  if (!raw) return fallback;

  let normalized = raw.replace(/[^\d,.-]/g, "");

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");

    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: any, fallback?: string): string {
  return (
    parseDateValue(String(value || "")) ||
    fallback ||
    new Date().toISOString().split("T")[0]
  );
}

function parseAddressParts(address: string) {
  let extractedPostalCode = "";
  let extractedCity = "";
  let extractedAddress = address || "";

  const cpMatch = extractedAddress.match(/\b\d{5}\b/);
  if (cpMatch) {
    extractedPostalCode = cpMatch[0];
    const parts = extractedAddress.split(extractedPostalCode);
    if (parts.length > 1) {
      extractedCity = parts[1].replace(/^[.\s,-]+/, "").trim();
      extractedAddress = parts[0].replace(/[,\s]+$/, "").trim();
    }
  }

  return {
    address: extractedAddress,
    city: extractedCity,
    postalCode: extractedPostalCode,
  };
}

async function createOpenAIUserDataFile(file: Express.Multer.File) {
  if (!file.buffer) {
    throw new Error("El PDF no tiene buffer. Revisa multer.memoryStorage().");
  }

  return await openai.files.create({
    file: await OpenAI.toFile(
      file.buffer,
      file.originalname || "factura-emitida.pdf",
      { type: file.mimetype || "application/pdf" } as any,
    ),
    purpose: "user_data",
  });
}

async function deleteOpenAIFileSafely(fileId: string) {
  try {
    const filesApi: any = openai.files as any;

    if (typeof filesApi.del === "function") {
      await filesApi.del(fileId);
      return;
    }

    if (typeof filesApi.delete === "function") {
      await filesApi.delete(fileId);
      return;
    }

    console.warn("No se encontró método para eliminar archivo OpenAI:", fileId);
  } catch (e) {
    console.warn("No se pudo eliminar el archivo temporal de OpenAI:", e);
  }
}

function parseJsonFromOpenAIResponse(response: any) {
  const text = response.output_text;

  if (!text || typeof text !== "string") {
    throw new Error("OpenAI no devolvió texto JSON procesable.");
  }

  return JSON.parse(text);
}

function normalizeLineItems(
  rawItems: any[],
  fallbackAmount: number,
): IssuedInvoiceLineItem[] {
  let items = Array.isArray(rawItems) ? rawItems : [];

  items = items
    .map((item) => {
      const quantity = toNumber(item.quantity, 1) || 1;
      const unitPrice = toNumber(item.unitPrice, 0);
      const amount = toNumber(item.amount, 0) || quantity * unitPrice || 0;
      const description =
        item.description ||
        item.productName ||
        item.productCode ||
        "Concepto extraído del PDF";

      return {
        description,
        productCode: item.productCode || "",
        productName: item.productName || description,
        quantity,
        unitPrice: unitPrice || (quantity ? amount / quantity : amount),
        amount,
        taxRate: toNumber(item.taxRate, 21),
      };
    })
    .filter((item) => item.description && item.description !== "undefined");

  if (items.length === 0) {
    items.push({
      description: "Factura importada desde PDF",
      productCode: "",
      productName: "Factura importada desde PDF",
      quantity: 1,
      unitPrice: fallbackAmount || 0,
      amount: fallbackAmount || 0,
      taxRate: 21,
    });
  }

  return items;
}

function normalizeIssuedInvoice(
  rawInvoice: any,
  fallbackIndex = 1,
): NormalizedIssuedInvoice {
  const today = new Date().toISOString().split("T")[0];

  const rawNetAmount = toNumber(rawInvoice.netAmount, 0);
  const rawTaxAmount = toNumber(rawInvoice.taxAmount, 0);
  const rawTotalAmount = toNumber(rawInvoice.totalAmount, 0);

  let lineItems = normalizeLineItems(
    rawInvoice.lineItems || [],
    rawNetAmount || rawTotalAmount,
  );

  const calculatedSubtotal = lineItems.reduce(
    (acc, item) => acc + toNumber(item.amount, 0),
    0,
  );

  const netAmount = rawNetAmount || calculatedSubtotal || rawTotalAmount;
  const taxAmount =
    rawTaxAmount ||
    (rawTotalAmount > netAmount ? rawTotalAmount - netAmount : 0);
  const taxRate =
    toNumber(rawInvoice.taxRate, 0) ||
    (netAmount > 0 && taxAmount > 0 ? (taxAmount / netAmount) * 100 : 21);
  const totalAmount = rawTotalAmount || netAmount + taxAmount;

  if (
    lineItems.length === 1 &&
    lineItems[0].description === "Factura importada desde PDF" &&
    netAmount > 0
  ) {
    lineItems[0].unitPrice = netAmount;
    lineItems[0].amount = netAmount;
  }

  const issueDate = normalizeDate(rawInvoice.issueDate, today);
  const dueDate = normalizeDate(rawInvoice.dueDate, issueDate);

  return {
    clientName: rawInvoice.clientName || "",
    clientTaxId: rawInvoice.clientTaxId || "",
    clientAddress: rawInvoice.clientAddress || "",
    clientCity: rawInvoice.clientCity || "",
    clientProvince: rawInvoice.clientProvince || "",
    clientPostalCode: rawInvoice.clientPostalCode || "",
    clientEmail: rawInvoice.clientEmail || "",
    clientPhone: rawInvoice.clientPhone || "",
    invoiceNumber:
      rawInvoice.invoiceNumber || `IMPORTADA-${Date.now()}-${fallbackIndex}`,
    issueDate,
    dueDate,
    concept: rawInvoice.concept || "Factura importada desde PDF",
    netAmount,
    taxRate,
    taxAmount,
    totalAmount,
    pageStart: rawInvoice.pageStart || null,
    pageEnd: rawInvoice.pageEnd || null,
    lineItems,
    allExtractedFields: rawInvoice || {},
  };
}

async function extractIssuedInvoicesWithOpenAI(openAiFileId: string): Promise<{
  hasMultipleInvoices: boolean;
  invoiceCount: number;
  detectionSummary: string;
  invoices: NormalizedIssuedInvoice[];
}> {
  const response = await openai.responses.create({
    model: OPENAI_INVOICE_MODEL,
    input: [
      {
        role: "system",
        content:
          "Eres un experto contable y OCR especializado en facturas emitidas. Debes analizar PDFs que pueden contener una o varias facturas emitidas independientes. En facturas emitidas, el cliente es el receptor/comprador/destinatario de la factura, NO la empresa emisora. Si detectas varias facturas con número, fecha, total o líneas propias, devuélvelas separadas en invoices. No mezcles líneas ni importes entre facturas. Extrae también las líneas de producto o servicio. Si un campo no aparece, usa cadena vacía para textos, null para fechas y 0 para importes. Devuelve siempre JSON conforme al esquema.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analiza este PDF de facturas emitidas. Detecta si hay una o varias facturas. Para cada factura extrae cliente, NIF/CIF del cliente, dirección, número, fechas, concepto, bases, IVA, total y líneas de producto/servicio con descripción, código si existe, cantidad, precio unitario e importe.",
          },
          {
            type: "input_file",
            file_id: openAiFileId,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "issued_invoice_extraction",
        strict: true,
        schema: multiIssuedInvoiceExtractionSchema,
      },
    },
  } as any);

  const extractedJson = parseJsonFromOpenAIResponse(response);
  const rawInvoices = Array.isArray(extractedJson.invoices)
    ? extractedJson.invoices
    : [];

  const invoices = rawInvoices.map((rawInvoice: any, idx: number) =>
    normalizeIssuedInvoice(rawInvoice, idx + 1),
  );

  return {
    hasMultipleInvoices:
      extractedJson.hasMultipleInvoices === true || invoices.length > 1,
    invoiceCount:
      typeof extractedJson.invoiceCount === "number"
        ? extractedJson.invoiceCount
        : invoices.length,
    detectionSummary:
      extractedJson.detectionSummary ||
      (invoices.length > 1
        ? `PDF con ${invoices.length} facturas emitidas.`
        : "PDF con una única factura emitida."),
    invoices,
  };
}

const dynamicProductsTable =
  (workspaceDb as any).productsTable ||
  (workspaceDb as any).productTable ||
  (workspaceDb as any).catalogProductsTable ||
  null;

function hasTableColumn(table: any, columnName: string): boolean {
  return !!table && !!table[columnName];
}

function setIfColumn(
  table: any,
  values: Record<string, any>,
  columnName: string,
  value: any,
) {
  if (hasTableColumn(table, columnName) && value !== undefined) {
    values[columnName] = value;
  }
}

async function resolveProductIfAvailable({
  tx,
  companyId,
  item,
}: {
  tx: any;
  companyId: number;
  item: IssuedInvoiceLineItem;
}): Promise<number | null> {
  const productsTable: any = dynamicProductsTable;

  if (!productsTable) return null;
  if (!hasTableColumn(productsTable, "id")) return null;
  if (!hasTableColumn(productsTable, "companyId")) return null;

  const nameColumn =
    productsTable.name ||
    productsTable.description ||
    productsTable.title ||
    null;

  if (!nameColumn) return null;

  const productName =
    item.productName ||
    item.description ||
    item.productCode ||
    "Producto importado";

  const productCode = item.productCode || "";

  try {
    const conditions = [eq(productsTable.companyId, companyId)];

    if (productCode && productsTable.sku) {
      conditions.push(eq(productsTable.sku, productCode));
    } else if (productCode && productsTable.code) {
      conditions.push(eq(productsTable.code, productCode));
    } else {
      conditions.push(ilike(nameColumn, `%${productName}%`));
    }

    const existingProducts = await tx
      .select()
      .from(productsTable)
      .where(and(...conditions))
      .limit(1);

    if (existingProducts.length > 0) {
      return existingProducts[0].id;
    }

    const values: Record<string, any> = {};

    setIfColumn(productsTable, values, "companyId", companyId);
    setIfColumn(productsTable, values, "name", productName);
    setIfColumn(
      productsTable,
      values,
      "description",
      item.description || productName,
    );
    setIfColumn(productsTable, values, "title", productName);
    setIfColumn(productsTable, values, "sku", productCode || null);
    setIfColumn(productsTable, values, "code", productCode || null);
    setIfColumn(productsTable, values, "reference", productCode || null);
    setIfColumn(
      productsTable,
      values,
      "salePrice",
      toNumber(item.unitPrice, 0).toString(),
    );
    setIfColumn(
      productsTable,
      values,
      "price",
      toNumber(item.unitPrice, 0).toString(),
    );
    setIfColumn(
      productsTable,
      values,
      "unitPrice",
      toNumber(item.unitPrice, 0).toString(),
    );
    setIfColumn(
      productsTable,
      values,
      "taxRate",
      toNumber(item.taxRate, 21).toString(),
    );
    setIfColumn(productsTable, values, "type", "product");
    setIfColumn(productsTable, values, "status", "active");
    setIfColumn(productsTable, values, "stock", "0");
    setIfColumn(productsTable, values, "currentStock", "0");

    if (
      !values.companyId ||
      (!values.name && !values.description && !values.title)
    ) {
      return null;
    }

    const [newProduct] = await tx
      .insert(productsTable)
      .values(values)
      .returning();
    return newProduct?.id || null;
  } catch (error) {
    console.warn(
      `⚠️ No se pudo crear/enlazar producto "${productName}". Se guardará solo como línea de factura:`,
      error,
    );
    return null;
  }
}

async function resolveClientForIssuedInvoice({
  tx,
  companyId,
  invoiceData,
}: {
  tx: any;
  companyId: number;
  invoiceData: NormalizedIssuedInvoice;
}): Promise<number | null> {
  const clientName = invoiceData.clientName || "";
  const clientTaxId = invoiceData.clientTaxId || "";

  if (!clientName && !clientTaxId) {
    return null;
  }

  const existingClients = await tx
    .select()
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.companyId, companyId),
        clientTaxId
          ? eq(clientsTable.taxId, clientTaxId)
          : ilike(clientsTable.name, `%${clientName}%`),
      ),
    )
    .limit(1);

  if (existingClients.length > 0) {
    const existingClient = existingClients[0];

    if (clientTaxId && existingClient.taxId === "PENDIENTE") {
      await tx
        .update(clientsTable)
        .set({ taxId: clientTaxId })
        .where(eq(clientsTable.id, existingClient.id));
    }

    return existingClient.id;
  }

  if (!clientName) {
    return null;
  }

  const addressParts = parseAddressParts(invoiceData.clientAddress || "");

  const [newClient] = await tx
    .insert(clientsTable)
    .values({
      companyId,
      name: clientName,
      taxId: clientTaxId || "PENDIENTE",
      address: addressParts.address || invoiceData.clientAddress || "",
      city: invoiceData.clientCity || addressParts.city || "",
      province: invoiceData.clientProvince || "",
      postalCode: invoiceData.clientPostalCode || addressParts.postalCode || "",
      phone: invoiceData.clientPhone || null,
      email: invoiceData.clientEmail || null,
    })
    .returning();

  return newClient.id;
}

async function createIssuedInvoiceFromExtractedData({
  tx,
  companyId,
  invoiceData,
  fileUrl,
  originalFileName,
  source,
  batchIndex,
}: {
  tx: any;
  companyId: number;
  invoiceData: NormalizedIssuedInvoice;
  fileUrl: string;
  originalFileName: string;
  source: string;
  batchIndex: number;
}) {
  const finalClientId = await resolveClientForIssuedInvoice({
    tx,
    companyId,
    invoiceData,
  });

  const invoiceNumber =
    invoiceData.invoiceNumber || `IMPORTADA-${Date.now()}-${batchIndex}`;

  if (invoiceNumber) {
    const existingInvoices = await tx
      .select()
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.companyId, companyId),
          eq(invoicesTable.invoiceNumber, invoiceNumber),
        ),
      )
      .limit(1);

    if (existingInvoices.length > 0) {
      return {
        invoiceId: existingInvoices[0].id,
        clientId: existingInvoices[0].clientId || finalClientId,
        invoiceNumber,
        total: parseFloat(existingInvoices[0].total || "0"),
        alreadyExisted: true,
      };
    }
  }

  const [invoice] = await tx
    .insert(invoicesTable)
    .values({
      companyId,
      clientId: finalClientId,
      type: "invoice",
      invoiceNumber,
      status: "emitida",
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate || invoiceData.issueDate,
      concept: invoiceData.concept || "Factura importada desde PDF",
      subtotal: invoiceData.netAmount.toFixed(2),
      taxRate: invoiceData.taxRate.toFixed(2),
      taxAmount: invoiceData.taxAmount.toFixed(2),
      total: invoiceData.totalAmount.toFixed(2),
      fileUrl,
      notes: `PDF original importado: ${originalFileName}`,
      extractedData: {
        source,
        originalFileName,
        clientName: invoiceData.clientName,
        clientTaxId: invoiceData.clientTaxId,
        clientAddress: invoiceData.clientAddress,
        invoiceNumber,
        issueDate: invoiceData.issueDate,
        dueDate: invoiceData.dueDate,
        subtotal: invoiceData.netAmount,
        taxRate: invoiceData.taxRate,
        taxAmount: invoiceData.taxAmount,
        total: invoiceData.totalAmount,
        pageStart: invoiceData.pageStart,
        pageEnd: invoiceData.pageEnd,
        allExtractedFields: invoiceData.allExtractedFields,
      },
    } as any)
    .returning();

  const itemsToInsert: any[] = [];

  for (let idx = 0; idx < invoiceData.lineItems.length; idx++) {
    const item = invoiceData.lineItems[idx];
    const productId = await resolveProductIfAvailable({
      tx,
      companyId,
      item,
    });

    const row: any = {
      invoiceId: invoice.id,
      description: item.description || "Concepto extraído del PDF",
      quantity: toNumber(item.quantity, 1).toString(),
      unitPrice: toNumber(item.unitPrice, 0).toFixed(6),
      amount: toNumber(item.amount, 0).toFixed(6),
      sortOrder: idx,
    };

    if (productId && hasTableColumn(invoiceItemsTable as any, "productId")) {
      row.productId = productId;
    }

    itemsToInsert.push(row);
  }

  if (itemsToInsert.length > 0) {
    await tx.insert(invoiceItemsTable).values(itemsToInsert);
  }

  return {
    invoiceId: invoice.id,
    clientId: finalClientId,
    invoiceNumber,
    total: invoiceData.totalAmount,
    alreadyExisted: false,
  };
}

interface ProcessedItem {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sortOrder: number;
}

interface ProcessedItemWithInvoice extends ProcessedItem {
  invoiceId: number;
}

async function getInvoiceWithItems(invoiceId: number) {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoiceId))
    .orderBy(invoiceItemsTable.sortOrder);

  let clientName: string | null = null;
  if (invoice.clientId) {
    const [client] = await db
      .select({ name: clientsTable.name })
      .from(clientsTable)
      .where(eq(clientsTable.id, invoice.clientId));
    clientName = client?.name ?? null;
  }

  const [company] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, invoice.companyId));

  return { ...invoice, items, clientName, companyName: company?.name ?? null };
}

function peekNextInvoiceNumber(
  companyId: number,
  series: { prefix: string; nextNumber: number } | null,
): string {
  const year = new Date().getFullYear();
  if (series) {
    return `${series.prefix}${series.nextNumber.toString().padStart(3, "0")}`;
  }
  return `${year}-001`;
}

async function reserveNextInvoiceNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [series] = await db
    .select()
    .from(documentSeriesTable)
    .where(
      and(
        eq(documentSeriesTable.companyId, companyId),
        eq(documentSeriesTable.type, "invoice"),
        eq(documentSeriesTable.year, year),
      ),
    );

  if (series) {
    const num = series.nextNumber.toString().padStart(3, "0");
    await db
      .update(documentSeriesTable)
      .set({ nextNumber: series.nextNumber + 1 })
      .where(eq(documentSeriesTable.id, series.id));
    return `${series.prefix}${num}`;
  }

  const prefix = `${year}-`;
  await db.insert(documentSeriesTable).values({
    companyId,
    type: "invoice",
    prefix,
    nextNumber: 2,
    year,
  });

  return `${prefix}001`;
}

router.get("/invoices/next-number", async (req, res): Promise<void> => {
  const query = GetNextInvoiceNumberQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const year = new Date().getFullYear();
  const [series] = await db
    .select()
    .from(documentSeriesTable)
    .where(
      and(
        eq(documentSeriesTable.companyId, query.data.companyId),
        eq(documentSeriesTable.type, "invoice"),
        eq(documentSeriesTable.year, year),
      ),
    );
  const invoiceNumber = peekNextInvoiceNumber(
    query.data.companyId,
    series ?? null,
  );
  res.json({ invoiceNumber });
});

router.get("/invoices", async (req, res): Promise<void> => {
  const query = ListInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const overdueInvoices = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.status, "emitida")));
  for (const inv of overdueInvoices) {
    const [full] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, inv.id));
    if (
      full &&
      full.dueDate &&
      full.dueDate < today &&
      full.status !== "cobrada" &&
      full.status !== "borrador" &&
      full.status !== "vencida"
    ) {
      await db
        .update(invoicesTable)
        .set({ status: "vencida" })
        .where(eq(invoicesTable.id, inv.id));
    }
  }

  const conditions = [];
  if (query.data.companyId)
    conditions.push(eq(invoicesTable.companyId, query.data.companyId));
  if (query.data.status)
    conditions.push(eq(invoicesTable.status, query.data.status));
  if (query.data.clientId)
    conditions.push(eq(invoicesTable.clientId, query.data.clientId));

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoicesTable.issueDate));

  const result = await Promise.all(
    invoices.map(async (inv) => {
      const items = await db
        .select()
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, inv.id))
        .orderBy(invoiceItemsTable.sortOrder);
      let clientName: string | null = null;
      if (inv.clientId) {
        const [client] = await db
          .select({ name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, inv.clientId));
        clientName = client?.name ?? null;
      }
      const [company] = await db
        .select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, inv.companyId));
      return { ...inv, items, clientName, companyName: company?.name ?? null };
    }),
  );

  res.json(result);
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...invoiceData } = parsed.data;

  // Limpieza defensiva del payload de status y type
  const rawBody = req.body as any;
  const safeType = rawBody.type === "quote" ? "quote" : "invoice";
  const safeStatus =
    rawBody.status === "convert_to_invoice"
      ? "emitida"
      : invoiceData.status || "borrador";

  let subtotal = 0;
  const processedItems: ProcessedItem[] = (items || []).map(
    (
      item: { description: string; quantity: string; unitPrice: string },
      idx: number,
    ) => {
      const qty = parseFloat(item.quantity || "1");
      const price = parseFloat(item.unitPrice || "0");
      const amount = qty * price;
      subtotal += amount;
      return {
        description: item.description,
        quantity: qty.toString(),
        unitPrice: price.toString(),
        amount: amount.toString(),
        sortOrder: idx,
      };
    },
  );

  const taxRate = parseFloat(invoiceData.taxRate || "21");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  let invoiceNumber = invoiceData.invoiceNumber;
  if (!invoiceNumber || invoiceNumber === "") {
    invoiceNumber = await reserveNextInvoiceNumber(invoiceData.companyId);
  }

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      companyId: invoiceData.companyId,
      clientId: invoiceData.clientId ?? null,
      projectId: invoiceData.projectId ?? null,
      type: safeType, // NUEVO
      invoiceNumber,
      status: safeStatus as any, // NUEVO (Seguro)
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate ?? null,
      concept: rawBody.concept ?? null,
      notes: invoiceData.notes ?? null,
      subtotal: subtotal.toString(),
      taxRate: taxRate.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
    })
    .returning();

  if (processedItems.length > 0) {
    await db.insert(invoiceItemsTable).values(
      processedItems.map((item) => ({
        ...item,
        invoiceId: invoice.id,
      })),
    );
  }

  const result = await getInvoiceWithItems(invoice.id);
  res.status(201).json(result);
});

router.post(
  "/invoices/bulk-upload-pdfs",
  upload.array("files"),
  async (req, res): Promise<void> => {
    try {
      const companyId = Number(req.body.companyId);
      const files = (req.files || []) as Express.Multer.File[];

      if (!companyId) {
        res.status(400).json({ error: "Falta el companyId" });
        return;
      }

      if (files.length === 0) {
        res.status(400).json({ error: "No se subió ningún PDF" });
        return;
      }

      const createdInvoices: any[] = [];
      const errors: Array<{ fileName: string; error: string }> = [];

      for (const file of files) {
        if (!isPdfFile(file)) {
          errors.push({
            fileName: file.originalname,
            error: "Solo se permiten PDFs",
          });
          continue;
        }

        let openAiFile: any = null;

        try {
          console.log(
            `📄 [OPENAI-ISSUED-BULK] Procesando PDF emitido: ${file.originalname}`,
          );

          const fileUrl = await saveOriginalInvoicePdf(companyId, file);
          openAiFile = await createOpenAIUserDataFile(file);

          const extraction = await extractIssuedInvoicesWithOpenAI(
            openAiFile.id,
          );

          if (extraction.invoices.length === 0) {
            throw new Error(
              "OpenAI no detectó ninguna factura emitida válida en el PDF",
            );
          }

          console.log(
            extraction.hasMultipleInvoices
              ? `⚠️ [OPENAI-ISSUED-BULK] PDF con ${extraction.invoices.length} facturas emitidas detectadas`
              : "✅ [OPENAI-ISSUED-BULK] PDF con una factura emitida detectada",
          );

          const results = await db.transaction(async (tx) => {
            const saved = [];

            for (let idx = 0; idx < extraction.invoices.length; idx++) {
              const created = await createIssuedInvoiceFromExtractedData({
                tx,
                companyId,
                invoiceData: extraction.invoices[idx],
                fileUrl,
                originalFileName: file.originalname,
                source: extraction.hasMultipleInvoices
                  ? "OpenAI PDF Parser - PDF con varias facturas emitidas"
                  : "OpenAI PDF Parser - Factura emitida",
                batchIndex: createdInvoices.length + idx + 1,
              });

              saved.push(created);
            }

            return saved;
          });

          for (const result of results) {
            const fullInvoice = await getInvoiceWithItems(result.invoiceId);

            if (fullInvoice) {
              createdInvoices.push({
                ...fullInvoice,
                alreadyExisted: result.alreadyExisted,
              });
            }
          }
        } catch (error: any) {
          console.error(
            `❌ Error importando PDF emitido ${file.originalname}:`,
            error,
          );

          errors.push({
            fileName: file.originalname,
            error: error?.message || "No se pudo procesar el PDF",
          });
        } finally {
          if (openAiFile?.id) {
            await deleteOpenAIFileSafely(openAiFile.id);
          }
        }
      }

      res.status(createdInvoices.length > 0 ? 201 : 400).json({
        success: createdInvoices.length > 0,
        createdCount: createdInvoices.length,
        created: createdInvoices,
        errors,
      });
    } catch (error: any) {
      console.error(
        "❌ Error general en subida masiva de facturas emitidas:",
        error,
      );

      res.status(500).json({
        error: error?.message || "Fallo al procesar la subida masiva",
      });
    }
  },
);

// ============================================================================
// PDF ORIGINAL DE FACTURA EMITIDA IMPORTADA
// ============================================================================

function resolveStoredInvoicePdfPath(invoice: any): string | null {
  const rawFileUrl = invoice?.fileUrl;
  if (!rawFileUrl || typeof rawFileUrl !== "string") return null;

  const candidates = [
    rawFileUrl,
    path.isAbsolute(rawFileUrl)
      ? rawFileUrl
      : path.resolve(invoiceUploadRoot, String(invoice.companyId), rawFileUrl),
    path.resolve(process.cwd(), rawFileUrl),
  ];

  const uniqueCandidates = Array.from(new Set(candidates));
  return uniqueCandidates.find((candidate) => existsSync(candidate)) || null;
}

async function sendStoredInvoicePdf(req: any, res: any): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!id || Number.isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id))
      .limit(1);

    if (!invoice || !invoice.fileUrl) {
      res.status(404).json({
        error: "Esta factura emitida no tiene un PDF original asociado",
      });
      return;
    }

    const filePath = resolveStoredInvoicePdfPath(invoice);

    if (!filePath) {
      res.status(404).json({
        error: "El archivo físico no existe en el servidor",
      });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath);
  } catch (error: any) {
    console.error("❌ Error sirviendo PDF original de factura emitida:", error);
    res.status(500).json({
      error: error.message || "Error al recuperar el PDF original",
    });
  }
}

// Ruta nueva clara.
router.get("/invoices/pdf/:id", sendStoredInvoicePdf);

// Alias compatible con el frontend anterior.
router.get("/invoices/uploaded-pdf/:id", sendStoredInvoicePdf);

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await getInvoiceWithItems(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateInvoiceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { items, ...invoiceData } = body.data;

  // Limpieza defensiva del payload para status y type
  const rawBody = req.body as any;
  const safeType = rawBody.type === "quote" ? "quote" : "invoice";
  const safeStatus =
    rawBody.status === "convert_to_invoice"
      ? "emitida"
      : invoiceData.status || "borrador";

  if (items) {
    await db
      .delete(invoiceItemsTable)
      .where(eq(invoiceItemsTable.invoiceId, params.data.id));

    let subtotal = 0;
    const processedItems: ProcessedItemWithInvoice[] = items.map(
      (
        item: { description: string; quantity: string; unitPrice: string },
        idx: number,
      ) => {
        const qty = parseFloat(item.quantity || "1");
        const price = parseFloat(item.unitPrice || "0");
        const amount = qty * price;
        subtotal += amount;
        return {
          description: item.description,
          invoiceId: params.data.id,
          quantity: qty.toString(),
          unitPrice: price.toString(),
          amount: amount.toString(),
          sortOrder: idx,
        };
      },
    );

    const taxRate = parseFloat(invoiceData.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    await db
      .update(invoicesTable)
      .set({
        ...invoiceData,
        type: safeType, // NUEVO
        status: safeStatus as any, // NUEVO
        concept: rawBody.concept ?? undefined,
        subtotal: subtotal.toString(),
        taxRate: taxRate.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
      })
      .where(eq(invoicesTable.id, params.data.id));

    if (processedItems.length > 0) {
      await db.insert(invoiceItemsTable).values(processedItems);
    }
  } else {
    await db
      .update(invoicesTable)
      .set({
        ...invoiceData,
        type: safeType,
        status: safeStatus as any,
        concept: rawBody.concept ?? undefined,
      })
      .where(eq(invoicesTable.id, params.data.id));
  }

  const result = await getInvoiceWithItems(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, params.data.id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.json({ success: true });
});

router.patch("/invoices/:id/status", async (req, res): Promise<void> => {
  const params = UpdateInvoiceStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateInvoiceStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  await db
    .update(invoicesTable)
    .set({ status: body.data.status })
    .where(eq(invoicesTable.id, params.data.id));
  const result = await getInvoiceWithItems(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

router.post("/invoices/:id/payment", async (req, res): Promise<void> => {
  const params = RegisterInvoicePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RegisterInvoicePaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const paymentAmount = parseFloat(body.data.amount);

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, params.data.id));
  if (!invoice) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [account] = await db
    .select()
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, body.data.bankAccountId));
  if (!account) {
    res.status(400).json({ error: "Cuenta bancaria no encontrada" });
    return;
  }
  if (account.companyId !== invoice.companyId) {
    res.status(400).json({
      error:
        "La cuenta bancaria debe pertenecer a la misma empresa que la factura",
    });
    return;
  }

  await db.transaction(async (tx) => {
    const newPaid = parseFloat(invoice.paidAmount) + paymentAmount;
    const total = parseFloat(invoice.total);
    const newStatus = newPaid >= total ? "cobrada" : "parcialmente_cobrada";

    await tx
      .update(invoicesTable)
      .set({ paidAmount: newPaid.toString(), status: newStatus })
      .where(eq(invoicesTable.id, params.data.id));

    await tx.insert(cashMovementsTable).values({
      companyId: invoice.companyId,
      bankAccountId: body.data.bankAccountId,
      type: "income",
      amount: paymentAmount.toString(),
      description: `Cobro factura ${invoice.invoiceNumber}`,
      movementDate: body.data.date || new Date().toISOString().split("T")[0],
      invoiceId: params.data.id,
    });

    const newBalance = parseFloat(account.currentBalance) + paymentAmount;
    await tx
      .update(bankAccountsTable)
      .set({ currentBalance: newBalance.toString() })
      .where(eq(bankAccountsTable.id, body.data.bankAccountId));
  });

  const result = await getInvoiceWithItems(params.data.id);
  res.json(result);
});

router.post(
  "/invoices/parse-albaran", // Asegúrate de montar esto bajo el prefijo /invoices
  upload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const file = req.file;
      const companyId = req.body.companyId;

      if (!file || !file.buffer) {
        res
          .status(400)
          .json({ error: "No se proporcionó ningún archivo Excel" });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: "Falta el companyId en la petición" });
        return;
      }

      console.log(`🚀 [BACKEND] Autoguardando Excel: ${file.originalname}`);

      // 1. LEER EL EXCEL DESDE EL BUFFER
      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const items: any[] = [];
      let isItemSection = false;

      let clientName = "";
      let clientNif = "";
      let clientAddress = "";
      let clientPhone = "";
      let clientEmail = "";
      let clientContact = "";

      let descIdx = -1,
        qtyIdx = -1,
        priceIdx = -1;

      // 2. EXTRAER DATOS DEL EXCEL (Misma lógica que tu frontend)
      for (const rawRow of rows as any[]) {
        if (!rawRow || !Array.isArray(rawRow) || rawRow.length === 0) continue;
        const cells = rawRow.map((cell) => String(cell || "").trim());

        // Extraer Cliente
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          if (!cell) continue;
          const lowerCell = cell.toLowerCase();

          const getValue = () => {
            if (cell.includes(":")) {
              const parts = cell.split(":");
              const val = parts.slice(1).join(":").trim();
              if (val) return val;
            }
            for (let i = c + 1; i < cells.length; i++) {
              if (cells[i] && cells[i].trim() !== "") return cells[i].trim();
            }
            return "";
          };

          if (
            (lowerCell.includes("cliente") ||
              lowerCell.includes("razón social")) &&
            !clientName
          ) {
            clientName = getValue();
          } else if (
            (lowerCell.includes("n.i.f") ||
              lowerCell.includes("nif") ||
              lowerCell.includes("cif")) &&
            !clientNif
          ) {
            clientNif = getValue();
          } else if (
            (lowerCell.includes("dirección") ||
              lowerCell.includes("direccion")) &&
            !clientAddress
          ) {
            clientAddress = getValue();
          } else if (
            (lowerCell.includes("teléfono") ||
              lowerCell.includes("telefono")) &&
            !clientPhone
          ) {
            clientPhone = getValue();
          } else if (
            (lowerCell.includes("email") || lowerCell.includes("correo")) &&
            !clientEmail
          ) {
            clientEmail = getValue();
          } else if (
            lowerCell.includes("persona de contacto") &&
            !clientContact
          ) {
            clientContact = getValue();
          }
        }

        // Detectar Tabla
        if (!isItemSection) {
          const lowerCellsForHeaders = cells.map((c) => c.toLowerCase());
          if (
            lowerCellsForHeaders.includes("código") ||
            lowerCellsForHeaders.includes("descripción") ||
            lowerCellsForHeaders.includes("artículo")
          ) {
            isItemSection = true;
            descIdx = lowerCellsForHeaders.findIndex(
              (c) => c.includes("descripción") || c.includes("artículo"),
            );
            qtyIdx = lowerCellsForHeaders.findIndex((c) => c === "unidades");
            if (qtyIdx === -1)
              qtyIdx = lowerCellsForHeaders.findIndex(
                (c) => c.includes("cant") || c.includes("cajas"),
              );
            priceIdx = lowerCellsForHeaders.findIndex((c) =>
              c.includes("precio"),
            );
            continue;
          }
        }

        // Extraer Items
        if (isItemSection && descIdx !== -1 && cells[descIdx]) {
          const description = cells[descIdx];
          if (
            description.toLowerCase() === "descripción" ||
            description === "undefined" ||
            description === "null"
          )
            continue;

          const quantity = qtyIdx !== -1 ? parseFloat(cells[qtyIdx]) || 1 : 1;
          const priceWithTax =
            priceIdx !== -1 ? parseFloat(cells[priceIdx]) || 0 : 0;
          const baseUnitPrice = priceWithTax / 1.21; // Quitamos IVA como en tu frontend

          items.push({
            description,
            quantity,
            unitPrice: baseUnitPrice,
            amount: quantity * baseUnitPrice,
          });
        }
      }

      if (items.length === 0) {
        res.status(400).json({
          error: "No se encontraron líneas de productos en el Excel.",
        });
        return;
      }

      // 3. TRANSACCIÓN: GUARDAR TODO EN BASE DE DATOS
      const result = await db.transaction(async (tx) => {
        let finalClientId = null;

        // A. Resolver Cliente (Buscar o Crear)
        if (clientName || clientNif) {
          const existingClients = await tx
            .select()
            .from(clientsTable)
            .where(
              and(
                eq(clientsTable.companyId, parseInt(companyId)),
                clientNif
                  ? eq(clientsTable.taxId, clientNif)
                  : ilike(clientsTable.name, `%${clientName}%`),
              ),
            )
            .limit(1);

          if (existingClients.length > 0) {
            finalClientId = existingClients[0].id;
          } else if (clientName) {
            // Lógica de extracción de CP y Ciudad
            let extractedPostalCode = "";
            let extractedCity = "";
            let extractedAddress = clientAddress;
            const cpMatch = clientAddress.match(/\b\d{5}\b/);
            if (cpMatch) {
              extractedPostalCode = cpMatch[0];
              const parts = clientAddress.split(extractedPostalCode);
              if (parts.length > 1) {
                extractedCity = parts[1].replace(/^[.\s,-]+/, "").trim();
                extractedAddress = parts[0].replace(/[,\s]+$/, "").trim();
              }
            }

            const [newClient] = await tx
              .insert(clientsTable)
              .values({
                companyId: parseInt(companyId),
                name: clientName,
                taxId: clientNif || "PENDIENTE",
                address: extractedAddress || "",
                phone: clientPhone || null,
                email: clientEmail || null,
                contactPerson: clientContact || null,
                city: extractedCity || "",
                province: "",
                postalCode: extractedPostalCode || "",
              })
              .returning();
            finalClientId = newClient.id;
          }
        }

        // B. Calcular Totales de la factura
        const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
        const taxRate = 21;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        // C. Crear la Factura Emitida
        const [invoice] = await tx
          .insert(invoicesTable)
          .values({
            companyId: parseInt(companyId),
            clientId: finalClientId,
            type: "invoice",
            // 🚨 SOLUCIÓN 1: Le damos un número temporal único para que Postgres no estalle
            invoiceNumber: `BORRADOR-${Date.now()}`,
            status: "borrador",
            issueDate: new Date().toISOString().split("T")[0],
            // 🚨 SOLUCIÓN 2: Asignamos el dueDate igual que el issueDate por si la BD lo exige
            dueDate: new Date().toISOString().split("T")[0],
            concept: "Facturación de albarán automático",
            subtotal: subtotal.toFixed(2),
            // 🚨 SOLUCIÓN 3: El taxRate como string sin decimales ("21") por si la BD exige Integer
            taxRate: taxRate.toString(),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
          })
          .returning();

        // D. Crear/enlazar productos si existe productsTable e insertar las líneas
        const itemsToInsert: any[] = [];

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const productId = await resolveProductIfAvailable({
            tx,
            companyId: parseInt(companyId),
            item: {
              description: item.description,
              productName: item.description,
              productCode: item.productCode || "",
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
              taxRate,
            },
          });

          const row: any = {
            invoiceId: invoice.id,
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toFixed(6), // 6 decimales de precisión
            amount: item.amount.toFixed(6),
            sortOrder: idx,
          };

          if (
            productId &&
            hasTableColumn(invoiceItemsTable as any, "productId")
          ) {
            row.productId = productId;
          }

          itemsToInsert.push(row);
        }

        await tx.insert(invoiceItemsTable).values(itemsToInsert);

        return { invoiceId: invoice.id, clientId: finalClientId };
      });

      console.log(
        `✅ [BACKEND] Factura autogenerada con ID: ${result.invoiceId}`,
      );
      res.status(201).json({ success: true, invoiceId: result.invoiceId });
    } catch (error: any) {
      console.error("❌ Error guardando Excel en BD:", error);
      res
        .status(500)
        .json({ error: "Fallo al procesar y guardar el archivo." });
    }
  },
);

export default router;
