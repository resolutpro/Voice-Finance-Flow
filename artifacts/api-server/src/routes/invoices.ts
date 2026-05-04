import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, desc, and, ilike } from "drizzle-orm";
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
                postalCode: extractedPostalCode || "",
              })
              .returning();
            finalClientId = newClient.id;
          }
        }

        // B. Calcular Totales de la factura
        const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
        const taxRate = 21; // 21% fijo
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        // C. Crear la Factura Emitida
        const [invoice] = await tx
          .insert(invoicesTable)
          .values({
            companyId: parseInt(companyId),
            clientId: finalClientId,
            type: "invoice",
            status: "borrador",
            issueDate: new Date().toISOString().split("T")[0],
            concept: "Facturación de albarán automático",
            // SOLUCIÓN: Forzamos la precisión a 2 decimales para satisfacer a Postgres
            subtotal: subtotal.toFixed(2),
            taxRate: taxRate.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
          })
          .returning();

        // D. Insertar las Líneas (Items)
        const itemsToInsert = items.map((item) => ({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toFixed(6), // 6 decimales de precisión
          amount: item.amount.toFixed(6),
        }));

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
