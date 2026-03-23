import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  invoicesTable,
  vendorInvoicesTable,
  expensesTable,
  bankAccountsTable,
  recurringCommitmentsTable,
} from "@workspace/db";
import { GetCashForecastQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

interface ForecastAlert {
  type: string;
  message: string;
  weekStart: string;
}
interface DetailItem {
  type: string;
  description: string;
  amount: string;
  date: string;
}

// Función mejorada, robusta y a prueba de mayúsculas/minúsculas para calcular recurrencias
function getRecurringOccurrencesInPeriod(
  commitment: any,
  periodStart: Date,
  periodEnd: Date,
) {
  const occurrences: { date: string; amount: number }[] = [];
  if (!commitment.active || !commitment.nextDueDate) return occurrences;

  let currentDate = new Date(commitment.nextDueDate);
  // TRUCO PRO: Fijamos la hora a mediodía para evitar saltos de día por cambios de hora de verano (DST)
  currentDate.setHours(12, 0, 0, 0);

  const baseAmount = parseFloat(commitment.amount || "0");

  // Normalizamos el string de frecuencia (minúsculas, sin espacios extra)
  const freq = (commitment.frequency || "").toLowerCase().trim();

  // Si el compromiso tiene fecha límite (endDate), la respetamos
  const endDate = commitment.endDate
    ? new Date(commitment.endDate)
    : new Date("2099-12-31");
  endDate.setHours(23, 59, 59, 999);

  // Filtro de seguridad
  const validFreqs = [
    "semanal",
    "mensual",
    "ultimo_dia_habil_mes",
    "bimensual",
    "trimestral",
    "impuestos_trimestrales",
    "semestral",
    "anual",
    "impuestos_anuales",
  ];

  if (!validFreqs.includes(freq)) {
    // Si la frecuencia es rarísima o no existe, solo la apuntamos si cae exacta en el periodo
    if (
      currentDate >= periodStart &&
      currentDate <= periodEnd &&
      currentDate <= endDate
    ) {
      occurrences.push({
        date: currentDate.toISOString().split("T")[0],
        amount: baseAmount,
      });
    }
    return occurrences;
  }

  // Motor de proyección temporal
  while (currentDate <= periodEnd && currentDate <= endDate) {
    // Si la ocurrencia cae DENTRO del mes/semana que estamos evaluando, lo guardamos para el front
    if (currentDate >= periodStart) {
      occurrences.push({
        date: currentDate.toISOString().split("T")[0],
        amount: baseAmount,
      });
    }

    // Avanzamos el reloj a la SIGUIENTE ocurrencia
    if (freq === "semanal") {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (freq === "mensual" || freq === "ultimo_dia_habil_mes") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else if (freq === "bimensual") {
      currentDate.setMonth(currentDate.getMonth() + 2);
    } else if (freq === "trimestral" || freq === "impuestos_trimestrales") {
      currentDate.setMonth(currentDate.getMonth() + 3);
    } else if (freq === "semestral") {
      currentDate.setMonth(currentDate.getMonth() + 6);
    } else if (freq === "anual" || freq === "impuestos_anuales") {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    } else {
      break; // Seguro por si acaso
    }
  }

  return occurrences;
}

router.get("/cash-forecast", async (req, res): Promise<void> => {
  const query = GetCashForecastQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const companyId = query.data.companyId;
  const periodsCount = query.data.weeks ?? 8;
  const interval = (req.query as any).interval || "week";

  // 1. Datos Brutos
  const accounts = companyId
    ? await db
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, companyId))
    : await db.select().from(bankAccountsTable);
  const currentBalance = accounts.reduce(
    (sum, acc) => sum + parseFloat(acc.currentBalance),
    0,
  );

  const allInvoices = await db
    .select()
    .from(invoicesTable)
    .where(companyId ? eq(invoicesTable.companyId, companyId) : undefined);
  const allVendorInvoices = await db
    .select()
    .from(vendorInvoicesTable)
    .where(
      companyId ? eq(vendorInvoicesTable.companyId, companyId) : undefined,
    );
  const allExpenses = await db
    .select()
    .from(expensesTable)
    .where(companyId ? eq(expensesTable.companyId, companyId) : undefined);

  // Recurrentes ACTIVOS
  const allRecurring = await db
    .select()
    .from(recurringCommitmentsTable)
    .where(
      companyId
        ? and(
            eq(recurringCommitmentsTable.companyId, companyId),
            eq(recurringCommitmentsTable.active, true),
          )
        : eq(recurringCommitmentsTable.active, true),
    );

  const periods = [];
  let runningBalance = currentBalance;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 2. Cálculo Periodo a Periodo
  for (let i = 0; i < periodsCount; i++) {
    let periodStart = new Date(today);
    let periodEnd = new Date(today);

    // Fechas límites súper estrictas para asegurar que el motor matemático no se deje ni un solo día
    if (interval === "month") {
      periodStart = new Date(
        today.getFullYear(),
        today.getMonth() + i,
        1,
        0,
        0,
        0,
      );
      periodEnd = new Date(
        today.getFullYear(),
        today.getMonth() + i + 1,
        0,
        23,
        59,
        59,
      );
    } else {
      periodStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + i * 7,
        0,
        0,
        0,
      );
      periodEnd = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth(),
        periodStart.getDate() + 6,
        23,
        59,
        59,
      );
    }

    const pStartStr = periodStart.toISOString().split("T")[0];
    const pEndStr = periodEnd.toISOString().split("T")[0];

    const incomeDetails: DetailItem[] = [];
    const expenseDetails: DetailItem[] = [];

    // INGRESOS: Facturas Pendientes
    let expectedIncomeInvoices = 0;
    allInvoices
      .filter(
        (inv) =>
          inv.status !== "paid" &&
          inv.status !== "draft" &&
          inv.dueDate &&
          inv.dueDate >= pStartStr &&
          inv.dueDate <= pEndStr,
      )
      .forEach((inv) => {
        const amount = parseFloat(inv.total) - parseFloat(inv.paidAmount);
        expectedIncomeInvoices += amount;
        incomeDetails.push({
          type: "Factura",
          description: `Cobro Factura ${inv.invoiceNumber}`,
          amount: amount.toString(),
          date: inv.dueDate as string,
        });
      });

    // INGRESOS: Recurrentes
    let expectedIncomeRecurring = 0;
    allRecurring
      .filter((req) => req.type?.toLowerCase() === "ingreso")
      .forEach((req) => {
        const occurrences = getRecurringOccurrencesInPeriod(
          req,
          periodStart,
          periodEnd,
        );
        occurrences.forEach((occ) => {
          expectedIncomeRecurring += occ.amount;
          incomeDetails.push({
            type: "Recurrente",
            description: req.title,
            amount: occ.amount.toString(),
            date: occ.date,
          });
        });
      });

    // GASTOS: Facturas de Proveedor
    let expectedExpenseVendors = 0;
    allVendorInvoices
      .filter(
        (inv) =>
          inv.status !== "paid" &&
          inv.dueDate &&
          inv.dueDate >= pStartStr &&
          inv.dueDate <= pEndStr,
      )
      .forEach((inv) => {
        const amount = parseFloat(inv.total) - parseFloat(inv.paidAmount);
        expectedExpenseVendors += amount;
        expenseDetails.push({
          type: "Proveedor",
          description: `Pago Prov. ${inv.invoiceNumber || "S/N"}`,
          amount: amount.toString(),
          date: inv.dueDate as string,
        });
      });

    // GASTOS: Gastos Individuales
    allExpenses
      .filter(
        (exp) =>
          exp.status !== "paid" &&
          exp.expenseDate >= pStartStr &&
          exp.expenseDate <= pEndStr,
      )
      .forEach((exp) => {
        const amount =
          parseFloat(exp.total) - parseFloat(exp.paidAmount || "0");
        expectedExpenseVendors += amount;
        expenseDetails.push({
          type: "Gasto",
          description: exp.description,
          amount: amount.toString(),
          date: exp.expenseDate,
        });
      });

    // GASTOS: Recurrentes (AHORA SÍ COGERÁ TODOS LOS MESES)
    let expectedExpenseRecurring = 0;
    allRecurring
      .filter((req) => req.type?.toLowerCase() === "gasto")
      .forEach((req) => {
        const occurrences = getRecurringOccurrencesInPeriod(
          req,
          periodStart,
          periodEnd,
        );
        occurrences.forEach((occ) => {
          expectedExpenseRecurring += occ.amount;
          expenseDetails.push({
            type: "Recurrente",
            description: req.title,
            amount: occ.amount.toString(),
            date: occ.date,
          });
        });
      });

    const expectedIncome = expectedIncomeInvoices + expectedIncomeRecurring;
    const expectedExpenses = expectedExpenseVendors + expectedExpenseRecurring;
    runningBalance = runningBalance + expectedIncome - expectedExpenses;

    // Ordenar detalles por fecha
    incomeDetails.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    expenseDetails.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    periods.push({
      weekStart: pStartStr,
      weekEnd: pEndStr,
      expectedIncome: expectedIncome.toString(),
      expectedExpenses: expectedExpenses.toString(),
      expectedIncomeInvoices: expectedIncomeInvoices.toString(),
      expectedExpenseVendors: expectedExpenseVendors.toString(),
      expectedExpenseRecurring: expectedExpenseRecurring.toString(),
      projectedBalance: runningBalance.toString(),
      incomeDetails,
      expenseDetails,
    });
  }

  // Alertas
  const alerts: ForecastAlert[] = [];
  periods.forEach((p) => {
    const balance = parseFloat(p.projectedBalance);
    if (balance < 0)
      alerts.push({
        type: "danger",
        message: `Ruptura de caja. Saldo negativo: ${balance.toFixed(2)}€`,
        weekStart: p.weekStart,
      });
  });

  res.json({
    currentBalance: currentBalance.toString(),
    weeks: periods,
    alerts,
  });
});

export default router;
