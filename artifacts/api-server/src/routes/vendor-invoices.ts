import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, vendorInvoicesTable, suppliersTable, categoriesTable, bankAccountsTable, cashMovementsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  const status = req.query.status as string | undefined;

  const conditions = [];
  if (companyId) conditions.push(eq(vendorInvoicesTable.companyId, companyId));
  if (status) conditions.push(eq(vendorInvoicesTable.status, status));

  const invoices = await db
    .select()
    .from(vendorInvoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendorInvoicesTable.issueDate));

  const result = await Promise.all(invoices.map(async (inv) => {
    let supplierName: string | null = null;
    if (inv.supplierId) {
      const [supplier] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, inv.supplierId));
      supplierName = supplier?.name ?? null;
    }
    let categoryName: string | null = null;
    if (inv.categoryId) {
      const [cat] = await db.select({ name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, inv.categoryId));
      categoryName = cat?.name ?? null;
    }
    return { ...inv, supplierName, categoryName };
  }));

  res.json(result);
});

router.post("/vendor-invoices", async (req, res): Promise<void> => {
  const data = req.body;
  const subtotal = parseFloat(data.subtotal || "0");
  const taxRate = parseFloat(data.taxRate || "21");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const [invoice] = await db.insert(vendorInvoicesTable).values({
    ...data,
    subtotal: subtotal.toString(),
    taxRate: taxRate.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
    status: data.status || "pending",
  }).returning();

  res.status(201).json({ ...invoice, supplierName: null, categoryName: null });
});

router.patch("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const data = req.body;

  if (data.subtotal) {
    const subtotal = parseFloat(data.subtotal);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    data.taxAmount = taxAmount.toString();
    data.total = total.toString();
  }

  const [invoice] = await db.update(vendorInvoicesTable).set(data).where(eq(vendorInvoicesTable.id, id)).returning();
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...invoice, supplierName: null, categoryName: null });
});

router.post("/vendor-invoices/:id/payment", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { amount, bankAccountId, date } = req.body;
  const paymentAmount = parseFloat(amount);

  const [invoice] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }

  const newPaid = parseFloat(invoice.paidAmount) + paymentAmount;
  const total = parseFloat(invoice.total);
  const newStatus = newPaid >= total ? "paid" : "partially_paid";

  await db.update(vendorInvoicesTable).set({ paidAmount: newPaid.toString(), status: newStatus }).where(eq(vendorInvoicesTable.id, id));

  await db.insert(cashMovementsTable).values({
    bankAccountId,
    type: "expense",
    amount: (-paymentAmount).toString(),
    description: `Pago factura ${invoice.invoiceNumber || "proveedor"}`,
    movementDate: date || new Date().toISOString().split("T")[0],
    vendorInvoiceId: id,
  });

  const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
  if (account) {
    const newBalance = parseFloat(account.currentBalance) - paymentAmount;
    await db.update(bankAccountsTable).set({ currentBalance: newBalance.toString() }).where(eq(bankAccountsTable.id, bankAccountId));
  }

  const [updated] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, id));
  res.json({ ...updated, supplierName: null, categoryName: null });
});

export default router;
