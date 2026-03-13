import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, vendorInvoicesTable, suppliersTable, categoriesTable, bankAccountsTable, cashMovementsTable } from "@workspace/db";
import {
  ListVendorInvoicesQueryParams, CreateVendorInvoiceBody,
  UpdateVendorInvoiceParams, UpdateVendorInvoiceBody,
  RegisterVendorPaymentParams, RegisterVendorPaymentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  const query = ListVendorInvoicesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [];
  if (query.data.companyId) conditions.push(eq(vendorInvoicesTable.companyId, query.data.companyId));
  if (query.data.status) conditions.push(eq(vendorInvoicesTable.status, query.data.status));

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
  const parsed = CreateVendorInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const subtotal = parseFloat(data.subtotal || "0");
  const taxRate = parseFloat(data.taxRate || "21");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const [invoice] = await db.insert(vendorInvoicesTable).values({
    companyId: data.companyId,
    supplierId: data.supplierId ?? null,
    categoryId: data.categoryId ?? null,
    invoiceNumber: data.invoiceNumber ?? null,
    status: data.status || "pending",
    issueDate: data.issueDate,
    dueDate: data.dueDate ?? null,
    description: data.description ?? null,
    notes: data.notes ?? null,
    subtotal: subtotal.toString(),
    taxRate: taxRate.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
  }).returning();

  res.status(201).json({ ...invoice, supplierName: null, categoryName: null });
});

router.patch("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateVendorInvoiceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const data = body.data;
  const updateData: Record<string, unknown> = { ...data };

  if (data.subtotal) {
    const subtotal = parseFloat(data.subtotal);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = subtotal * (taxRate / 100);
    updateData.taxAmount = taxAmount.toString();
    updateData.total = (subtotal + taxAmount).toString();
  }

  const [invoice] = await db.update(vendorInvoicesTable).set(updateData).where(eq(vendorInvoicesTable.id, params.data.id)).returning();
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...invoice, supplierName: null, categoryName: null });
});

router.post("/vendor-invoices/:id/payment", async (req, res): Promise<void> => {
  const params = RegisterVendorPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = RegisterVendorPaymentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const paymentAmount = parseFloat(body.data.amount);

  const [invoice] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, params.data.id));
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }

  const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.data.bankAccountId));
  if (!account) { res.status(400).json({ error: "Cuenta bancaria no encontrada" }); return; }
  if (account.companyId !== invoice.companyId) {
    res.status(400).json({ error: "La cuenta bancaria debe pertenecer a la misma empresa que la factura" });
    return;
  }

  await db.transaction(async (tx) => {
    const newPaid = parseFloat(invoice.paidAmount) + paymentAmount;
    const total = parseFloat(invoice.total);
    const newStatus = newPaid >= total ? "paid" : "partially_paid";

    await tx.update(vendorInvoicesTable).set({ paidAmount: newPaid.toString(), status: newStatus }).where(eq(vendorInvoicesTable.id, params.data.id));

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
    await tx.update(bankAccountsTable).set({ currentBalance: newBalance.toString() }).where(eq(bankAccountsTable.id, body.data.bankAccountId));
  });

  const [updated] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, params.data.id));
  res.json({ ...updated, supplierName: null, categoryName: null });
});

export default router;
