import { Router, type IRouter } from "express";
import { eq, sql, lte, gte, and, ne } from "drizzle-orm";
import { db, invoicesTable, vendorInvoicesTable, expensesTable, bankAccountsTable, companiesTable, tasksTable, clientsTable, invoiceItemsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;

  const accounts = companyId
    ? await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId))
    : await db.select().from(bankAccountsTable);

  const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance), 0);

  const invoiceConditions = companyId ? eq(invoicesTable.companyId, companyId) : undefined;
  const allInvoices = await db.select().from(invoicesTable).where(invoiceConditions);

  const pendingReceivables = allInvoices
    .filter(inv => inv.status !== "paid" && inv.status !== "draft")
    .reduce((sum, inv) => sum + parseFloat(inv.total) - parseFloat(inv.paidAmount), 0);

  const today = new Date().toISOString().split("T")[0];
  const overdueInvoices = allInvoices.filter(inv =>
    inv.status !== "paid" && inv.status !== "draft" && inv.dueDate && inv.dueDate < today
  ).length;

  const vendorConditions = companyId ? eq(vendorInvoicesTable.companyId, companyId) : undefined;
  const allVendorInvoices = await db.select().from(vendorInvoicesTable).where(vendorConditions);

  const expenseConditions = companyId ? eq(expensesTable.companyId, companyId) : undefined;
  const allExpenses = await db.select().from(expensesTable).where(expenseConditions);

  const pendingPayables = allVendorInvoices
    .filter(inv => inv.status !== "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total) - parseFloat(inv.paidAmount), 0)
    + allExpenses
      .filter(exp => exp.status !== "paid")
      .reduce((sum, exp) => sum + parseFloat(exp.total) - parseFloat(exp.paidAmount || "0"), 0);

  const overduePayables = allVendorInvoices.filter(inv =>
    inv.status !== "paid" && inv.dueDate && inv.dueDate < today
  ).length;

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const thisWeekDue: any[] = [];
  allInvoices.filter(inv => inv.status !== "paid" && inv.dueDate && inv.dueDate >= today && inv.dueDate <= weekEndStr).forEach(inv => {
    thisWeekDue.push({ type: "receivable", id: inv.id, description: `Factura ${inv.invoiceNumber}`, amount: (parseFloat(inv.total) - parseFloat(inv.paidAmount)).toString(), dueDate: inv.dueDate! });
  });
  allVendorInvoices.filter(inv => inv.status !== "paid" && inv.dueDate && inv.dueDate >= today && inv.dueDate <= weekEndStr).forEach(inv => {
    thisWeekDue.push({ type: "payable", id: inv.id, description: `Factura proveedor ${inv.invoiceNumber || inv.id}`, amount: (parseFloat(inv.total) - parseFloat(inv.paidAmount)).toString(), dueDate: inv.dueDate! });
  });

  const recentInvoices = allInvoices.slice(0, 5).map(inv => ({
    ...inv, items: [], clientName: null, companyName: null
  }));

  for (const inv of recentInvoices) {
    if (inv.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, inv.clientId));
      inv.clientName = client?.name ?? null;
    }
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, inv.companyId));
    inv.companyName = company?.name ?? null;
  }

  const taskConditions = companyId ? and(eq(tasksTable.status, "pending"), eq(tasksTable.companyId, companyId)) : eq(tasksTable.status, "pending");
  const pendingTasks = await db.select().from(tasksTable).where(taskConditions).limit(10);

  const companies = await db.select().from(companiesTable);
  const balanceByCompany = await Promise.all(companies.map(async (company) => {
    const compAccounts = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.companyId, company.id));
    const balance = compAccounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance), 0);
    return { companyId: company.id, companyName: company.name, balance: balance.toString() };
  }));

  res.json({
    totalBalance: totalBalance.toString(),
    pendingReceivables: pendingReceivables.toString(),
    pendingPayables: pendingPayables.toString(),
    overdueInvoices,
    overduePayables,
    thisWeekDue,
    recentInvoices,
    pendingTasks,
    balanceByCompany,
  });
});

export default router;
