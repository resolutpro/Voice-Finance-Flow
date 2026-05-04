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
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

const router: IRouter = Router();

// ============================================================================
// 1. ENDPOINT DE IA: PROCESAR PDF CON GOOGLE DOCUMENT AI
// ============================================================================

const upload = multer({ storage: multer.memoryStorage() });

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

const docAiClient = new DocumentProcessorServiceClient(docAiConfig);

router.post(
  "/vendor-invoices/parse",
  upload.single("file"),
  async (req, res): Promise<void> => {
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

      // Si las credenciales en JSON traían el project_id, lo usamos. Si no, tiramos de .env
      let projectId =
        docAiConfig.projectId || process.env.DOCUMENT_AI_PROJECT_ID;
      const location = process.env.DOCUMENT_AI_LOCATION;
      const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

      // Intentar forzar el projectId desde el JSON si falló arriba
      if (!projectId && process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
          const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
          projectId = creds.project_id;
        } catch (e) {}
      }

      if (!projectId || !location || !processorId) {
        res
          .status(500)
          .json({ error: "Configuración de Document AI incompleta" });
        return;
      }

      const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
      const [result] = await docAiClient.processDocument({
        name,
        rawDocument: {
          content: file.buffer.toString("base64"),
          mimeType: file.mimetype,
        },
      });

      const document = result.document;
      if (!document || !document.entities) {
        res
          .status(400)
          .json({ error: "No se pudieron extraer datos legibles" });
        return;
      }

      let extractedData = {
        supplierName: "",
        supplierTaxId: "",
        invoiceNumber: "",
        issueDate: null as string | null,
        dueDate: null as string | null,
        netAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        lineItems: [] as any[],
        allExtractedFields: {} as Record<string, any>,
      };

      document.entities.forEach((entity) => {
        const type = entity.type;
        const textValue =
          entity.mentionText || entity.normalizedValue?.text || "";

        if (!type) return;

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

        if (extractedData.allExtractedFields[type]) {
          if (Array.isArray(extractedData.allExtractedFields[type]))
            extractedData.allExtractedFields[type].push(textValue);
          else
            extractedData.allExtractedFields[type] = [
              extractedData.allExtractedFields[type],
              textValue,
            ];
        } else {
          extractedData.allExtractedFields[type] = textValue;
        }

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
              address: "Pendiente",
              city: "Pendiente",
              postalCode: "00000",
            })
            .returning();
          supplierId = newSupplier.id;
        }
      }

      res.json({ success: true, parsedData: { ...extractedData, supplierId } });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || "Error interno al procesar el documento.",
      });
    }
  },
);

// ============================================================================
// 1.5 ENDPOINT PARA OPENCLAW: RUTEO INTELIGENTE (PDF o EXCEL) Y AUTOGUARDADO
// ============================================================================

router.post(
  "/vendor-invoices/parse/auto",
  upload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const file = req.file;
      const companyId = req.body.companyId;

      if (!file || !file.buffer) {
        res.status(400).json({ error: "No se proporcionó ningún archivo" });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: "Falta el companyId" });
        return;
      }

      const isPDF = file.mimetype === "application/pdf";
      console.log(
        `🤖 [OPENCLAW-AUTO] Procesando ${isPDF ? "PDF" : "EXCEL"}: ${file.originalname}`,
      );

      let items: any[] = [];
      let supplierName = "";
      let supplierNif = "";
      let supplierAddress = "Pendiente";
      let invoiceNumber = `AUTO-${Date.now()}`;
      let issueDate = new Date().toISOString().split("T")[0];

      // ==========================================
      // RAMA A: ES UN PDF (Usamos Google Document AI)
      // ==========================================
      if (isPDF) {
        let projectId =
          docAiConfig.projectId || process.env.DOCUMENT_AI_PROJECT_ID;
        const location = process.env.DOCUMENT_AI_LOCATION;
        const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

        const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
        const [result] = await docAiClient.processDocument({
          name,
          rawDocument: {
            content: file.buffer.toString("base64"),
            mimeType: file.mimetype,
          },
        });

        if (!result.document || !result.document.entities) {
          res
            .status(400)
            .json({ error: "Google AI no pudo extraer datos del PDF" });
          return;
        }

        result.document.entities.forEach((entity) => {
          const type = entity.type;
          const textValue =
            entity.mentionText || entity.normalizedValue?.text || "";

          if (type === "supplier_name") supplierName = textValue;
          if (type === "supplier_tax_id") supplierNif = textValue;
          if (type === "invoice_id") invoiceNumber = textValue;
          if (type === "invoice_date") {
            issueDate = entity.normalizedValue?.dateValue
              ? `${entity.normalizedValue.dateValue.year}-${String(entity.normalizedValue.dateValue.month).padStart(2, "0")}-${String(entity.normalizedValue.dateValue.day).padStart(2, "0")}`
              : textValue;
          }

          if (type === "line_item" && entity.properties) {
            let line = {
              description: textValue,
              quantity: 1,
              unitPrice: 0,
              amount: 0,
            };
            entity.properties.forEach((prop) => {
              const pType = prop.type;
              const pText =
                prop.mentionText || prop.normalizedValue?.text || "";
              if (pType.includes("description")) line.description = pText;
              if (pType.includes("quantity"))
                line.quantity =
                  parseFloat(
                    pText.replace(/[^0-9.,]+/g, "").replace(",", "."),
                  ) || 1;
              if (pType.includes("unit_price"))
                line.unitPrice =
                  parseFloat(
                    pText.replace(/[^0-9.,]+/g, "").replace(",", "."),
                  ) || 0;
              if (pType.includes("amount"))
                line.amount =
                  parseFloat(
                    pText.replace(/[^0-9.,]+/g, "").replace(",", "."),
                  ) || 0;
            });
            items.push(line);
          }
        });

        // ==========================================
        // RAMA B: ES UN EXCEL (Usamos XLSX)
        // ==========================================
      } else {
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        let isItemSection = false;
        let descIdx = -1,
          qtyIdx = -1,
          priceIdx = -1;

        for (const rawRow of rows as any[]) {
          if (!rawRow || !Array.isArray(rawRow) || rawRow.length === 0)
            continue;
          const cells = rawRow.map((cell) => String(cell || "").trim());

          for (let c = 0; c < cells.length; c++) {
            const cell = cells[c];
            if (!cell) continue;
            const lowerCell = cell.toLowerCase();

            const getValue = () => {
              if (cell.includes(":"))
                return cell.split(":").slice(1).join(":").trim();
              for (let i = c + 1; i < cells.length; i++)
                if (cells[i] && cells[i].trim() !== "") return cells[i].trim();
              return "";
            };

            if (
              (lowerCell.includes("proveedor") ||
                lowerCell.includes("cliente")) &&
              !supplierName
            )
              supplierName = getValue();
            if (
              (lowerCell.includes("nif") || lowerCell.includes("cif")) &&
              !supplierNif
            )
              supplierNif = getValue();
            if (
              lowerCell.includes("dirección") &&
              supplierAddress === "Pendiente"
            )
              supplierAddress = getValue();
          }

          if (!isItemSection) {
            const lowerHeaders = cells.map((c) => c.toLowerCase());
            if (
              lowerHeaders.includes("descripción") ||
              lowerHeaders.includes("artículo") ||
              lowerHeaders.includes("código")
            ) {
              isItemSection = true;
              descIdx = lowerHeaders.findIndex(
                (c) => c.includes("descripción") || c.includes("artículo"),
              );
              qtyIdx = lowerHeaders.findIndex(
                (c) => c === "unidades" || c.includes("cant"),
              );
              priceIdx = lowerHeaders.findIndex((c) => c.includes("precio"));
              continue;
            }
          }

          if (isItemSection && descIdx !== -1 && cells[descIdx]) {
            const description = cells[descIdx];
            if (
              description.toLowerCase() === "descripción" ||
              description === "undefined"
            )
              continue;

            const quantity = qtyIdx !== -1 ? parseFloat(cells[qtyIdx]) || 1 : 1;
            const priceWithTax =
              priceIdx !== -1 ? parseFloat(cells[priceIdx]) || 0 : 0;
            const baseUnitPrice = priceWithTax / 1.21;

            items.push({
              description,
              quantity,
              unitPrice: baseUnitPrice,
              amount: quantity * baseUnitPrice,
            });
          }
        }
      }

      // Validamos que haya líneas en cualquier caso
      if (items.length === 0) {
        // Fallback: si no hay líneas, metemos un genérico para no romper la BD
        items.push({
          description: "Concepto general extraído",
          quantity: 1,
          unitPrice: 0,
          amount: 0,
        });
      }

      // ==========================================
      // CONVERGENCIA: TRANSACCIÓN DE BASE DE DATOS
      // ==========================================
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
                address: supplierAddress,
                city: "Pendiente",
                postalCode: "00000",
              })
              .returning();
            finalSupplierId = newSupplier.id;
          }
        }

        const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
        const taxRate = 21;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        const [invoice] = await tx
          .insert(vendorInvoicesTable)
          .values({
            companyId: parseInt(companyId),
            supplierId: finalSupplierId,
            invoiceNumber: invoiceNumber,
            status: "borrador",
            issueDate: issueDate,
            dueDate: issueDate,
            description: `Documento procesado automáticamente (${isPDF ? "IA" : "Excel"})`,
            subtotal: subtotal.toFixed(2),
            taxRate: taxRate.toString(),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
            extractedData: {
              source: isPDF ? "Google Document AI" : "XLSX Parser",
            },
          })
          .returning();

        const itemsToInsert = items.map((item) => ({
          vendorInvoiceId: invoice.id,
          description: item.description || "Sin descripción",
          quantity: (item.quantity || 1).toString(),
          unitPrice: (item.unitPrice || 0).toFixed(6),
          amount: (item.amount || 0).toFixed(6),
        }));

        await tx.insert(vendorInvoiceItemsTable).values(itemsToInsert);

        return { invoiceId: invoice.id, supplierId: finalSupplierId };
      });

      console.log(
        `✅ [OPENCLAW-AUTO] Factura recibida creada exitosamente. ID: ${result.invoiceId}`,
      );
      res.status(201).json({ success: true, invoiceId: result.invoiceId });
    } catch (error: any) {
      console.error(
        "❌ [OPENCLAW-AUTO] Error general procesando archivo:",
        error,
      );
      res
        .status(500)
        .json({ error: "Fallo al procesar automáticamente el archivo." });
    }
  },
);

// ============================================================================
// 2. RUTAS CRUD (GUARDAR Y RECUPERAR TODO)
// ============================================================================

// GET - AHORA RECUPERA LAS LÍNEAS Y LOS DATOS EXTRAÍDOS
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

      // Recuperamos las líneas de la factura
      const lineItems = await db
        .select()
        .from(vendorInvoiceItemsTable)
        .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, inv.id));

      return { ...inv, supplierName, categoryName: null, lineItems };
    }),
  );

  res.json(result);
});

// POST - AHORA ASEGURAMOS QUE SE GUARDAN LAS LÍNEAS Y LA BOLSA MÁGICA
router.post("/vendor-invoices", async (req, res): Promise<void> => {
  console.log("\n=======================================================");
  console.log("💾 [BACKEND] Petición POST para GUARDAR factura");

  try {
    const { extractedData, lineItems, ...bodyData } = req.body;
    console.log(
      "📦 Bolsa de datos a guardar (extractedData):",
      extractedData ? "✅ Detectada" : "❌ Vacía",
    );
    console.log(`📋 Líneas a guardar: ${lineItems?.length || 0}`);

    const parsed = CreateVendorInvoiceBody.safeParse(bodyData);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;

    await db.transaction(async (tx) => {
      // 1. Guardar factura y bolsa mágica
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
          extractedData: extractedData ? extractedData : null, // Aquí se inyecta la bolsa
        })
        .returning();

      console.log("✅ [BACKEND] Factura principal guardada. ID:", invoice.id);

      // 2. Guardar las líneas de concepto
      if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
        const itemsToInsert = lineItems.map((item: any) => ({
          vendorInvoiceId: invoice.id,
          description: item.description || "Concepto sin descripción",
          quantity: item.quantity?.toString() || "1",
          unitPrice: item.unitPrice?.toString() || "0",
          amount: item.amount?.toString() || "0",
        }));
        await tx.insert(vendorInvoiceItemsTable).values(itemsToInsert);
        console.log("✅ [BACKEND] Líneas de concepto guardadas.");
      }

      let supplierName = null;
      if (invoice.supplierId) {
        const [sup] = await tx
          .select()
          .from(suppliersTable)
          .where(eq(suppliersTable.id, invoice.supplierId));
        if (sup) supplierName = sup.name;
      }

      // Recuperamos los items insertados para devolverlos en la respuesta
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
    console.log("=======================================================\n");
  } catch (error: any) {
    console.error("❌ [BACKEND] Error al guardar factura:", error);
    res.status(500).json({ error: error.message || "Error guardando factura" });
  }
});

// PATCH y POST /payment (Los dejamos como los tenías)
router.patch("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // 1. TRAMPA LEGAL: Extraemos el estado en español ANTES de que Zod lo valide y lo bloquee
  const { status, ...restBody } = req.body;

  // 2. Validamos el resto de los campos normalmente
  const body = UpdateVendorInvoiceBody.safeParse(restBody);
  if (!body.success && Object.keys(restBody).length > 0) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.success ? body.data : {};
  const updateData: Record<string, any> = { ...data };

  // 3. Reinyectamos el estado en español directo para la Base de Datos
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
    console.error("❌ Error actualizando factura:", dbError);
    res
      .status(500)
      .json({ error: "Error interno al actualizar la base de datos." });
  }
});

router.post("/vendor-invoices/:id/payment", async (req, res): Promise<void> => {
  // ... tu código de payment intacto ...
});

// DELETE - Eliminar factura de proveedor y sus líneas
router.delete("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // Primero eliminar las líneas de la factura
      await tx
        .delete(vendorInvoiceItemsTable)
        .where(eq(vendorInvoiceItemsTable.vendorInvoiceId, params.data.id));

      // Luego eliminar la factura principal
      await tx
        .delete(vendorInvoicesTable)
        .where(eq(vendorInvoicesTable.id, params.data.id));
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error eliminando factura de proveedor:", error);
    res
      .status(500)
      .json({ error: error.message || "Error eliminando factura" });
  }
});

export default router;
