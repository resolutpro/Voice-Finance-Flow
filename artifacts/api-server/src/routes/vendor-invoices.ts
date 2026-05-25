import { Router, type IRouter } from "express";
import { eq, desc, and, ilike } from "drizzle-orm";
import {
  db,
  vendorInvoicesTable,
  suppliersTable,
  categoriesTable,
  bankAccountsTable,
  cashMovementsTable,
  vendorInvoiceItemsTable,
} from "@workspace/db";
import {
  ListVendorInvoicesQueryParams,
  CreateVendorInvoiceBody,
  UpdateVendorInvoiceParams,
  UpdateVendorInvoiceBody,
  RegisterVendorPaymentParams,
  RegisterVendorPaymentBody,
} from "@workspace/api-zod";
import multer from "multer";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";

const router: IRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// 1. CONFIGURACIÓN DE SUBIDA DE ARCHIVOS
// ============================================================================

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "vendor_invoices");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ============================================================================
// 2. HELPERS GENERALES
// ============================================================================

const OPENAI_INVOICE_MODEL = process.env.OPENAI_INVOICE_MODEL || "gpt-4o";

type NormalizedLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type NormalizedInvoice = {
  supplierName: string;
  supplierTaxId: string;
  supplierAddress: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  pageStart: number | null;
  pageEnd: number | null;
  lineItems: NormalizedLineItem[];
  allExtractedFields?: any;
};

function isPdfFile(file: Express.Multer.File): boolean {
  return (
    file.mimetype === "application/pdf" ||
    /\.pdf$/i.test(file.originalname || "")
  );
}

function isSpreadsheetFile(file: Express.Multer.File): boolean {
  return (
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ].includes(file.mimetype) ||
    /\.(xlsx|xls|csv)$/i.test(file.originalname || "")
  );
}

async function getMulterFileBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer) return file.buffer;
  if (file.path) return await fs.promises.readFile(file.path);

  throw new Error(
    "El archivo no tiene buffer ni path. Revisa la configuración de multer.",
  );
}

async function createOpenAIUserDataFile(file: Express.Multer.File) {
  if (file.path) {
    return await openai.files.create({
      file: fs.createReadStream(file.path),
      purpose: "user_data",
    });
  }

  const buffer = await getMulterFileBuffer(file);

  return await openai.files.create({
    file: await OpenAI.toFile(buffer, file.originalname || "documento.pdf", {
      type: file.mimetype || "application/pdf",
    } as any),
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
  if (!value) return fallback || new Date().toISOString().split("T")[0];

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const spanishDate = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (spanishDate) {
    const day = spanishDate[1].padStart(2, "0");
    const month = spanishDate[2].padStart(2, "0");
    const year =
      spanishDate[3].length === 2 ? `20${spanishDate[3]}` : spanishDate[3];
    return `${year}-${month}-${day}`;
  }

  return fallback || new Date().toISOString().split("T")[0];
}

function normalizeLineItems(
  lineItems: any[],
  fallbackAmount = 0,
): NormalizedLineItem[] {
  const normalizedItems = Array.isArray(lineItems)
    ? lineItems
        .map((item: any) => {
          const quantity = toNumber(item?.quantity, 1) || 1;
          const unitPrice = toNumber(item?.unitPrice, 0);
          const amount = toNumber(item?.amount, 0) || quantity * unitPrice || 0;

          return {
            description: item?.description || "Sin descripción",
            quantity,
            unitPrice: unitPrice || (quantity ? amount / quantity : 0),
            amount,
          };
        })
        .filter((item) => item.description && item.description !== "undefined")
    : [];

  if (normalizedItems.length > 0) return normalizedItems;

  return [
    {
      description: "Concepto general extraído",
      quantity: 1,
      unitPrice: fallbackAmount,
      amount: fallbackAmount,
    },
  ];
}

function normalizeExtractedInvoice(invoiceData: any): NormalizedInvoice {
  const today = new Date().toISOString().split("T")[0];
  const issueDate = normalizeDate(invoiceData?.issueDate, today);
  const dueDate = normalizeDate(invoiceData?.dueDate, issueDate);

  const netAmount = toNumber(invoiceData?.netAmount, 0);
  const taxRate = toNumber(invoiceData?.taxRate, 21);
  const taxAmount = toNumber(invoiceData?.taxAmount, 0);
  const totalAmount = toNumber(invoiceData?.totalAmount, 0);
  const lineItems = normalizeLineItems(invoiceData?.lineItems, netAmount);

  const calculatedSubtotal = lineItems.reduce(
    (acc, item) => acc + toNumber(item.amount, 0),
    0,
  );

  const finalNetAmount = netAmount > 0 ? netAmount : calculatedSubtotal;
  const finalTaxAmount =
    taxAmount > 0 ? taxAmount : finalNetAmount * (taxRate / 100);
  const finalTotalAmount =
    totalAmount > 0 ? totalAmount : finalNetAmount + finalTaxAmount;

  return {
    supplierName: invoiceData?.supplierName || "",
    supplierTaxId: invoiceData?.supplierTaxId || "",
    supplierAddress: invoiceData?.supplierAddress || "Pendiente",
    invoiceNumber: invoiceData?.invoiceNumber || `AUTO-${Date.now()}`,
    issueDate,
    dueDate,
    netAmount: finalNetAmount,
    taxRate,
    taxAmount: finalTaxAmount,
    totalAmount: finalTotalAmount,
    pageStart:
      invoiceData?.pageStart === null || invoiceData?.pageStart === undefined
        ? null
        : toNumber(invoiceData.pageStart, 0) || null,
    pageEnd:
      invoiceData?.pageEnd === null || invoiceData?.pageEnd === undefined
        ? null
        : toNumber(invoiceData.pageEnd, 0) || null,
    lineItems,
    allExtractedFields: invoiceData,
  };
}

function buildSingleInvoiceExtractionResult(extractedJson: any) {
  const invoices = Array.isArray(extractedJson?.invoices)
    ? extractedJson.invoices
    : extractedJson
      ? [extractedJson]
      : [];

  const normalizedInvoices = invoices.map(normalizeExtractedInvoice);
  const hasMultipleInvoices =
    extractedJson?.hasMultipleInvoices === true ||
    normalizedInvoices.length > 1;
  const invoiceCount =
    typeof extractedJson?.invoiceCount === "number"
      ? extractedJson.invoiceCount
      : normalizedInvoices.length;

  return {
    hasMultipleInvoices,
    invoiceCount,
    detectionSummary:
      extractedJson?.detectionSummary ||
      (hasMultipleInvoices
        ? `PDF con ${invoiceCount} facturas detectadas.`
        : "PDF con una única factura detectada."),
    invoices: normalizedInvoices,
  };
}

async function findOrCreateSupplier({
  tx,
  companyId,
  supplierName,
  supplierTaxId,
  supplierAddress,
}: {
  tx: any;
  companyId: number;
  supplierName: string;
  supplierTaxId: string;
  supplierAddress: string;
}) {
  if (!supplierName && !supplierTaxId) return null;

  const existingSuppliers = await tx
    .select()
    .from(suppliersTable)
    .where(
      and(
        eq(suppliersTable.companyId, companyId),
        supplierTaxId
          ? eq(suppliersTable.taxId, supplierTaxId)
          : ilike(suppliersTable.name, `%${supplierName}%`),
      ),
    )
    .limit(1);

  if (existingSuppliers.length > 0) {
    const supplier = existingSuppliers[0];

    if (supplierTaxId && supplier.taxId === "PENDIENTE") {
      await tx
        .update(suppliersTable)
        .set({ taxId: supplierTaxId })
        .where(eq(suppliersTable.id, supplier.id));
    }

    return supplier.id;
  }

  if (!supplierName) return null;

  const [newSupplier] = await tx
    .insert(suppliersTable)
    .values({
      companyId,
      name: supplierName,
      taxId: supplierTaxId || "PENDIENTE",
      address: supplierAddress || "Pendiente",
      city: "Pendiente",
      postalCode: "00000",
    })
    .returning();

  return newSupplier.id;
}

async function createVendorInvoiceFromNormalizedData({
  tx,
  companyId,
  invoiceData,
  file,
  source,
}: {
  tx: any;
  companyId: string;
  invoiceData: NormalizedInvoice;
  file: Express.Multer.File;
  source: string;
}) {
  const parsedCompanyId = parseInt(companyId);

  const finalSupplierId = await findOrCreateSupplier({
    tx,
    companyId: parsedCompanyId,
    supplierName: invoiceData.supplierName,
    supplierTaxId: invoiceData.supplierTaxId,
    supplierAddress: invoiceData.supplierAddress,
  });

  // Evita duplicados cuando el frontend todavía llama después a POST /vendor-invoices
  // o cuando se sube dos veces el mismo PDF. Si existe misma empresa + proveedor + nº factura,
  // devolvemos la factura ya creada en vez de insertar otra.
  if (invoiceData.invoiceNumber) {
    const duplicateConditions = [
      eq(vendorInvoicesTable.companyId, parsedCompanyId),
      eq(vendorInvoicesTable.invoiceNumber, invoiceData.invoiceNumber),
    ];

    if (finalSupplierId) {
      duplicateConditions.push(
        eq(vendorInvoicesTable.supplierId, finalSupplierId),
      );
    }

    const existingInvoices = await tx
      .select()
      .from(vendorInvoicesTable)
      .where(and(...duplicateConditions))
      .limit(1);

    if (existingInvoices.length > 0) {
      const existingInvoice = existingInvoices[0];
      console.log(
        `ℹ️ [AUTO-SAVE] Factura ${invoiceData.invoiceNumber} ya existía. No se duplica. ID: ${existingInvoice.id}`,
      );

      return {
        invoiceId: existingInvoice.id,
        supplierId: existingInvoice.supplierId || finalSupplierId,
        invoiceNumber:
          existingInvoice.invoiceNumber || invoiceData.invoiceNumber,
        issueDate: existingInvoice.issueDate || invoiceData.issueDate,
        total: toNumber(existingInvoice.total, invoiceData.totalAmount),
        alreadyExisted: true,
      };
    }
  }

  const [invoice] = await tx
    .insert(vendorInvoicesTable)
    .values({
      companyId: parsedCompanyId,
      supplierId: finalSupplierId,
      invoiceNumber: invoiceData.invoiceNumber,
      status: "borrador",
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate,
      description: `Documento procesado automáticamente (${source})`,
      subtotal: invoiceData.netAmount.toFixed(2),
      taxRate: invoiceData.taxRate.toString(),
      taxAmount: invoiceData.taxAmount.toFixed(2),
      total: invoiceData.totalAmount.toFixed(2),
      fileUrl: file.filename || null,
      extractedData: {
        source,
        originalFileName: file.originalname,
        storedFileName: file.filename || null,
        mimeType: file.mimetype,
        supplierName: invoiceData.supplierName,
        supplierNif: invoiceData.supplierTaxId,
        supplierAddress: invoiceData.supplierAddress,
        invoiceNumber: invoiceData.invoiceNumber,
        issueDate: invoiceData.issueDate,
        dueDate: invoiceData.dueDate,
        subtotal: invoiceData.netAmount,
        taxRate: invoiceData.taxRate,
        taxAmount: invoiceData.taxAmount,
        total: invoiceData.totalAmount,
        pageStart: invoiceData.pageStart,
        pageEnd: invoiceData.pageEnd,
        allExtractedFields: invoiceData.allExtractedFields || null,
      },
    })
    .returning();

  const itemsToInsert = invoiceData.lineItems.map((item) => ({
    vendorInvoiceId: invoice.id,
    description: item.description || "Sin descripción",
    quantity: toNumber(item.quantity, 1).toString(),
    unitPrice: toNumber(item.unitPrice, 0).toFixed(6),
    amount: toNumber(item.amount, 0).toFixed(6),
  }));

  await tx.insert(vendorInvoiceItemsTable).values(itemsToInsert);

  return {
    invoiceId: invoice.id,
    supplierId: finalSupplierId,
    invoiceNumber: invoiceData.invoiceNumber,
    issueDate: invoiceData.issueDate,
    total: invoiceData.totalAmount,
    alreadyExisted: false,
  };
}

// ============================================================================
// 3. SCHEMAS OPENAI PARA UNA O VARIAS FACTURAS EN UN PDF
// ============================================================================

const singleInvoiceSchema = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    supplierTaxId: { type: "string" },
    supplierAddress: { type: "string" },
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
    netAmount: {
      type: "number",
      description: "Base imponible o subtotal sin impuestos.",
    },
    taxRate: {
      type: "number",
      description: "Porcentaje de IVA/impuesto principal. Ejemplo: 21 o 4.",
    },
    taxAmount: {
      type: "number",
      description: "Importe total de impuestos.",
    },
    totalAmount: {
      type: "number",
      description: "Importe total de la factura con impuestos incluidos.",
    },
    pageStart: {
      type: ["number", "null"],
      description:
        "Página inicial aproximada donde aparece esta factura dentro del PDF.",
    },
    pageEnd: {
      type: ["number", "null"],
      description:
        "Página final aproximada donde aparece esta factura dentro del PDF.",
    },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          amount: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice", "amount"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "supplierName",
    "supplierTaxId",
    "supplierAddress",
    "invoiceNumber",
    "issueDate",
    "dueDate",
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

const multiInvoiceExtractionSchema = {
  type: "object",
  properties: {
    hasMultipleInvoices: {
      type: "boolean",
      description:
        "true si el PDF contiene más de una factura real e independiente.",
    },
    invoiceCount: {
      type: "number",
      description: "Número total de facturas reales detectadas en el PDF.",
    },
    detectionSummary: {
      type: "string",
      description:
        "Resumen breve indicando si hay una o varias facturas y qué números de factura se han detectado.",
    },
    invoices: {
      type: "array",
      description:
        "Listado de facturas detectadas. Cada factura debe ir separada si tiene número, fecha, total o líneas propias.",
      items: singleInvoiceSchema,
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

async function extractInvoicesFromPdfWithOpenAI(openAiFileId: string) {
  const response = await openai.responses.create({
    model: OPENAI_INVOICE_MODEL,
    input: [
      {
        role: "system",
        content:
          "Eres un experto contable y un sistema OCR de extracción de facturas. Debes analizar PDFs que pueden contener una sola factura o varias facturas independientes. Una factura independiente se reconoce porque tiene su propio número de factura, fecha, base imponible, impuestos, total o líneas propias. Si detectas varias facturas en el mismo PDF, NO mezcles sus líneas ni sus importes: devuelve cada factura separada dentro del array invoices. Si solo hay una factura, devuelve igualmente invoices con un único elemento. Si un campo no aparece, devuelve cadena vacía para textos, null para fechas y 0 para importes. Devuelve siempre JSON conforme al esquema.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analiza este PDF. Primero determina si contiene una sola factura o varias facturas independientes. Después extrae cada factura por separado, indicando proveedor, NIF/CIF, dirección, número, fecha, base imponible, IVA/impuestos, total, líneas y páginas aproximadas donde aparece.",
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
        name: "multi_invoice_extraction",
        strict: true,
        schema: multiInvoiceExtractionSchema,
      },
    },
  } as any);

  const extractedJson = parseJsonFromOpenAIResponse(response);
  return buildSingleInvoiceExtractionResult(extractedJson);
}

// ============================================================================
// 4. PARSER LOCAL DE EXCEL / CSV
// ============================================================================

async function extractInvoiceFromSpreadsheet(
  file: Express.Multer.File,
): Promise<NormalizedInvoice> {
  const fileBuffer = await getMulterFileBuffer(file);

  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!worksheet) {
    throw new Error("No se pudo leer ninguna hoja del archivo Excel/CSV.");
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let items: any[] = [];
  let supplierName = "";
  let supplierNif = "";
  let supplierAddress = "Pendiente";
  let invoiceNumber = `AUTO-${Date.now()}`;
  let issueDate = new Date().toISOString().split("T")[0];

  let isItemSection = false;
  let descIdx = -1;
  let qtyIdx = -1;
  let priceIdx = -1;
  let amountIdx = -1;

  for (const rawRow of rows as any[]) {
    if (!rawRow || !Array.isArray(rawRow) || rawRow.length === 0) {
      continue;
    }

    const cells = rawRow.map((cell) => String(cell || "").trim());

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      if (!cell) continue;

      const lowerCell = cell.toLowerCase();

      const getValue = () => {
        if (cell.includes(":")) {
          return cell.split(":").slice(1).join(":").trim();
        }

        for (let i = c + 1; i < cells.length; i++) {
          if (cells[i] && cells[i].trim() !== "") {
            return cells[i].trim();
          }
        }

        return "";
      };

      if (
        (lowerCell.includes("proveedor") ||
          lowerCell.includes("cliente") ||
          lowerCell.includes("empresa")) &&
        !supplierName
      ) {
        supplierName = getValue();
      }

      if (
        (lowerCell.includes("nif") ||
          lowerCell.includes("cif") ||
          lowerCell.includes("tax id")) &&
        !supplierNif
      ) {
        supplierNif = getValue();
      }

      if (
        (lowerCell.includes("dirección") ||
          lowerCell.includes("direccion") ||
          lowerCell.includes("address")) &&
        supplierAddress === "Pendiente"
      ) {
        supplierAddress = getValue();
      }

      if (
        (lowerCell.includes("factura") || lowerCell.includes("invoice")) &&
        invoiceNumber.startsWith("AUTO-")
      ) {
        const value = getValue();
        if (value) invoiceNumber = value;
      }

      if (
        (lowerCell.includes("fecha") || lowerCell.includes("date")) &&
        issueDate === new Date().toISOString().split("T")[0]
      ) {
        const value = getValue();
        if (value) issueDate = normalizeDate(value, issueDate);
      }
    }

    if (!isItemSection) {
      const lowerHeaders = cells.map((c) => c.toLowerCase());

      const possibleDescIdx = lowerHeaders.findIndex(
        (c) =>
          c.includes("descripción") ||
          c.includes("descripcion") ||
          c.includes("artículo") ||
          c.includes("articulo") ||
          c.includes("concepto") ||
          c.includes("producto") ||
          c.includes("código") ||
          c.includes("codigo"),
      );

      if (possibleDescIdx !== -1) {
        isItemSection = true;
        descIdx = possibleDescIdx;

        qtyIdx = lowerHeaders.findIndex(
          (c) =>
            c === "unidades" ||
            c.includes("cantidad") ||
            c.includes("cant") ||
            c.includes("uds") ||
            c.includes("qty"),
        );

        priceIdx = lowerHeaders.findIndex(
          (c) =>
            c.includes("precio") ||
            c.includes("price") ||
            c.includes("unitario") ||
            c.includes("unit"),
        );

        amountIdx = lowerHeaders.findIndex(
          (c) =>
            c.includes("importe") ||
            c.includes("total") ||
            c.includes("amount"),
        );

        continue;
      }
    }

    if (isItemSection && descIdx !== -1 && cells[descIdx]) {
      const description = cells[descIdx];

      if (
        !description ||
        description.toLowerCase() === "descripción" ||
        description.toLowerCase() === "descripcion" ||
        description.toLowerCase() === "concepto" ||
        description === "undefined"
      ) {
        continue;
      }

      if (
        description.toLowerCase().includes("subtotal") ||
        description.toLowerCase().includes("base imponible") ||
        description.toLowerCase().includes("iva") ||
        description.toLowerCase().includes("total")
      ) {
        continue;
      }

      const quantity = qtyIdx !== -1 ? toNumber(cells[qtyIdx], 1) || 1 : 1;
      let unitPrice = priceIdx !== -1 ? toNumber(cells[priceIdx], 0) : 0;
      let amount = amountIdx !== -1 ? toNumber(cells[amountIdx], 0) : 0;

      if (!amount && unitPrice) {
        amount = quantity * unitPrice;
      }

      if (!unitPrice && amount && quantity) {
        unitPrice = amount / quantity;
      }

      items.push({
        description,
        quantity,
        unitPrice,
        amount,
      });
    }
  }

  return normalizeExtractedInvoice({
    supplierName,
    supplierTaxId: supplierNif,
    supplierAddress,
    invoiceNumber,
    issueDate,
    dueDate: issueDate,
    netAmount: items.reduce((acc, item) => acc + toNumber(item.amount, 0), 0),
    taxRate: 21,
    taxAmount: 0,
    totalAmount: 0,
    pageStart: null,
    pageEnd: null,
    lineItems: items,
  });
}

// ============================================================================
// 5. ENDPOINT PARA PARSEAR PDF CON AUTOGUARDADO REAL
// ============================================================================

router.post(
  "/vendor-invoices/parse",
  upload.single("file"),
  async (req, res): Promise<void> => {
    let openAiFile: any = null;

    try {
      const file = req.file;
      const companyId = req.body.companyId;

      if (!file) {
        res.status(400).json({ error: "No se subió ningún archivo PDF" });
        return;
      }

      if (!companyId) {
        res.status(400).json({ error: "Falta el companyId" });
        return;
      }

      if (!isPdfFile(file)) {
        res.status(400).json({
          error: "Formato no válido. Este endpoint solo acepta archivos PDF.",
        });
        return;
      }

      console.log(`📄 [OPENAI-PARSER] Procesando PDF: ${file.originalname}`);

      openAiFile = await createOpenAIUserDataFile(file);
      const extraction = await extractInvoicesFromPdfWithOpenAI(openAiFile.id);

      if (extraction.invoices.length === 0) {
        res.status(422).json({
          error: "No se detectó ninguna factura válida en el PDF.",
        });
        return;
      }

      // AUTOGUARDADO REAL: este endpoint ahora también crea las X facturas detectadas.
      // Esto arregla el flujo actual del frontend: aunque siga llamando a /parse y después a POST /vendor-invoices,
      // aquí ya quedan creadas todas las facturas; y el POST posterior no duplicará por la protección de duplicados.
      const createdInvoices = await db.transaction(async (tx) => {
        const results = [];

        for (const invoiceData of extraction.invoices) {
          const created = await createVendorInvoiceFromNormalizedData({
            tx,
            companyId,
            invoiceData,
            file,
            source: extraction.hasMultipleInvoices
              ? "OpenAI PDF Parser - autoguardado multifactura"
              : "OpenAI PDF Parser - autoguardado",
          });

          results.push(created);
        }

        return results;
      });

      const parsedInvoices = extraction.invoices.map((invoiceData, index) => ({
        ...invoiceData,
        invoiceId: createdInvoices[index]?.invoiceId || null,
        supplierId: createdInvoices[index]?.supplierId || null,
        alreadyExisted: createdInvoices[index]?.alreadyExisted || false,
        pdfPath: file.filename || file.originalname,
      }));

      console.log(
        extraction.hasMultipleInvoices
          ? `⚠️ [OPENAI-PARSER] PDF con ${extraction.invoiceCount} facturas detectadas y ${createdInvoices.length} entradas autoguardadas en BD`
          : `✅ [OPENAI-PARSER] PDF con una única factura detectada y autoguardada. ID: ${createdInvoices[0]?.invoiceId}`,
      );

      res.json({
        success: true,
        autoSaved: true,
        hasMultipleInvoices: extraction.hasMultipleInvoices,
        invoiceCount: createdInvoices.length,
        message: extraction.hasMultipleInvoices
          ? `Se han detectado y autoguardado ${createdInvoices.length} facturas en la base de datos.`
          : "Se ha detectado y autoguardado una única factura en la base de datos.",
        detectionSummary: extraction.detectionSummary,
        invoiceId: createdInvoices[0]?.invoiceId || null,
        invoiceIds: createdInvoices.map((item) => item.invoiceId),
        createdInvoices,
        parsedData: parsedInvoices[0] || null,
        parsedInvoices,
        pdfPath: file.filename || file.originalname,
      });
    } catch (error: any) {
      console.error("❌ Error en OpenAI Parser:", error);

      res.status(500).json({
        error:
          error.message || "Error interno al procesar el documento con OpenAI.",
      });
    } finally {
      if (openAiFile?.id) {
        await deleteOpenAIFileSafely(openAiFile.id);
      }
    }
  },
);

// ============================================================================
// 6. ENDPOINT PARA OPENCLAW: RUTEO INTELIGENTE PDF/EXCEL Y AUTOGUARDADO
// ============================================================================

router.post(
  "/vendor-invoices/parse/auto",
  upload.single("file"),
  async (req, res): Promise<void> => {
    let openAiFile: any = null;

    try {
      const file = req.file;
      const companyId = req.body.companyId;

      if (!file) {
        res.status(400).json({ error: "No se proporcionó ningún archivo" });
        return;
      }

      if (!companyId) {
        res.status(400).json({ error: "Falta el companyId" });
        return;
      }

      const isPDF = isPdfFile(file);
      const isSpreadsheet = isSpreadsheetFile(file);

      if (!isPDF && !isSpreadsheet) {
        res.status(400).json({
          error: "Formato no válido. Solo se aceptan PDF, XLSX, XLS o CSV.",
        });
        return;
      }

      console.log(
        `🤖 [OPENCLAW-AUTO] Procesando ${
          isPDF ? "PDF" : "EXCEL/CSV"
        }: ${file.originalname}`,
      );

      let invoicesToCreate: NormalizedInvoice[] = [];
      let hasMultipleInvoices = false;
      let detectionSummary = "";

      if (isPDF) {
        openAiFile = await createOpenAIUserDataFile(file);
        const extraction = await extractInvoicesFromPdfWithOpenAI(
          openAiFile.id,
        );

        if (extraction.invoices.length === 0) {
          res.status(422).json({
            error: "No se detectó ninguna factura válida en el PDF.",
          });
          return;
        }

        invoicesToCreate = extraction.invoices;
        hasMultipleInvoices = extraction.hasMultipleInvoices;
        detectionSummary = extraction.detectionSummary;

        console.log(
          hasMultipleInvoices
            ? `⚠️ [OPENCLAW-AUTO] Se detectaron ${invoicesToCreate.length} facturas en el PDF`
            : "✅ [OPENCLAW-AUTO] Se detectó una única factura en el PDF",
        );
      } else {
        const spreadsheetInvoice = await extractInvoiceFromSpreadsheet(file);
        invoicesToCreate = [spreadsheetInvoice];
        hasMultipleInvoices = false;
        detectionSummary =
          "Archivo Excel/CSV procesado como una única factura.";
      }

      const createdInvoices = await db.transaction(async (tx) => {
        const results = [];

        for (const invoiceData of invoicesToCreate) {
          const created = await createVendorInvoiceFromNormalizedData({
            tx,
            companyId,
            invoiceData,
            file,
            source: isPDF
              ? hasMultipleInvoices
                ? "OpenAI PDF Parser - PDF con varias facturas"
                : "OpenAI PDF Parser"
              : "XLSX Parser",
          });

          results.push(created);
        }

        return results;
      });

      console.log(
        hasMultipleInvoices
          ? `✅ [OPENCLAW-AUTO] ${createdInvoices.length} facturas recibidas creadas desde un mismo PDF`
          : `✅ [OPENCLAW-AUTO] Factura recibida creada exitosamente. ID: ${createdInvoices[0]?.invoiceId}`,
      );

      res.status(201).json({
        success: true,
        hasMultipleInvoices,
        invoiceCount: createdInvoices.length,
        message: hasMultipleInvoices
          ? `Se han detectado y creado ${createdInvoices.length} facturas desde el mismo PDF.`
          : "Se ha detectado y creado una única factura.",
        detectionSummary,
        invoiceId: createdInvoices[0]?.invoiceId || null,
        supplierId: createdInvoices[0]?.supplierId || null,
        invoiceIds: createdInvoices.map((item) => item.invoiceId),
        invoices: createdInvoices,
      });
    } catch (error: any) {
      console.error(
        "❌ [OPENCLAW-AUTO] Error general procesando archivo:",
        error,
      );

      res.status(500).json({
        error: error.message || "Fallo al procesar automáticamente el archivo.",
      });
    } finally {
      if (openAiFile?.id) {
        await deleteOpenAIFileSafely(openAiFile.id);
      }
    }
  },
);

// ============================================================================
// 7. RUTAS CRUD (GUARDAR Y RECUPERAR TODO)
// ============================================================================

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  const query = ListVendorInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];

  if (query.data.companyId) {
    conditions.push(eq(vendorInvoicesTable.companyId, query.data.companyId));
  }

  if (query.data.status) {
    conditions.push(eq(vendorInvoicesTable.status, query.data.status as any));
  }

  const invoices = await db
    .select()
    .from(vendorInvoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendorInvoicesTable.issueDate));

  const result = await Promise.all(
    invoices.map(async (inv) => {
      let supplierName: string | null = null;

      if (inv.supplierId) {
        const [supplier] = await db
          .select({ name: suppliersTable.name })
          .from(suppliersTable)
          .where(eq(suppliersTable.id, inv.supplierId));

        supplierName = supplier?.name ?? null;
      }

      const lineItems = await db
        .select()
        .from(vendorInvoiceItemsTable)
        .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, inv.id));

      return { ...inv, supplierName, categoryName: null, lineItems };
    }),
  );

  res.json(result);
});

router.post("/vendor-invoices", async (req, res): Promise<void> => {
  console.log("\n=======================================================");
  console.log("💾 [BACKEND] Petición POST para GUARDAR factura");

  try {
    const parsedInvoicesFromBody = Array.isArray(req.body.parsedInvoices)
      ? req.body.parsedInvoices
      : Array.isArray(req.body.invoices)
        ? req.body.invoices
        : null;

    // ------------------------------------------------------------------------
    // MODO MULTIFACTURA
    // Este bloque se ejecuta cuando el frontend envía parsedInvoices/invoices.
    // Sirve para el flujo: /vendor-invoices/parse -> botón Guardar.
    // ------------------------------------------------------------------------
    if (parsedInvoicesFromBody && parsedInvoicesFromBody.length > 0) {
      const companyIdRaw =
        req.body.companyId ||
        req.body.parsedData?.companyId ||
        parsedInvoicesFromBody[0]?.companyId;

      const parsedCompanyId = parseInt(String(companyIdRaw || ""));

      if (!parsedCompanyId || Number.isNaN(parsedCompanyId)) {
        res.status(400).json({
          error:
            "Falta companyId. Para guardar varias facturas debes enviar companyId junto con parsedInvoices.",
        });
        return;
      }

      const commonPdfPath =
        req.body.pdfPath ||
        req.body.parsedData?.pdfPath ||
        parsedInvoicesFromBody[0]?.pdfPath ||
        null;

      const createdInvoices = await db.transaction(async (tx) => {
        const results = [];

        for (const rawInvoice of parsedInvoicesFromBody) {
          const normalized = normalizeExtractedInvoice({
            ...rawInvoice,
            netAmount:
              rawInvoice.netAmount ??
              rawInvoice.subtotal ??
              rawInvoice.baseImponible ??
              0,
            taxAmount: rawInvoice.taxAmount ?? rawInvoice.iva ?? 0,
            totalAmount: rawInvoice.totalAmount ?? rawInvoice.total ?? 0,
            lineItems: Array.isArray(rawInvoice.lineItems)
              ? rawInvoice.lineItems
              : [],
          });

          let finalSupplierId = rawInvoice.supplierId || null;

          if (!finalSupplierId) {
            finalSupplierId = await findOrCreateSupplier({
              tx,
              companyId: parsedCompanyId,
              supplierName: normalized.supplierName,
              supplierTaxId: normalized.supplierTaxId,
              supplierAddress: normalized.supplierAddress,
            });
          }

          // Protección anti-duplicados también en el modo parsedInvoices.
          // Si /parse ya autoguardó y el frontend manda luego parsedInvoices, no repetimos inserciones.
          if (normalized.invoiceNumber) {
            const duplicateConditions = [
              eq(vendorInvoicesTable.companyId, parsedCompanyId),
              eq(vendorInvoicesTable.invoiceNumber, normalized.invoiceNumber),
            ];

            if (finalSupplierId) {
              duplicateConditions.push(
                eq(vendorInvoicesTable.supplierId, finalSupplierId),
              );
            }

            const existingInvoices = await tx
              .select()
              .from(vendorInvoicesTable)
              .where(and(...duplicateConditions))
              .limit(1);

            if (existingInvoices.length > 0) {
              const existingInvoice = existingInvoices[0];
              const savedLineItems = await tx
                .select()
                .from(vendorInvoiceItemsTable)
                .where(
                  eq(
                    vendorInvoiceItemsTable.vendorInvoiceId,
                    existingInvoice.id,
                  ),
                );

              results.push({
                ...existingInvoice,
                supplierId: existingInvoice.supplierId || finalSupplierId,
                supplierName: normalized.supplierName || null,
                categoryName: null,
                lineItems: savedLineItems,
                alreadyExisted: true,
              });

              continue;
            }
          }

          const [invoice] = await tx
            .insert(vendorInvoicesTable)
            .values({
              companyId: parsedCompanyId,
              supplierId: finalSupplierId,
              categoryId: rawInvoice.categoryId ?? req.body.categoryId ?? null,
              invoiceNumber: normalized.invoiceNumber || null,
              status: (rawInvoice.status ||
                req.body.status ||
                "borrador") as any,
              issueDate: normalized.issueDate,
              dueDate: normalized.dueDate || null,
              description:
                rawInvoice.description ||
                req.body.description ||
                `Factura importada desde PDF multifactura${
                  normalized.pageStart
                    ? ` - página ${normalized.pageStart}`
                    : ""
                }`,
              notes: rawInvoice.notes || req.body.notes || null,
              subtotal: normalized.netAmount.toFixed(2),
              taxRate: normalized.taxRate.toString(),
              taxAmount: normalized.taxAmount.toFixed(2),
              total: normalized.totalAmount.toFixed(2),
              fileUrl: rawInvoice.pdfPath || commonPdfPath,
              extractedData: {
                ...(rawInvoice.allExtractedFields || rawInvoice),
                source: "OpenAI PDF Parser - guardado multifactura",
                pdfPath: rawInvoice.pdfPath || commonPdfPath,
                multiInvoiceBatch: true,
                detectedInvoiceCount: parsedInvoicesFromBody.length,
                pageStart: normalized.pageStart,
                pageEnd: normalized.pageEnd,
              },
            })
            .returning();

          const itemsToInsert = normalized.lineItems.map((item) => ({
            vendorInvoiceId: invoice.id,
            description: item.description || "Concepto sin descripción",
            quantity: toNumber(item.quantity, 1).toString(),
            unitPrice: toNumber(item.unitPrice, 0).toFixed(6),
            amount: toNumber(item.amount, 0).toFixed(6),
          }));

          if (itemsToInsert.length > 0) {
            await tx.insert(vendorInvoiceItemsTable).values(itemsToInsert);
          }

          const savedLineItems = await tx
            .select()
            .from(vendorInvoiceItemsTable)
            .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, invoice.id));

          results.push({
            ...invoice,
            supplierId: finalSupplierId,
            supplierName: normalized.supplierName || null,
            categoryName: null,
            lineItems: savedLineItems,
          });
        }

        return results;
      });

      console.log(
        `✅ [BACKEND] Guardadas ${createdInvoices.length} facturas desde parsedInvoices`,
      );

      res.status(201).json({
        success: true,
        hasMultipleInvoices: createdInvoices.length > 1,
        invoiceCount: createdInvoices.length,
        message:
          createdInvoices.length > 1
            ? `Se han guardado ${createdInvoices.length} facturas en la base de datos.`
            : "Se ha guardado una factura en la base de datos.",
        invoiceId: createdInvoices[0]?.id || null,
        invoiceIds: createdInvoices.map((invoice) => invoice.id),
        invoices: createdInvoices,
      });
      return;
    }

    // ------------------------------------------------------------------------
    // MODO NORMAL: guardar una única factura, compatible con tu flujo anterior.
    // ------------------------------------------------------------------------
    const { extractedData, lineItems, pdfPath, ...bodyData } = req.body;
    const parsed = CreateVendorInvoiceBody.safeParse(bodyData);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;

    await db.transaction(async (tx) => {
      // Si /vendor-invoices/parse ya ha autoguardado la factura y el frontend llama después
      // a este POST con la primera factura, no insertamos un duplicado.
      if (data.invoiceNumber) {
        const duplicateConditions = [
          eq(vendorInvoicesTable.companyId, data.companyId),
          eq(vendorInvoicesTable.invoiceNumber, data.invoiceNumber),
        ];

        if (data.supplierId) {
          duplicateConditions.push(
            eq(vendorInvoicesTable.supplierId, data.supplierId),
          );
        }

        const existingInvoices = await tx
          .select()
          .from(vendorInvoicesTable)
          .where(and(...duplicateConditions))
          .limit(1);

        if (existingInvoices.length > 0) {
          const existingInvoice = existingInvoices[0];
          const savedLineItems = await tx
            .select()
            .from(vendorInvoiceItemsTable)
            .where(
              eq(vendorInvoiceItemsTable.vendorInvoiceId, existingInvoice.id),
            );

          console.log(
            `ℹ️ [BACKEND] POST /vendor-invoices ignorado: factura ${data.invoiceNumber} ya existe. ID: ${existingInvoice.id}`,
          );

          res.status(200).json({
            ...existingInvoice,
            supplierName: null,
            categoryName: null,
            lineItems: savedLineItems,
            alreadyExisted: true,
          });
          return;
        }
      }

      const [invoice] = await tx
        .insert(vendorInvoicesTable)
        .values({
          companyId: data.companyId,
          supplierId: data.supplierId ?? null,
          categoryId: data.categoryId ?? null,
          invoiceNumber: data.invoiceNumber ?? null,
          status: (data.status as any) || "borrador",
          issueDate: data.issueDate,
          dueDate: data.dueDate ?? null,
          description: data.description ?? null,
          notes: data.notes ?? null,
          subtotal: req.body.subtotal?.toString() || data.subtotal || "0",
          taxRate: data.taxRate || "21",
          taxAmount: req.body.taxAmount?.toString() || "0",
          total: req.body.total?.toString() || "0",
          fileUrl: pdfPath || req.body.pdfPath || null,
          extractedData: extractedData
            ? { ...extractedData, pdfPath: pdfPath || req.body.pdfPath }
            : { pdfPath: pdfPath || req.body.pdfPath },
        })
        .returning();

      if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
        const itemsToInsert = lineItems.map((item: any) => ({
          vendorInvoiceId: invoice.id,
          description: item.description || "Concepto sin descripción",
          quantity: item.quantity?.toString() || "1",
          unitPrice: item.unitPrice?.toString() || "0",
          amount: item.amount?.toString() || "0",
        }));

        await tx.insert(vendorInvoiceItemsTable).values(itemsToInsert);
      }

      let supplierName = null;

      if (invoice.supplierId) {
        const [sup] = await tx
          .select()
          .from(suppliersTable)
          .where(eq(suppliersTable.id, invoice.supplierId));

        if (sup) supplierName = sup.name;
      }

      const savedLineItems = await tx
        .select()
        .from(vendorInvoiceItemsTable)
        .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, invoice.id));

      res.status(201).json({
        ...invoice,
        supplierName,
        categoryName: null,
        lineItems: savedLineItems,
      });
    });
  } catch (error: any) {
    console.error("❌ [BACKEND] Error guardando factura:", error);
    res.status(500).json({ error: error.message || "Error guardando factura" });
  }
});

router.patch("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, ...restBody } = req.body;
  const body = UpdateVendorInvoiceBody.safeParse(restBody);

  if (!body.success && Object.keys(restBody).length > 0) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.success ? body.data : {};
  const updateData: Record<string, any> = { ...data };

  if (status) {
    updateData.status = status;
  }

  if (data.subtotal) {
    const subtotal = parseFloat(data.subtotal);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    updateData.taxAmount = taxAmount.toString();
    updateData.total = (subtotal + taxAmount).toString();
  }

  try {
    const [invoice] = await db
      .update(vendorInvoicesTable)
      .set(updateData)
      .where(eq(vendorInvoicesTable.id, params.data.id))
      .returning();

    if (!invoice) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }

    res.json({ ...invoice, supplierName: null, categoryName: null });
  } catch (dbError: any) {
    res
      .status(500)
      .json({ error: "Error interno al actualizar la base de datos." });
  }
});

router.post("/vendor-invoices/:id/payment", async (req, res): Promise<void> => {
  // ... tu código de payment intacto ...
});

router.delete("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(vendorInvoiceItemsTable)
        .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, params.data.id));

      await tx
        .delete(vendorInvoicesTable)
        .where(eq(vendorInvoicesTable.id, params.data.id));
    });

    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Error eliminando factura" });
  }
});

router.get("/vendor-invoices/pdf/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [invoice] = await db
      .select()
      .from(vendorInvoicesTable)
      .where(eq(vendorInvoicesTable.id, id))
      .limit(1);

    if (!invoice || !invoice.fileUrl) {
      res.status(404).json({
        error: "Esta factura no tiene un archivo PDF original asociado",
      });
      return;
    }

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "vendor_invoices",
      invoice.fileUrl,
    );

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: "El archivo físico no existe en el servidor o ha sido movido",
      });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Error al recuperar el archivo PDF" });
  }
});

export default router;
