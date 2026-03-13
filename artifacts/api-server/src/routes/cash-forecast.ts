import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, invoicesTable, vendorInvoicesTable, expensesTable, bankAccountsTable } from "@workspace/db";
import { GetCashForecastQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

interface ForecastAlert {
  type: string;
  message: string;
  weekStart: string;
}

router.get("/cash-forecast", async (req, res): Promise<void> => {
  const query = GetCashForecastQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const companyId = query.data.companyId;
  const weeksCount = query.data.weeks ?? 8;

  const accounts = companyId
    ? await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId))
    : await db.select().from(bankAccountsTable);

  const currentBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance), 0);

  const invoiceConditions = companyId ? eq(invoicesTable.companyId, companyId) : undefined;
  const allInvoices = await db.select().from(invoicesTable).where(invoiceConditions);

  const vendorConditions = companyId ? eq(vendorInvoicesTable.companyId, companyId) : undefined;
  const allVendorInvoices = await db.select().from(vendorInvoicesTable).where(vendorConditions);

  const expenseConditions = companyId ? eq(expensesTable.companyId, companyId) : undefined;
  const allExpenses = await db.select().from(expensesTable).where(expenseConditions);

  const weeks = [];
  let runningBalance = currentBalance;
  const today = new Date();

  for (let i = 0; i < weeksCount; i++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    let expectedIncome = 0;
    allInvoices.filter(inv =>
      inv.status !== "paid" && inv.status !== "draft" && inv.dueDate &&
      inv.dueDate >= weekStartStr && inv.dueDate <= weekEndStr
    ).forEach(inv => {
      expectedIncome += parseFloat(inv.total) - parseFloat(inv.paidAmount);
    });

    let expectedExpenses = 0;
    allVendorInvoices.filter(inv =>
      inv.status !== "paid" && inv.dueDate &&
      inv.dueDate >= weekStartStr && inv.dueDate <= weekEndStr
    ).forEach(inv => {
      expectedExpenses += parseFloat(inv.total) - parseFloat(inv.paidAmount);
    });

    allExpenses.filter(exp =>
      exp.status !== "paid" && exp.expenseDate >= weekStartStr && exp.expenseDate <= weekEndStr
    ).forEach(exp => {
      expectedExpenses += parseFloat(exp.total) - parseFloat(exp.paidAmount || "0");
    });

    runningBalance = runningBalance + expectedIncome - expectedExpenses;

    weeks.push({
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      expectedIncome: expectedIncome.toString(),
      expectedExpenses: expectedExpenses.toString(),
      projectedBalance: runningBalance.toString(),
    });
  }

  const alerts: ForecastAlert[] = [];
  weeks.forEach(week => {
    const balance = parseFloat(week.projectedBalance);
    if (balance < 0) {
      alerts.push({
        type: "danger",
        message: `Saldo negativo proyectado: ${balance.toFixed(2)}€`,
        weekStart: week.weekStart,
      });
    } else if (balance < 5000) {
      alerts.push({
        type: "warning",
        message: `Saldo bajo proyectado: ${balance.toFixed(2)}€`,
        weekStart: week.weekStart,
      });
    }
  });

  res.json({
    currentBalance: currentBalance.toString(),
    weeks,
    alerts,
  });
});

export default router;
