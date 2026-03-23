import { Router, type IRouter } from "express";
import { eq, and, notInArray } from "drizzle-orm";
import {
  db,
  invoicesTable,
  vendorInvoicesTable,
  expensesTable,
  bankAccountsTable,
  companiesTable,
  tasksTable,
  clientsTable,
  suppliersTable,
} from "@workspace/db";
import { GetDashboardQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

interface DueItem {
  type: string;
  id: number;
  description: string;
  amount: string;
  dueDate: string;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const query = GetDashboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const companyId = query.data.companyId;

  const accounts = companyId
    ? await db
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, companyId))
    : await db.select().from(bankAccountsTable);

  const totalBalance = accounts.reduce(
    (sum, acc) => sum + parseFloat(acc.currentBalance),
    0,
  );

  const invoiceConditions = companyId
    ? eq(invoicesTable.companyId, companyId)
    : undefined;
  const allInvoices = await db
    .select()
    .from(invoicesTable)
    .where(invoiceConditions);

  const pendingReceivables = allInvoices
    .filter((inv) => !["cobrada", "anulada", "borrador"].includes(inv.status))
    .reduce(
      (sum, inv) => sum + parseFloat(inv.total) - parseFloat(inv.paidAmount),
      0,
    );

  const today = new Date().toISOString().split("T")[0];
  const overdueInvoices = allInvoices.filter(
    (inv) =>
      !["cobrada", "anulada", "borrador"].includes(inv.status) &&
      inv.dueDate &&
      inv.dueDate < today,
  ).length;

  const vendorConditions = companyId
    ? eq(vendorInvoicesTable.companyId, companyId)
    : undefined;
  const allVendorInvoices = await db
    .select()
    .from(vendorInvoicesTable)
    .where(vendorConditions);

  const expenseConditions = companyId
    ? eq(expensesTable.companyId, companyId)
    : undefined;
  const allExpenses = await db
    .select()
    .from(expensesTable)
    .where(expenseConditions);

  const pendingPayables =
    allVendorInvoices
      .filter((inv) => !["pagada", "anulada", "borrador"].includes(inv.status))
      .reduce(
        (sum, inv) => sum + parseFloat(inv.total) - parseFloat(inv.paidAmount),
        0,
      ) +
    allExpenses
      .filter((exp) => exp.status !== "paid" && exp.status !== "pagado")
      .reduce(
        (sum, exp) =>
          sum + parseFloat(exp.total) - parseFloat(exp.paidAmount || "0"),
        0,
      );

  const overduePayables = allVendorInvoices.filter(
    (inv) =>
      !["pagada", "anulada", "borrador"].includes(inv.status) &&
      inv.dueDate &&
      inv.dueDate < today,
  ).length;

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const thisWeekDue: DueItem[] = [];
  allInvoices
    .filter(
      (inv) =>
        !["cobrada", "anulada", "borrador"].includes(inv.status) &&
        inv.dueDate &&
        inv.dueDate >= today &&
        inv.dueDate <= weekEndStr,
    )
    .forEach((inv) => {
      thisWeekDue.push({
        type: "receivable",
        id: inv.id,
        description: `Factura ${inv.invoiceNumber}`,
        amount: (parseFloat(inv.total) - parseFloat(inv.paidAmount)).toString(),
        dueDate: inv.dueDate!,
      });
    });

  // Filtrar facturas de proveedores
  allVendorInvoices
    .filter(
      (inv) =>
        !["pagada", "anulada", "borrador"].includes(inv.status) &&
        inv.dueDate &&
        inv.dueDate >= today &&
        inv.dueDate <= weekEndStr,
    )
    .forEach((inv) => {
      thisWeekDue.push({
        type: "payable",
        id: inv.id,
        description: `Factura proveedor ${inv.invoiceNumber || inv.id}`,
        amount: (parseFloat(inv.total) - parseFloat(inv.paidAmount)).toString(),
        dueDate: inv.dueDate!,
      });
    });

  thisWeekDue.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  const recentInvoices = allInvoices.slice(0, 5).map((inv) => ({
    ...inv,
    items: [] as {
      id: number;
      description: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      sortOrder: number;
    }[],
    clientName: null as string | null,
    companyName: null as string | null,
  }));

  for (const inv of recentInvoices) {
    if (inv.clientId) {
      const [client] = await db
        .select({ name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, inv.clientId));
      inv.clientName = client?.name ?? null;
    }
    const [company] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, inv.companyId));
    inv.companyName = company?.name ?? null;
  }

  const taskConditions = companyId
    ? and(eq(tasksTable.status, "pending"), eq(tasksTable.companyId, companyId))
    : eq(tasksTable.status, "pending");
  const pendingTasks = await db
    .select()
    .from(tasksTable)
    .where(taskConditions)
    .limit(10);

  const companies = await db.select().from(companiesTable);
  const balanceByCompany = await Promise.all(
    companies.map(async (company) => {
      const compAccounts = await db
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, company.id));
      const balance = compAccounts.reduce(
        (sum, acc) => sum + parseFloat(acc.currentBalance),
        0,
      );
      return {
        companyId: company.id,
        companyName: company.name,
        balance: balance.toString(),
      };
    }),
  );

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

router.get("/dashboard/debt-analysis", async (req, res): Promise<void> => {
  const query = GetDashboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const companyId = query.data.companyId;

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split("T")[0];

  // 1. CARGA RÁPIDA DE NOMBRES (Mapas en memoria para evitar múltiples queries)
  const allClients = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable);
  const clientMap = Object.fromEntries(allClients.map((c) => [c.id, c.name]));

  const allSuppliers = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name })
    .from(suppliersTable);
  const supplierMap = Object.fromEntries(
    allSuppliers.map((s) => [s.id, s.name]),
  );

  // 2. OBTENER FACTURAS PENDIENTES
  const salesConditions = companyId
    ? and(
        eq(invoicesTable.companyId, companyId),
        notInArray(invoicesTable.status, ["cobrada", "anulada", "borrador"]),
      )
    : notInArray(invoicesTable.status, ["cobrada", "anulada", "borrador"]);

  const unpaidSales = await db
    .select()
    .from(invoicesTable)
    .where(salesConditions);

  const vendorConditions = companyId
    ? and(
        eq(vendorInvoicesTable.companyId, companyId),
        notInArray(vendorInvoicesTable.status, [
          "pagada",
          "anulada",
          "borrador",
        ]),
      )
    : notInArray(vendorInvoicesTable.status, ["pagada", "anulada", "borrador"]);

  const unpaidPurchases = await db
    .select()
    .from(vendorInvoicesTable)
    .where(vendorConditions);

  // 3. ESTRUCTURAS DE RESULTADOS
  const agingReceivables = {
    noVencido: 0,
    dias30: 0,
    dias60: 0,
    dias90: 0,
    mas90: 0,
  };
  const agingPayables = {
    noVencido: 0,
    dias30: 0,
    dias60: 0,
    dias90: 0,
    mas90: 0,
  };
  const clientDebts: Record<number, number> = {};
  const supplierDebts: Record<number, number> = {};

  const alerts = {
    overdue: [] as any[],
    thisWeek: [] as any[],
    thisMonth: [] as any[],
  };

  const getDaysOverdue = (dueDate: string | null) => {
    if (!dueDate) return 0;
    const diffTime = today.getTime() - new Date(dueDate).getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // 4. PROCESAR VENTAS (COBROS)
  unpaidSales.forEach((inv) => {
    const pending = parseFloat(inv.total) - parseFloat(inv.paidAmount);
    if (pending <= 0) return;

    if (inv.clientId)
      clientDebts[inv.clientId] = (clientDebts[inv.clientId] || 0) + pending;

    const days = getDaysOverdue(inv.dueDate);
    if (days <= 0) agingReceivables.noVencido += pending;
    else if (days <= 30) agingReceivables.dias30 += pending;
    else if (days <= 60) agingReceivables.dias60 += pending;
    else if (days <= 90) agingReceivables.dias90 += pending;
    else agingReceivables.mas90 += pending;

    // Alertas visuales
    const item = {
      id: inv.id,
      type: "cobro",
      document: inv.invoiceNumber,
      entity: inv.clientId
        ? clientMap[inv.clientId] || "Desconocido"
        : "Desconocido",
      amount: pending,
      dueDate: inv.dueDate,
      daysOverdue: days,
    };

    if (inv.dueDate && inv.dueDate < todayStr) alerts.overdue.push(item);
    else if (
      inv.dueDate &&
      inv.dueDate >= todayStr &&
      inv.dueDate <= nextWeekStr
    )
      alerts.thisWeek.push(item);
    else if (
      inv.dueDate &&
      inv.dueDate > nextWeekStr &&
      inv.dueDate <= nextMonthStr
    )
      alerts.thisMonth.push(item);
  });

  // 5. PROCESAR COMPRAS (PAGOS)
  unpaidPurchases.forEach((inv) => {
    const pending = parseFloat(inv.total) - parseFloat(inv.paidAmount);
    if (pending <= 0) return;

    if (inv.supplierId)
      supplierDebts[inv.supplierId] =
        (supplierDebts[inv.supplierId] || 0) + pending;

    const days = getDaysOverdue(inv.dueDate);
    if (days <= 0) agingPayables.noVencido += pending;
    else if (days <= 30) agingPayables.dias30 += pending;
    else if (days <= 60) agingPayables.dias60 += pending;
    else if (days <= 90) agingPayables.dias90 += pending;
    else agingPayables.mas90 += pending;

    // Alertas visuales
    const item = {
      id: inv.id,
      type: "pago",
      document: inv.invoiceNumber || `ID-${inv.id}`,
      entity: inv.supplierId
        ? supplierMap[inv.supplierId] || "Desconocido"
        : "Desconocido",
      amount: pending,
      dueDate: inv.dueDate,
      daysOverdue: days,
    };

    if (inv.dueDate && inv.dueDate < todayStr) alerts.overdue.push(item);
    else if (
      inv.dueDate &&
      inv.dueDate >= todayStr &&
      inv.dueDate <= nextWeekStr
    )
      alerts.thisWeek.push(item);
    else if (
      inv.dueDate &&
      inv.dueDate > nextWeekStr &&
      inv.dueDate <= nextMonthStr
    )
      alerts.thisMonth.push(item);
  });

  // Ordenar alertas por fecha
  alerts.overdue.sort((a, b) => b.daysOverdue - a.daysOverdue); // Más días vencidos primero
  alerts.thisWeek.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  alerts.thisMonth.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  res.json({
    aging: { receivables: agingReceivables, payables: agingPayables },
    topDebtors: Object.entries(clientDebts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, amount]) => ({
        name: clientMap[parseInt(id)] || "Desconocido",
        amount,
      })),
    topCreditors: Object.entries(supplierDebts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, amount]) => ({
        name: supplierMap[parseInt(id)] || "Desconocido",
        amount,
      })),
    alerts,
    summary: {
      totalPendingReceivables: Object.values(clientDebts).reduce(
        (a, b) => a + b,
        0,
      ),
      totalPendingPayables: Object.values(supplierDebts).reduce(
        (a, b) => a + b,
        0,
      ),
    },
  });
});

export default router;
