import { useState, useMemo } from "react";
import { useGetCashForecast } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
// Fíjate: quitamos Dialog y usamos Modal (que sí existe en shared-ui)
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Modal,
} from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowRightLeft,
  Wallet,
  Search,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function ForecastPage() {
  const { activeCompanyId } = useCompany();
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [periodsCount, setPeriodsCount] = useState<number>(8);

  // Estado para controlar el modal de detalle
  const [selectedPeriod, setSelectedPeriod] = useState<any | null>(null);

  const { data: forecast, isLoading } = useGetCashForecast(
    activeCompanyId
      ? {
          companyId: activeCompanyId,
          weeks: periodsCount,
          interval: viewMode as any,
        }
      : { weeks: periodsCount, interval: viewMode as any },
  );

  const kpis = useMemo(() => {
    if (!forecast || forecast.weeks.length === 0) return null;
    const balances = forecast.weeks.map((w) => Number(w.projectedBalance));
    const minBalance = Math.min(...balances);
    return {
      currentBalance: Number(forecast.currentBalance),
      finalBalance: balances[balances.length - 1],
      minBalance,
      hasLiquidityTension: minBalance < 0,
      trend:
        balances[balances.length - 1] > Number(forecast.currentBalance)
          ? "up"
          : "down",
    };
  }, [forecast]);

  if (isLoading)
    return (
      <div className="p-8 text-center animate-pulse flex flex-col items-center gap-4">
        <Wallet className="w-8 h-8 animate-bounce text-primary" /> Calculando
        previsión de tesorería...
      </div>
    );
  if (!forecast || !kpis) return null;

  const chartData = forecast.weeks.map((w, index) => ({
    name:
      viewMode === "week"
        ? `Sem ${w.weekStart.substring(5, 10)}`
        : `Mes ${w.weekStart.substring(5, 7)}`,
    Ingresos: Number(w.expectedIncome),
    Gastos: Number(w.expectedExpenses),
    Saldo: Number(w.projectedBalance),
    originalData: w,
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            Previsión de Tesorería
          </h2>
          <p className="text-muted-foreground mt-1">
            Haz clic en una barra del gráfico o fila de tabla para ver el
            desglose
          </p>
        </div>

        <div className="flex bg-secondary/30 p-1 rounded-lg border border-border/50">
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setViewMode("week");
              setPeriodsCount(8);
            }}
            className="rounded-md"
          >
            8 Semanas
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setViewMode("month");
              setPeriodsCount(12);
            }}
            className="rounded-md"
          >
            12 Meses
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Saldo Actual
            </p>
            <h3 className="text-2xl font-bold mt-2">
              {formatCurrency(kpis.currentBalance)}
            </h3>
          </CardContent>
        </Card>
        <Card
          className={`border-border/50 shadow-sm ${kpis.hasLiquidityTension ? "bg-destructive/5 border-destructive/20" : ""}`}
        >
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Punto Crítico (Mínimo)
            </p>
            <h3
              className={`text-2xl font-bold mt-2 ${kpis.hasLiquidityTension ? "text-destructive" : ""}`}
            >
              {formatCurrency(kpis.minBalance)}
            </h3>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Saldo Final
            </p>
            <h3 className="text-2xl font-bold mt-2">
              {formatCurrency(kpis.finalBalance)}
            </h3>
          </CardContent>
        </Card>
      </div>

      {forecast.alerts.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-4 items-start">
          <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-destructive">
              Alertas de Tesorería Críticas
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-destructive/90">
              {forecast.alerts.map((alert, i) => (
                <li key={i}>
                  • {alert.message} (Semana del {formatDate(alert.weekStart)})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="shadow-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">
            Evolución (Clic en el gráfico para detalles)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-2 cursor-pointer">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                onClick={(state) => {
                  if (
                    state &&
                    state.activePayload &&
                    state.activePayload.length > 0
                  ) {
                    setSelectedPeriod(
                      state.activePayload[0].payload.originalData,
                    );
                  }
                }}
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  dx={-10}
                  tickFormatter={(val) => `€${val / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{
                    fontWeight: "bold",
                    color: "hsl(var(--foreground))",
                    marginBottom: "8px",
                  }}
                />
                <ReferenceLine
                  y={0}
                  yAxisId="left"
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="3 3"
                />
                <Bar
                  yAxisId="left"
                  dataKey="Ingresos"
                  fill="hsl(142.1 76.2% 36.3%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  className="hover:opacity-80 transition-opacity"
                />
                <Bar
                  yAxisId="left"
                  dataKey="Gastos"
                  fill="hsl(var(--destructive))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  className="hover:opacity-80 transition-opacity"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Saldo"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                <tr>
                  <th className="px-6 py-4 font-semibold">Periodo</th>
                  <th className="px-6 py-4 font-semibold text-right">
                    Cobros a Clientes
                  </th>
                  <th className="px-6 py-4 font-semibold text-right">
                    Pagos Proveedores
                  </th>
                  <th className="px-6 py-4 font-semibold text-right">
                    Gastos Recurrentes
                  </th>
                  <th className="px-6 py-4 font-semibold text-right text-primary bg-primary/5">
                    Saldo Proyectado
                  </th>
                  <th className="px-6 py-4 font-semibold text-center">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {forecast.weeks.map((w, i) => {
                  const balance = Number(w.projectedBalance);
                  return (
                    <tr
                      key={i}
                      className="hover:bg-secondary/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedPeriod(w)}
                    >
                      <td className="px-6 py-4 font-medium">
                        {viewMode === "week"
                          ? `${formatDate(w.weekStart)} al ${formatDate(w.weekEnd)}`
                          : formatDate(w.weekStart, {
                              month: "long",
                              year: "numeric",
                            })}
                      </td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-mono">
                        {formatCurrency(Number(w.expectedIncomeInvoices || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-destructive font-mono">
                        {formatCurrency(Number(w.expectedExpenseVendors || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-orange-600 font-mono">
                        {formatCurrency(
                          Number(w.expectedExpenseRecurring || 0),
                        )}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-bold font-mono bg-primary/5 ${balance < 0 ? "text-destructive" : "text-primary"}`}
                      >
                        {formatCurrency(balance)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-full"
                        >
                          <Search className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* AQUÍ ESTÁ LA MAGIA: Usamos tu componente Modal nativo */}
      <Modal
        isOpen={!!selectedPeriod}
        onClose={() => setSelectedPeriod(null)}
        title={`Desglose: ${selectedPeriod ? formatDate(selectedPeriod.weekStart) : ""}`}
        maxWidth="max-w-3xl"
      >
        {selectedPeriod && (
          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-emerald-600 flex justify-between border-b pb-2 mb-3">
                <span>Ingresos Previstos</span>
                <span>{formatCurrency(selectedPeriod.expectedIncome)}</span>
              </h4>
              {selectedPeriod.incomeDetails?.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No hay ingresos proyectados para este periodo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedPeriod.incomeDetails?.map((item: any, i: number) => (
                    <li
                      key={i}
                      className="flex justify-between text-sm p-2 bg-secondary/20 rounded-md"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{item.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.type} • Vto: {formatDate(item.date)}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-600 font-medium">
                        {formatCurrency(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="font-bold text-destructive flex justify-between border-b pb-2 mb-3">
                <span>Pagos y Gastos Previstos</span>
                <span>{formatCurrency(selectedPeriod.expectedExpenses)}</span>
              </h4>
              {selectedPeriod.expenseDetails?.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No hay gastos proyectados para este periodo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedPeriod.expenseDetails?.map(
                    (item: any, i: number) => (
                      <li
                        key={i}
                        className="flex justify-between text-sm p-2 bg-secondary/20 rounded-md"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {item.description}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground/70 mr-1">
                              {item.type}
                            </span>
                            • Vto: {formatDate(item.date)}
                          </span>
                        </div>
                        <span className="font-mono text-destructive font-medium">
                          {formatCurrency(item.amount)}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
