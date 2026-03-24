// artifacts/facturacion/src/pages/contabilidad.tsx
import { useState, useMemo } from "react";
import {
  Download,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Calculator,
  Landmark,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/use-company";
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  isWithinInterval,
  parseISO,
} from "date-fns";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  useListInvoices,
  useListVendorInvoices,
  useListExpenses,
  useListCategories,
} from "@workspace/api-client-react";

type DateRange =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all";

export default function AccountingPage() {
  const { activeCompanyId } = useCompany();
  const [dateRange, setDateRange] = useState<DateRange>("this_quarter"); // Por defecto trimestre suele ser mejor para impuestos

  // --- OBTENCIÓN DE DATOS ---
  const { data: invoices } = useListInvoices(
    { companyId: activeCompanyId! },
    { query: { enabled: !!activeCompanyId } },
  );

  const { data: vendorInvoices } = useListVendorInvoices(
    { companyId: activeCompanyId! },
    { query: { enabled: !!activeCompanyId } },
  );

  const { data: expenses } = useListExpenses(
    { companyId: activeCompanyId! },
    { query: { enabled: !!activeCompanyId } },
  );

  const { data: categories } = useListCategories(
    { companyId: activeCompanyId! },
    { query: { enabled: !!activeCompanyId } },
  );

  // --- LÓGICA DE FECHAS ---
  const dateInterval = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "this_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month": {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case "this_quarter":
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "this_year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return null;
    }
  }, [dateRange]);

  const isDateInRange = (dateString: string) => {
    if (!dateInterval) return true;
    try {
      const date = parseISO(dateString);
      return isWithinInterval(date, dateInterval);
    } catch {
      return false;
    }
  };

  // --- CÁLCULOS PRINCIPALES ---
  const stats = useMemo(() => {
    // Filtrar válidos en fecha y estado
    const validInvoices = (invoices || []).filter(
      (inv) =>
        inv.status !== "borrador" &&
        inv.status !== "anulada" &&
        isDateInRange(inv.issueDate),
    );
    const validVendorInvoices = (vendorInvoices || []).filter(
      (inv) =>
        inv.status !== "borrador" &&
        inv.status !== "anulada" &&
        isDateInRange(inv.issueDate),
    );
    const validExpenses = (expenses || []).filter(
      (exp) =>
        exp.status !== "borrador" &&
        exp.status !== "anulada" &&
        isDateInRange(exp.expenseDate),
    );

    // 1. BASES IMPONIBLES (Para Pérdidas y Ganancias)
    const totalIncome = validInvoices.reduce(
      (sum, inv) => sum + Number(inv.subtotal || 0),
      0,
    );
    const totalVendorExpenses = validVendorInvoices.reduce(
      (sum, inv) => sum + Number(inv.subtotal || 0),
      0,
    );
    const totalQuickExpenses = validExpenses.reduce(
      (sum, exp) => sum + Number(exp.amount || 0),
      0,
    );
    const totalExpenses = totalVendorExpenses + totalQuickExpenses;

    // 2. IMPUESTOS (Para Obligaciones)
    const ivaRepercutido = validInvoices.reduce(
      (sum, inv) => sum + Number(inv.taxAmount || 0),
      0,
    );
    const ivaSoportadoProveedor = validVendorInvoices.reduce(
      (sum, inv) => sum + Number(inv.taxAmount || 0),
      0,
    );
    const ivaSoportadoGastos = validExpenses.reduce(
      (sum, exp) => sum + Number(exp.taxAmount || 0),
      0,
    );
    const totalIvaSoportado = ivaSoportadoProveedor + ivaSoportadoGastos;

    // Agrupación de Gastos por Categoría
    const expenseCategoriesMap: Record<number, number> = {};
    validVendorInvoices.forEach((inv) => {
      const catId = inv.categoryId || 0;
      expenseCategoriesMap[catId] =
        (expenseCategoriesMap[catId] || 0) + Number(inv.subtotal || 0);
    });
    validExpenses.forEach((exp) => {
      const catId = exp.categoryId || 0;
      expenseCategoriesMap[catId] =
        (expenseCategoriesMap[catId] || 0) + Number(exp.amount || 0);
    });

    const expensesByCategory = Object.entries(expenseCategoriesMap)
      .map(([idStr, total]) => {
        const catId = Number(idStr);
        const category = categories?.find((c) => c.id === catId);
        return {
          id: catId,
          name:
            catId === 0
              ? "Sin categorizar / Generales"
              : category?.name || "Categoría eliminada",
          total,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      income: totalIncome,
      expenses: totalExpenses,
      margin: totalIncome - totalExpenses,
      marginPercent:
        totalIncome > 0
          ? ((totalIncome - totalExpenses) / totalIncome) * 100
          : 0,
      expensesByCategory,
      taxes: {
        repercutido: ivaRepercutido,
        soportado: totalIvaSoportado,
        resultadoIva: ivaRepercutido - totalIvaSoportado,
      },
    };
  }, [invoices, vendorInvoices, expenses, categories, dateInterval]);

  const handleExport = () => {
    // 1. Preparamos el contenido del CSV en texto plano (sin la cabecera data URI)
    const csvContent =
      "Concepto,Ingresos,Gastos,Resultado\n" +
      `Ingresos por Ventas,${stats.income},0,${stats.income}\n` +
      stats.expensesByCategory
        .map((e) => `${e.name},0,${e.total},-${e.total}`)
        .join("\n") +
      `\nRESULTADO OPERATIVO,${stats.income},${stats.expenses},${stats.margin}\n` +
      `\nIMPUESTOS,IVA Repercutido,IVA Soportado,A Liquidar\n` +
      `Liquidación IVA,${stats.taxes.repercutido},${stats.taxes.soportado},${stats.taxes.resultadoIva}`;

    // 2. Creamos un Blob incluyendo el BOM (\uFEFF) al principio para que Excel reconozca el UTF-8
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    // 3. Forzamos la descarga
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `contabilidad_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();

    // 4. Limpieza
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(value);

  if (!activeCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <Calculator className="w-12 h-12 text-muted-foreground opacity-20" />
        <h2 className="text-xl font-medium">Selecciona una empresa</h2>
        <p className="text-muted-foreground">
          Debes seleccionar una empresa en el menú superior para ver su
          contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            Contabilidad{" "}
            <span className="text-primary hidden sm:inline">Operativa</span>
          </h2>
          <p className="text-muted-foreground mt-1">
            Análisis de rentabilidad, desglose de categorías y obligaciones
            fiscales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <select
            className="flex-1 sm:flex-none h-10 px-3 py-2 rounded-md border border-input bg-background text-sm font-medium"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
          >
            <option value="this_month">Este mes</option>
            <option value="last_month">Mes anterior</option>
            <option value="this_quarter">Este trimestre (Fiscal)</option>
            <option value="this_year">Este año</option>
            <option value="all">Histórico completo</option>
          </select>
          <Button
            onClick={handleExport}
            variant="outline"
            className="gap-2 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPIs DE RENDIMIENTO (Bases Imponibles) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">
              Ingresos (Base Imp.)
            </CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-full">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.income)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Volumen de facturación
            </p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-rose-600">
              Gastos (Base Imp.)
            </CardTitle>
            <div className="p-2 bg-rose-500/10 rounded-full">
              <ArrowDownRight className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.expenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Compras y gastos operativos
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            stats.margin >= 0
              ? "border-primary/30 shadow-sm"
              : "border-rose-500/30 shadow-sm"
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Resultado Operativo
            </CardTitle>
            <div
              className={`p-2 rounded-full ${stats.margin >= 0 ? "bg-primary/10" : "bg-rose-500/10"}`}
            >
              <DollarSign
                className={`h-4 w-4 ${stats.margin >= 0 ? "text-primary" : "text-rose-600"}`}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.margin)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Margen: {stats.marginPercent.toFixed(1)}% sobre ingresos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PESTAÑAS DE DETALLE */}
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="categories">Pérdidas y Ganancias</TabsTrigger>
          <TabsTrigger value="obligations">Impuestos e IVA</TabsTrigger>
        </TabsList>

        {/* PESTAÑA 1: ANALÍTICA (P&L) */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cuenta de Explotación Analítica</CardTitle>
              <CardDescription>
                Desglose de ingresos y gastos clasificados por categoría
                contable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Concepto / Categoría</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Gastos</TableHead>
                      <TableHead className="text-right">Margen Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* INGRESOS */}
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Ingresos por Ventas
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(stats.income)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        -
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(stats.income)}
                      </TableCell>
                    </TableRow>

                    {/* GASTOS DESGLOSADOS */}
                    {stats.expensesByCategory.length > 0 ? (
                      stats.expensesByCategory.map((cat) => (
                        <TableRow key={cat.id}>
                          <TableCell className="pl-8 text-muted-foreground flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                            {cat.name}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            -
                          </TableCell>
                          <TableCell className="text-right text-rose-600">
                            {formatCurrency(cat.total)}
                          </TableCell>
                          <TableCell className="text-right text-rose-600">
                            -{formatCurrency(cat.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-6 text-muted-foreground italic"
                        >
                          No hay gastos registrados en este periodo.
                        </TableCell>
                      </TableRow>
                    )}

                    {/* TOTALES */}
                    <TableRow className="bg-muted/30 border-t-2">
                      <TableCell className="font-bold text-foreground">
                        RESULTADO DEL EJERCICIO
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {formatCurrency(stats.income)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-rose-600">
                        {formatCurrency(stats.expenses)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold text-lg ${stats.margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {formatCurrency(stats.margin)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 2: OBLIGACIONES FISCALES */}
        <TabsContent value="obligations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Explicación / Resumen */}
            <Card className="md:col-span-2 bg-muted/30 border-dashed">
              <CardContent className="p-6 flex items-start gap-4">
                <Landmark className="w-8 h-8 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">
                    Estimación de Liquidación de IVA
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    Este cálculo se basa en la fecha de emisión de las facturas
                    (devengo). Las facturas en estado borrador o anuladas no se
                    incluyen en este cálculo. Asegúrate de registrar todos los
                    tickets de gasto para optimizar tu IVA Soportado.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  IVA Repercutido (Ventas)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-3xl font-bold">
                  {formatCurrency(stats.taxes.repercutido)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Es el IVA que has cobrado a tus clientes y debes ingresar a
                  Hacienda.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-500" />
                  IVA Soportado (Compras)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-3xl font-bold">
                  {formatCurrency(stats.taxes.soportado)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Es el IVA que has pagado a proveedores y puedes deducirte.
                </p>
              </CardContent>
            </Card>

            <Card
              className={`md:col-span-2 border-2 ${stats.taxes.resultadoIva > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-emerald-500/50 bg-emerald-500/5"}`}
            >
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
                <div>
                  <h3 className="text-lg font-bold">
                    Resultado de la Liquidación (Estimado)
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center md:justify-start gap-1">
                    {stats.taxes.resultadoIva > 0 ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600" />{" "}
                        Tienes que pagar a Hacienda (A Ingresar)
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="w-4 h-4 text-emerald-600" />{" "}
                        Hacienda te debe dinero (A Devolver/Compensar)
                      </>
                    )}
                  </p>
                </div>
                <div
                  className={`text-4xl font-black ${stats.taxes.resultadoIva > 0 ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {formatCurrency(Math.abs(stats.taxes.resultadoIva))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
