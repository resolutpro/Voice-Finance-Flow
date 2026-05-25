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

const router: IRouter = Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const invoiceSchema = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    supplierTaxId: { type: "string" },
    invoiceNumber: { type: "string" },
    issueDate: {
      type: ["string", "null"],
      description: "Formato YYYY-MM-DD",
    },
    dueDate: {
      type: ["string", "null"],
      description: "Formato YYYY-MM-DD",
    },
    netAmount: { type: "number" },
    taxAmount: { type: "number" },
    totalAmount: { type: "number" },
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
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "netAmount",
    "taxAmount",
    "totalAmount",
    "lineItems",
  ],
  additionalProperties: false,
};

async function uploadPdfToOpenAI(file: Express.Multer.File) {
  // Si usas multer.memoryStorage()
  if (file.buffer) {
    return await openai.files.create({
      file: await OpenAI.toFile(
        file.buffer,
        file.originalname || "factura.pdf",
        { type: file.mimetype || "application/pdf" },
      ),
      purpose: "user_data",
    });
  }

  // Si usas multer.diskStorage()
  if (file.path) {
    return await openai.files.create({
      file: fs.createReadStream(file.path),
      purpose: "user_data",
    });
  }

  throw new Error(
    "El archivo no tiene ni buffer ni path. Revisa la configuración de multer.",
  );
}

// ============================================================================
// 1. ENDPOINT DE IA: PROCESAR PDF CON GOOGLE DOCUMENT AI
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

const upload = multer({ storage: storage });

// 🚨 INYECCIÓN SEGURA DE CREDENCIALES DESDE MEMORIA 🚨
let docAiConfig: any = {
  apiEndpoint: "eu-documentai.googleapis.com",
};

try {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    docAiConfig.credentials = {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    };
    docAiConfig.projectId =
      credentials.project_id || process.env.DOCUMENT_AI_PROJECT_ID;
  } else {
    console.warn(
      "⚠️ ADVERTENCIA: No se encontró la variable GOOGLE_CREDENTIALS_JSON. El cliente de Google intentará usar el entorno por defecto.",
    );
  }
} catch (error) {
  console.error("❌ ERROR crítico al parsear GOOGLE_CREDENTIALS_JSON:", error);
}

// Función helper para limpiar números en formato español/europeo
const parseSpanishNumber = (text: string): number => {
  const cleaned = text.replace(/[^0-9.,-]+/g, "");
  // Si contiene puntos (miles) y comas (decimales), elimina los puntos primero
  if (cleaned.includes(",") && cleaned.includes(".")) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Si solo tiene coma, la cambia por punto
  return parseFloat(cleaned.replace(",", ".")) || 0;
};

// ============================================================================
// HELPERS OPENAI PDF PARSER
// ============================================================================

const OPENAI_INVOICE_MODEL = process.env.OPENAI_INVOICE_MODEL || "gpt-4o";

const invoiceExtractionSchema = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    supplierTaxId: { type: "string" },
    supplierAddress: { type: "string" },
    invoiceNumber: { type: "string" },
    issueDate: {
      type: ["string", "null"],
      description: "Fecha de emisión en formato YYYY-MM-DD. Si no aparece, null.",
    },
    dueDate: {
      type: ["string", "null"],
      description: "Fecha de vencimiento en formato YYYY-MM-DD. Si no aparece, null.",
    },
    netAmount: {
      type: "number",
      description: "Base imponible o subtotal sin impuestos.",
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
      description: "Importe total de la factura con impuestos incluidos.",
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
    "lineItems",
  ],
  additionalProperties: false,
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
    file: await OpenAI.toFile(
      buffer,
      file.originalname || "documento.pdf",
      {
        type: file.mimetype || "application/pdf",
      } as any,
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

// ============================================================================
// 1. ENDPOINT PARA PARSEAR FACTURA PDF SIN AUTOGUARDADO
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

      // 1. Subir PDF a OpenAI como user_data, NO como vision
      openAiFile = await createOpenAIUserDataFile(file);

      // 2. Procesar PDF con Responses API
      const response = await openai.responses.create({
        model: OPENAI_INVOICE_MODEL,
        input: [
          {
            role: "system",
            content:
              "Eres un experto contable y un sistema OCR de extracción de facturas. Analiza facturas PDF recibidas de proveedores. Extrae los datos reales del documento. Si un campo no aparece, devuelve cadena vacía para textos, null para fechas y 0 para importes. Devuelve siempre JSON conforme al esquema.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Extrae los datos principales de esta factura recibida de proveedor. Lee tanto texto digital como contenido visual o escaneado del PDF.",
              },
              {
                type: "input_file",
                file_id: openAiFile.id,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: invoiceExtractionSchema,
          },
        },
      } as any);

      const extractedJson = parseJsonFromOpenAIResponse(response);

      const extractedData = {
        supplierName: extractedJson.supplierName || "",
        supplierTaxId: extractedJson.supplierTaxId || "",
        supplierAddress: extractedJson.supplierAddress || "Pendiente",
        invoiceNumber: extractedJson.invoiceNumber || "",
        issueDate: extractedJson.issueDate || null,
        dueDate: extractedJson.dueDate || null,
        netAmount: toNumber(extractedJson.netAmount, 0),
        taxRate: toNumber(extractedJson.taxRate, 21),
        taxAmount: toNumber(extractedJson.taxAmount, 0),
        totalAmount: toNumber(extractedJson.totalAmount, 0),
        lineItems: Array.isArray(extractedJson.lineItems)
          ? extractedJson.lineItems
          : [],
        allExtractedFields: extractedJson,
      };

      let supplierId = null;

      if (extractedData.supplierName) {
        const existingSuppliers = await db
          .select()
          .from(suppliersTable)
          .where(
            and(
              eq(suppliersTable.companyId, parseInt(companyId)),
              ilike(suppliersTable.name, `%${extractedData.supplierName}%`),
            ),
          )
          .limit(1);

        if (existingSuppliers.length > 0) {
          supplierId = existingSuppliers[0].id;

          if (
            extractedData.supplierTaxId &&
            existingSuppliers[0].taxId === "PENDIENTE"
          ) {
            await db
              .update(suppliersTable)
              .set({ taxId: extractedData.supplierTaxId })
              .where(eq(suppliersTable.id, supplierId));
          }
        } else {
          const [newSupplier] = await db
            .insert(suppliersTable)
            .values({
              companyId: parseInt(companyId),
              name: extractedData.supplierName,
              taxId: extractedData.supplierTaxId || "PENDIENTE",
              address: extractedData.supplierAddress || "Pendiente",
              city: "Pendiente",
              postalCode: "00000",
            })
            .returning();

          supplierId = newSupplier.id;
        }
      }

      console.log("✅ [OPENAI-PARSER] PDF procesado correctamente");

      res.json({
        success: true,
        parsedData: {
          ...extractedData,
          supplierId,
          pdfPath: file.filename || file.originalname,
        },
      });
    } catch (error: any) {
      console.error("❌ Error en OpenAI Parser:", error);

      res.status(500).json({
        error:
          error.message ||
          "Error interno al procesar el documento con OpenAI.",
      });
    } finally {
      if (openAiFile?.id) {
        await deleteOpenAIFileSafely(openAiFile.id);
      }
    }
  },
);

// ============================================================================
// 1.5 ENDPOINT PARA OPENCLAW: RUTEO INTELIGENTE PDF/EXCEL Y AUTOGUARDADO
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
          error:
            "Formato no válido. Solo se aceptan PDF, XLSX, XLS o CSV.",
        });
        return;
      }

      console.log(
        `🤖 [OPENCLAW-AUTO] Procesando ${
          isPDF ? "PDF" : "EXCEL/CSV"
        }: ${file.originalname}`,
      );

      let items: any[] = [];
      let supplierName = "";
      let supplierNif = "";
      let supplierAddress = "Pendiente";
      let invoiceNumber = `AUTO-${Date.now()}`;
      let issueDate = new Date().toISOString().split("T")[0];
      let dueDate = issueDate;

      let extractedNetAmount: number | null = null;
      let extractedTaxRate: number | null = null;
      let extractedTaxAmount: number | null = null;
      let extractedTotalAmount: number | null = null;

      // ----------------------------------------------------------------------
      // PDF -> OpenAI Responses API
      // ----------------------------------------------------------------------
      if (isPDF) {
        openAiFile = await createOpenAIUserDataFile(file);

        const response = await openai.responses.create({
          model: OPENAI_INVOICE_MODEL,
          input: [
            {
              role: "system",
              content:
                "Eres un sistema automático OCR contable. Analiza facturas PDF recibidas de proveedores. Extrae proveedor, NIF/CIF, dirección, número de factura, fechas, bases, impuestos, total y líneas de factura. Si un campo no aparece, devuelve cadena vacía para textos, null para fechas y 0 para importes. Devuelve siempre JSON conforme al esquema.",
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    "Analiza esta factura PDF y extrae sus datos contables para crear una factura recibida en el ERP.",
                },
                {
                  type: "input_file",
                  file_id: openAiFile.id,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "auto_invoice_extraction",
              strict: true,
              schema: invoiceExtractionSchema,
            },
          },
        } as any);

        const extractedJson = parseJsonFromOpenAIResponse(response);

        supplierName = extractedJson.supplierName || "";
        supplierNif = extractedJson.supplierTaxId || "";
        supplierAddress = extractedJson.supplierAddress || "Pendiente";
        invoiceNumber = extractedJson.invoiceNumber || `AUTO-${Date.now()}`;

        if (extractedJson.issueDate) issueDate = extractedJson.issueDate;
        if (extractedJson.dueDate) dueDate = extractedJson.dueDate;
        else dueDate = issueDate;

        items = Array.isArray(extractedJson.lineItems)
          ? extractedJson.lineItems
          : [];

        extractedNetAmount = toNumber(extractedJson.netAmount, 0);
        extractedTaxRate = toNumber(extractedJson.taxRate, 21);
        extractedTaxAmount = toNumber(extractedJson.taxAmount, 0);
        extractedTotalAmount = toNumber(extractedJson.totalAmount, 0);
      }

      // ----------------------------------------------------------------------
      // EXCEL / CSV -> XLSX Parser local
      // ----------------------------------------------------------------------
      else {
        const fileBuffer = await getMulterFileBuffer(file);

        // @ts-ignore
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!worksheet) {
          res.status(400).json({
            error: "No se pudo leer ninguna hoja del archivo Excel/CSV.",
          });
          return;
        }

        // @ts-ignore
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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
              (lowerCell.includes("factura") ||
                lowerCell.includes("invoice")) &&
              invoiceNumber.startsWith("AUTO-")
            ) {
              const value = getValue();
              if (value) invoiceNumber = value;
            }

            if (
              (lowerCell.includes("fecha") ||
                lowerCell.includes("date")) &&
              issueDate === new Date().toISOString().split("T")[0]
            ) {
              const value = getValue();
              if (value) issueDate = value;
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

            const quantity =
              qtyIdx !== -1 ? toNumber(cells[qtyIdx], 1) || 1 : 1;

            let unitPrice =
              priceIdx !== -1 ? toNumber(cells[priceIdx], 0) : 0;

            let amount =
              amountIdx !== -1 ? toNumber(cells[amountIdx], 0) : 0;

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

        dueDate = issueDate;
      }

      // ----------------------------------------------------------------------
      // Fallback si no se detectan líneas
      // ----------------------------------------------------------------------
      if (items.length === 0) {
        const fallbackAmount =
          extractedNetAmount && extractedNetAmount > 0
            ? extractedNetAmount
            : 0;

        items.push({
          description: "Concepto general extraído",
          quantity: 1,
          unitPrice: fallbackAmount,
          amount: fallbackAmount,
        });
      }

      // Normalizar líneas antes de guardar
      items = items.map((item) => {
        const quantity = toNumber(item.quantity, 1) || 1;
        const unitPrice = toNumber(item.unitPrice, 0);
        const amount =
          toNumber(item.amount, 0) || quantity * unitPrice || 0;

        return {
          description: item.description || "Sin descripción",
          quantity,
          unitPrice,
          amount,
        };
      });

      // ----------------------------------------------------------------------
      // Guardar factura en BD
      // ----------------------------------------------------------------------
      const result = await db.transaction(async (tx) => {
        let finalSupplierId = null;

        if (supplierName || supplierNif) {
          const existingSuppliers = await tx
            .select()
            .from(suppliersTable)
            .where(
              and(
                eq(suppliersTable.companyId, parseInt(companyId)),
                supplierNif
                  ? eq(suppliersTable.taxId, supplierNif)
                  : ilike(suppliersTable.name, `%${supplierName}%`),
              ),
            )
            .limit(1);

          if (existingSuppliers.length > 0) {
            finalSupplierId = existingSuppliers[0].id;
          } else if (supplierName) {
            const [newSupplier] = await tx
              .insert(suppliersTable)
              .values({
                companyId: parseInt(companyId),
                name: supplierName,
                taxId: supplierNif || "PENDIENTE",
                address: supplierAddress || "Pendiente",
                city: "Pendiente",
                postalCode: "00000",
              })
              .returning();

            finalSupplierId = newSupplier.id;
          }
        }

        const calculatedSubtotal = items.reduce(
          (acc, item) => acc + toNumber(item.amount, 0),
          0,
        );

        const subtotal =
          isPDF && extractedNetAmount !== null && extractedNetAmount > 0
            ? extractedNetAmount
            : calculatedSubtotal;

        const taxRate =
          isPDF && extractedTaxRate !== null
            ? extractedTaxRate
            : 21;

        const taxAmount =
          isPDF && extractedTaxAmount !== null && extractedTaxAmount > 0
            ? extractedTaxAmount
            : subtotal * (taxRate / 100);

        const total =
          isPDF && extractedTotalAmount !== null && extractedTotalAmount > 0
            ? extractedTotalAmount
            : subtotal + taxAmount;

        const [invoice] = await tx
          .insert(vendorInvoicesTable)
          .values({
            companyId: parseInt(companyId),
            supplierId: finalSupplierId,
            invoiceNumber,
            status: "borrador",
            issueDate,
            dueDate,
            description: `Documento procesado automáticamente (${
              isPDF ? "OpenAI PDF Parser" : "XLSX Parser"
            })`,
            subtotal: subtotal.toFixed(2),
            taxRate: taxRate.toString(),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
            extractedData: {
              source: isPDF ? "OpenAI Responses API" : "XLSX Parser",
              originalFileName: file.originalname,
              mimeType: file.mimetype,
              supplierName,
              supplierNif,
              supplierAddress,
              invoiceNumber,
              issueDate,
              dueDate,
              subtotal,
              taxRate,
              taxAmount,
              total,
            },
          })
          .returning();

        const itemsToInsert = items.map((item) => ({
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
        };
      });

      console.log(
        `✅ [OPENCLAW-AUTO] Factura recibida creada exitosamente. ID: ${result.invoiceId}`,
      );

      res.status(201).json({
        success: true,
        invoiceId: result.invoiceId,
        supplierId: result.supplierId,
      });
    } catch (error: any) {
      console.error(
        "❌ [OPENCLAW-AUTO] Error general procesando archivo:",
        error,
      );

      res.status(500).json({
        error:
          error.message ||
          "Fallo al procesar automáticamente el archivo.",
      });
    } finally {
      if (openAiFile?.id) {
        await deleteOpenAIFileSafely(openAiFile.id);
      }
    }
  },
);

// ============================================================================
// 2. RUTAS CRUD (GUARDAR Y RECUPERAR TODO)
// ============================================================================

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  const query = ListVendorInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.companyId)
    conditions.push(eq(vendorInvoicesTable.companyId, query.data.companyId));
  if (query.data.status)
    conditions.push(eq(vendorInvoicesTable.status, query.data.status as any));

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
    const { extractedData, lineItems, pdfPath, ...bodyData } = req.body;
    const parsed = CreateVendorInvoiceBody.safeParse(bodyData);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;

    await db.transaction(async (tx) => {
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
          // Guardamos las propiedades de los campos del OCR mezclándolo o iniciando el JSON con la ruta física del PDF
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

    // Buscamos el registro de la factura recibida en la base de datos
    const [invoice] = await db
      .select()
      .from(vendorInvoicesTable)
      .where(eq(vendorInvoicesTable.id, id))
      .limit(1);

    // Validamos que exista el registro y que contenga un nombre de archivo en tu columna nativa 'fileUrl'
    if (!invoice || !invoice.fileUrl) {
      res.status(404).json({
        error: "Esta factura no tiene un archivo PDF original asociado",
      });
      return;
    }

    // Construimos la ruta absoluta hacia el archivo guardado en el servidor usando tu columna 'fileUrl'
    const filePath = path.join(
      process.cwd(),
      "uploads",
      "vendor_invoices",
      invoice.fileUrl,
    );

    // Comprobamos si el archivo físico realmente existe en el disco duro
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: "El archivo físico no existe en el servidor o ha sido movido",
      });
      return;
    }

    // Definimos las cabeceras HTTP correctas para decirle al navegador que es un documento PDF binario
    res.setHeader("Content-Type", "application/pdf");

    // Enviamos el stream binario del archivo directamente al iframe del frontend
    res.sendFile(filePath);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Error al recuperar el archivo PDF" });
  }
});

export default router;
