import { Router, type IRouter } from "express";
import { eq, desc, and, ilike } from "drizzle-orm";
import {
  db,
  vendorInvoicesTable,
  suppliersTable,
  categoriesTable,
  bankAccountsTable,
  cashMovementsTable,
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
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

const router: IRouter = Router();

// ============================================================================
// 1. ENDPOINT DE IA: PROCESAR PDF CON GOOGLE DOCUMENT AI
// ============================================================================

const upload = multer({ storage: multer.memoryStorage() });
const docAiClient = new DocumentProcessorServiceClient({
  apiEndpoint: "eu-documentai.googleapis.com", // Forzamos la zona europea
});

router.post(
  "/vendor-invoices/parse",
  upload.single("file"),
  async (req, res): Promise<void> => {
    console.log("\n=======================================================");
    console.log(
      "🚀 [BACKEND] Petición POST recibida en /vendor-invoices/parse",
    );

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

      const projectId = process.env.DOCUMENT_AI_PROJECT_ID;
      const location = process.env.DOCUMENT_AI_LOCATION;
      const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

      if (!projectId || !location || !processorId) {
        res
          .status(500)
          .json({
            error:
              "Configuración de Document AI incompleta en el servidor (.env)",
          });
        return;
      }

      const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
      console.log("🧠 [BACKEND] Llamando a Google Document AI en Europa...");

      const [result] = await docAiClient.processDocument({
        name,
        rawDocument: {
          content: file.buffer.toString("base64"),
          mimeType: file.mimetype,
        },
      });

      console.log("✅ [BACKEND] Respuesta de Google AI recibida con éxito.");

      const document = result.document;
      if (!document || !document.entities) {
        res
          .status(400)
          .json({
            error: "No se pudieron extraer datos legibles del documento.",
          });
        return;
      }

      console.log(
        `📊 [BACKEND] Google extrajo ${document.entities.length} entidades. Estructurando datos...`,
      );

      let extractedData = {
        supplierName: "",
        supplierTaxId: "",
        invoiceNumber: "",
        issueDate: null as string | null,
        dueDate: null as string | null,
        netAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        lineItems: [] as any[], // Array de productos/servicios
        allExtractedFields: {} as Record<string, any>, // La bolsa de datos extra
      };

      document.entities.forEach((entity) => {
        const type = entity.type;
        const textValue =
          entity.mentionText || entity.normalizedValue?.text || "";

        if (!type) return;

        // === CASO ESPECIAL: LÍNEAS DE FACTURA ===
        if (type === "line_item" && entity.properties) {
          let line = {
            description: textValue,
            quantity: 1,
            unitPrice: 0,
            amount: 0,
          };

          entity.properties.forEach((prop) => {
            const pType = prop.type;
            const pText = prop.mentionText || prop.normalizedValue?.text || "";
            if (pType.includes("description")) line.description = pText;
            if (pType.includes("quantity"))
              line.quantity =
                parseFloat(pText.replace(/[^0-9.,]+/g, "").replace(",", ".")) ||
                1;
            if (pType.includes("unit_price"))
              line.unitPrice =
                parseFloat(pText.replace(/[^0-9.,]+/g, "").replace(",", ".")) ||
                0;
            if (pType.includes("amount"))
              line.amount =
                parseFloat(pText.replace(/[^0-9.,]+/g, "").replace(",", ".")) ||
                0;
          });

          extractedData.lineItems.push(line);
          return;
        }

        if (!textValue) return;

        // === GUARDAR EN LA BOLSA DE DATOS EXTRA ===
        if (extractedData.allExtractedFields[type]) {
          if (Array.isArray(extractedData.allExtractedFields[type])) {
            extractedData.allExtractedFields[type].push(textValue);
          } else {
            extractedData.allExtractedFields[type] = [
              extractedData.allExtractedFields[type],
              textValue,
            ];
          }
        } else {
          extractedData.allExtractedFields[type] = textValue;
        }

        // === ASIGNACIÓN A CAMPOS CRÍTICOS ===
        switch (type) {
          case "supplier_name":
            extractedData.supplierName = textValue;
            break;
          case "supplier_tax_id":
            extractedData.supplierTaxId = textValue;
            break;
          case "invoice_id":
            extractedData.invoiceNumber = textValue;
            break;
          case "invoice_date":
            extractedData.issueDate = entity.normalizedValue?.dateValue
              ? `${entity.normalizedValue.dateValue.year}-${String(entity.normalizedValue.dateValue.month).padStart(2, "0")}-${String(entity.normalizedValue.dateValue.day).padStart(2, "0")}`
              : textValue;
            break;
          case "due_date":
            extractedData.dueDate = entity.normalizedValue?.dateValue
              ? `${entity.normalizedValue.dateValue.year}-${String(entity.normalizedValue.dateValue.month).padStart(2, "0")}-${String(entity.normalizedValue.dateValue.day).padStart(2, "0")}`
              : textValue;
            break;
          case "net_amount":
            extractedData.netAmount = parseFloat(
              textValue.replace(/[^0-9.,-]+/g, "").replace(",", "."),
            );
            break;
          case "total_tax_amount":
            extractedData.taxAmount = parseFloat(
              textValue.replace(/[^0-9.,-]+/g, "").replace(",", "."),
            );
            break;
          case "total_amount":
            extractedData.totalAmount = parseFloat(
              textValue.replace(/[^0-9.,-]+/g, "").replace(",", "."),
            );
            break;
        }
      });

      let supplierId = null;
      if (extractedData.supplierName) {
        console.log(
          `🔎 [BACKEND] Buscando proveedor '${extractedData.supplierName}' en BD para empresa ${companyId}...`,
        );
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
          console.log(`   - ✅ Encontrado: ID ${supplierId}`);
          // Si no tenía CIF guardado, se lo actualizamos
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
          console.log("   - ❌ No encontrado. Creando nuevo proveedor...");
          const [newSupplier] = await db
            .insert(suppliersTable)
            .values({
              companyId: parseInt(companyId),
              name: extractedData.supplierName,
              taxId: extractedData.supplierTaxId || "PENDIENTE",
              address: "Pendiente de actualizar",
              city: "Pendiente",
              postalCode: "00000",
            })
            .returning();
          supplierId = newSupplier.id;
          console.log(`   - ✅ Creado nuevo proveedor con ID: ${supplierId}`);
        }
      }

      res.json({
        success: true,
        message: "Factura analizada",
        parsedData: { ...extractedData, supplierId },
      });
      console.log("=======================================================\n");
    } catch (error: any) {
      console.error("❌ [BACKEND] Error en OCR:", error.message);
      if (error.statusDetails && error.statusDetails.length > 0) {
        console.error(
          JSON.stringify(error.statusDetails[0].fieldViolations, null, 2),
        );
      }
      res
        .status(500)
        .json({
          error: error.message || "Error interno al procesar el documento.",
        });
    }
  },
);

// ============================================================================
// 2. RUTAS CRUD ESTÁNDAR
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
      let categoryName: string | null = null;
      if (inv.categoryId) {
        const [cat] = await db
          .select({ name: categoriesTable.name })
          .from(categoriesTable)
          .where(eq(categoriesTable.id, inv.categoryId));
        categoryName = cat?.name ?? null;
      }
      return { ...inv, supplierName, categoryName };
    }),
  );

  res.json(result);
});

router.post("/vendor-invoices", async (req, res): Promise<void> => {
  const parsed = CreateVendorInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const subtotal = parseFloat(data.subtotal || "0");
  const taxRate = parseFloat(data.taxRate || "21");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const [invoice] = await db
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
      subtotal: subtotal.toString(),
      taxRate: taxRate.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      // Para simplificar esta etapa de integración, guardaremos el extractedData si viaja en un campo 'notes' stringificado temporal,
      // u obviaremos su guardado crudo hasta que actualicemos tu API-ZOD
    })
    .returning();

  res.status(201).json({ ...invoice, supplierName: null, categoryName: null });
});

router.patch("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateVendorInvoiceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.data;
  const updateData: Record<string, unknown> = { ...data };

  if (data.subtotal) {
    const subtotal = parseFloat(data.subtotal);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    updateData.taxAmount = taxAmount.toString();
    updateData.total = (subtotal + taxAmount).toString();
  }

  const [invoice] = await db
    .update(vendorInvoicesTable)
    .set(updateData)
    .where(eq(vendorInvoicesTable.id, params.data.id))
    .returning();
  if (!invoice) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...invoice, supplierName: null, categoryName: null });
});

router.post("/vendor-invoices/:id/payment", async (req, res): Promise<void> => {
  const params = RegisterVendorPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RegisterVendorPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const paymentAmount = parseFloat(body.data.amount);

  const [invoice] = await db
    .select()
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.id, params.data.id));
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
    res
      .status(400)
      .json({
        error:
          "La cuenta bancaria debe pertenecer a la misma empresa que la factura",
      });
    return;
  }

  await db.transaction(async (tx) => {
    const newPaid = parseFloat(invoice.paidAmount) + paymentAmount;
    const total = parseFloat(invoice.total);
    const newStatus = newPaid >= total ? "pagada" : "parcialmente_pagada";

    await tx
      .update(vendorInvoicesTable)
      .set({ paidAmount: newPaid.toString(), status: newStatus as any })
      .where(eq(vendorInvoicesTable.id, params.data.id));

    await tx.insert(cashMovementsTable).values({
      companyId: invoice.companyId,
      bankAccountId: body.data.bankAccountId,
      type: "expense",
      amount: (-paymentAmount).toString(),
      description: `Pago factura ${invoice.invoiceNumber || "proveedor"}`,
      movementDate: body.data.date || new Date().toISOString().split("T")[0],
      vendorInvoiceId: params.data.id,
    });

    const newBalance = parseFloat(account.currentBalance) - paymentAmount;
    await tx
      .update(bankAccountsTable)
      .set({ currentBalance: newBalance.toString() })
      .where(eq(bankAccountsTable.id, body.data.bankAccountId));
  });

  const [updated] = await db
    .select()
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.id, params.data.id));
  res.json({ ...updated, supplierName: null, categoryName: null });
});

export default router;
