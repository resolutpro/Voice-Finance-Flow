import { Router, type IRouter } from "express";
import { eq, desc, sql, and, like } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, clientsTable, companiesTable, bankAccountsTable, cashMovementsTable } from "@workspace/db";

const router: IRouter = Router();

async function getInvoiceWithItems(invoiceId: number) {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return null;

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId)).orderBy(invoiceItemsTable.sortOrder);

  let clientName: string | null = null;
  if (invoice.clientId) {
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, invoice.clientId));
    clientName = client?.name ?? null;
  }

  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, invoice.companyId));

  return { ...invoice, items, clientName, companyName: company?.name ?? null };
}

router.get("/invoices/next-number", async (req, res): Promise<void> => {
  const companyId = parseInt(req.query.companyId as string, 10);
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.companyId, companyId), like(invoicesTable.invoiceNumber, `${prefix}%`)));

  const nextNum = (Number(result?.count ?? 0) + 1).toString().padStart(3, "0");
  res.json({ invoiceNumber: `${prefix}${nextNum}` });
});

router.get("/invoices", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  const status = req.query.status as string | undefined;
  const clientId = req.query.clientId ? parseInt(req.query.clientId as string, 10) : undefined;

  const conditions = [];
  if (companyId) conditions.push(eq(invoicesTable.companyId, companyId));
  if (status) conditions.push(eq(invoicesTable.status, status));
  if (clientId) conditions.push(eq(invoicesTable.clientId, clientId));

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoicesTable.issueDate));

  const result = await Promise.all(invoices.map(async (inv) => {
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id)).orderBy(invoiceItemsTable.sortOrder);
    let clientName: string | null = null;
    if (inv.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, inv.clientId));
      clientName = client?.name ?? null;
    }
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, inv.companyId));
    return { ...inv, items, clientName, companyName: company?.name ?? null };
  }));

  res.json(result);
});

router.post("/invoices", async (req, res): Promise<void> => {
  const { items, ...invoiceData } = req.body;
  let subtotal = 0;
  const processedItems = (items || []).map((item: any, idx: number) => {
    const qty = parseFloat(item.quantity || "1");
    const price = parseFloat(item.unitPrice || "0");
    const amount = qty * price;
    subtotal += amount;
    return { ...item, quantity: qty.toString(), unitPrice: price.toString(), amount: amount.toString(), sortOrder: idx };
  });

  const taxRate = parseFloat(invoiceData.taxRate || "21");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const [invoice] = await db.insert(invoicesTable).values({
    ...invoiceData,
    subtotal: subtotal.toString(),
    taxRate: taxRate.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
    status: invoiceData.status || "draft",
  }).returning();

  if (processedItems.length > 0) {
    await db.insert(invoiceItemsTable).values(processedItems.map((item: any) => ({
      ...item,
      invoiceId: invoice.id,
    })));
  }

  const result = await getInvoiceWithItems(invoice.id);
  res.status(201).json(result);
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const result = await getInvoiceWithItems(id);
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { items, ...invoiceData } = req.body;

  if (items) {
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));

    let subtotal = 0;
    const processedItems = items.map((item: any, idx: number) => {
      const qty = parseFloat(item.quantity || "1");
      const price = parseFloat(item.unitPrice || "0");
      const amount = qty * price;
      subtotal += amount;
      return { ...item, invoiceId: id, quantity: qty.toString(), unitPrice: price.toString(), amount: amount.toString(), sortOrder: idx };
    });

    const taxRate = parseFloat(invoiceData.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    await db.update(invoicesTable).set({
      ...invoiceData,
      subtotal: subtotal.toString(),
      taxRate: taxRate.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
    }).where(eq(invoicesTable.id, id));

    if (processedItems.length > 0) {
      await db.insert(invoiceItemsTable).values(processedItems);
    }
  } else {
    await db.update(invoicesTable).set(invoiceData).where(eq(invoicesTable.id, id));
  }

  const result = await getInvoiceWithItems(id);
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.json({ success: true });
});

router.patch("/invoices/:id/status", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.update(invoicesTable).set({ status: req.body.status }).where(eq(invoicesTable.id, id));
  const result = await getInvoiceWithItems(id);
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

router.post("/invoices/:id/payment", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { amount, bankAccountId, date } = req.body;
  const paymentAmount = parseFloat(amount);

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }

  const newPaid = parseFloat(invoice.paidAmount) + paymentAmount;
  const total = parseFloat(invoice.total);
  const newStatus = newPaid >= total ? "paid" : "partially_paid";

  await db.update(invoicesTable).set({ paidAmount: newPaid.toString(), status: newStatus }).where(eq(invoicesTable.id, id));

  await db.insert(cashMovementsTable).values({
    bankAccountId,
    type: "income",
    amount: paymentAmount.toString(),
    description: `Cobro factura ${invoice.invoiceNumber}`,
    movementDate: date || new Date().toISOString().split("T")[0],
    invoiceId: id,
  });

  const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
  if (account) {
    const newBalance = parseFloat(account.currentBalance) + paymentAmount;
    await db.update(bankAccountsTable).set({ currentBalance: newBalance.toString() }).where(eq(bankAccountsTable.id, bankAccountId));
  }

  const result = await getInvoiceWithItems(id);
  res.json(result);
});

export default router;
