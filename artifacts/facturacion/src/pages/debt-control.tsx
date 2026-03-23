import { useCompany } from "@/hooks/use-company";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/shared-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  ShieldAlert,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

export default function DebtControlPage() {
  const { activeCompanyId } = useCompany();

  const { data, isLoading } = useQuery({
    queryKey: ["debt-analysis", activeCompanyId],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/debt-analysis${activeCompanyId ? `?companyId=${activeCompanyId}` : ""}`,
      );
      return res.json();
    },
  });

  if (isLoading)
    return (
      <div className="p-8 text-center animate-pulse">
        Analizando cartera y vencimientos...
      </div>
    );
  if (!data) return null;

  const agingChartData = [
    {
      name: "Al corriente",
      Cobros: data.aging.receivables.noVencido,
      Pagos: data.aging.payables.noVencido,
    },
    {
      name: "1-30 Días",
      Cobros: data.aging.receivables.dias30,
      Pagos: data.aging.payables.dias30,
    },
    {
      name: "31-60 Días",
      Cobros: data.aging.receivables.dias60,
      Pagos: data.aging.payables.dias60,
    },
    {
      name: "61-90 Días",
      Cobros: data.aging.receivables.dias90,
      Pagos: data.aging.payables.dias90,
    },
    {
      name: "+90 Días",
      Cobros: data.aging.receivables.mas90,
      Pagos: data.aging.payables.mas90,
    },
  ];

  // Componente auxiliar para pintar las filas de las tablas de alertas
  const renderAlertRow = (item: any) => (
    <div
      key={`${item.type}-${item.id}`}
      className="flex items-center justify-between p-3 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-4 w-1/2">
        <Badge
          variant={item.type === "cobro" ? "success" : "destructive"}
          className="w-16 justify-center uppercase text-[10px]"
        >
          {item.type}
        </Badge>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{item.entity}</span>
          <span className="text-xs text-muted-foreground">{item.document}</span>
        </div>
      </div>
      <div className="flex items-center gap-6 w-1/2 justify-end">
        <div className="flex flex-col text-right">
          <span className="text-sm font-medium">
            {formatDate(item.dueDate)}
          </span>
          {item.daysOverdue > 0 ? (
            <span className="text-xs text-destructive font-bold">
              {item.daysOverdue} días vencida
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              en {Math.abs(item.daysOverdue)} días
            </span>
          )}
        </div>
        <span className="font-mono font-bold w-24 text-right">
          {formatCurrency(item.amount)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">
          Control de Cartera
        </h1>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-emerald-700 flex items-center gap-1 mb-1">
              <ArrowUpRight className="w-4 h-4" /> Por Cobrar
            </p>
            <h3 className="text-2xl font-bold text-emerald-700">
              {formatCurrency(data.summary.totalPendingReceivables)}
            </h3>
          </CardContent>
        </Card>
        <Card className="bg-rose-500/10 border-rose-500/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-rose-700 flex items-center gap-1 mb-1">
              <ArrowDownRight className="w-4 h-4" /> Por Pagar
            </p>
            <h3 className="text-2xl font-bold text-rose-700">
              {formatCurrency(data.summary.totalPendingPayables)}
            </h3>
          </CardContent>
        </Card>
        <Card className="bg-destructive text-destructive-foreground shadow-md shadow-destructive/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium flex items-center gap-1 mb-1 opacity-90">
              <AlertTriangle className="w-4 h-4" /> ¡Vencidas!
            </p>
            <h3 className="text-2xl font-bold">
              {data.alerts.overdue.length}{" "}
              <span className="text-base font-normal opacity-80">facturas</span>
            </h3>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-700 flex items-center gap-1 mb-1">
              <Clock className="w-4 h-4" /> Próximos 7 días
            </p>
            <h3 className="text-2xl font-bold text-amber-700">
              {data.alerts.thisWeek.length}{" "}
              <span className="text-base font-normal opacity-80">facturas</span>
            </h3>
          </CardContent>
        </Card>
      </div>

      {/* Panel Interactivo */}
      <Tabs defaultValue="alertas" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="alertas" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Qué debo Pagar/Cobrar
          </TabsTrigger>
          <TabsTrigger value="riesgo" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Evolución y Riesgo
          </TabsTrigger>
        </TabsList>

        {/* PESTAÑA 1: Vencimientos y Alertas */}
        <TabsContent value="alertas" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 gap-6">
            {/* Facturas Vencidas */}
            <Card className="border-destructive/30">
              <CardHeader className="bg-destructive/5 pb-3">
                <CardTitle className="text-destructive flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5" /> Facturas Vencidas
                  (Impagos y Retrasos)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.alerts.overdue.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    Todo al día. No hay facturas vencidas. 🎉
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {data.alerts.overdue.map(renderAlertRow)}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vencen esta semana */}
              <Card>
                <CardHeader className="bg-amber-500/5 pb-3">
                  <CardTitle className="text-amber-600 flex items-center gap-2 text-base">
                    <Clock className="w-5 h-5" /> Vencen esta semana
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.alerts.thisWeek.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      Libre esta semana.
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {data.alerts.thisWeek.map(renderAlertRow)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vencen este mes */}
              <Card>
                <CardHeader className="pb-3 bg-secondary/20">
                  <CardTitle className="text-foreground flex items-center gap-2 text-base">
                    <Calendar className="w-5 h-5" /> Vencen este mes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.alerts.thisMonth.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      No hay vencimientos para el próximo mes.
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {data.alerts.thisMonth.map(renderAlertRow)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* PESTAÑA 2: Gráficos y Top Deudores */}
        <TabsContent value="riesgo" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" /> Antigüedad de la
                Deuda Pendiente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={agingChartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
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
                      tick={{ fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => `€${val / 1000}k`}
                      dx={-10}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: "hsl(var(--secondary))" }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ paddingTop: "20px" }}
                    />
                    <Bar
                      name="A Cobrar (Clientes)"
                      dataKey="Cobros"
                      fill="hsl(142.1 76.2% 36.3%)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      name="A Pagar (Proveedores)"
                      dataKey="Pagos"
                      fill="hsl(var(--destructive))"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-600">
                  Top 5 Clientes Deudores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.topDebtors.map((client: any, i: number) => (
                    <div
                      key={i}
                      className="flex justify-between items-center p-2 rounded-lg bg-secondary/20"
                    >
                      <span className="font-medium text-sm truncate max-w-[70%]">
                        {client.name}
                      </span>
                      <span className="font-semibold font-mono text-emerald-600">
                        {formatCurrency(client.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-rose-600">
                  Top 5 Proveedores a Pagar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.topCreditors.map((supplier: any, i: number) => (
                    <div
                      key={i}
                      className="flex justify-between items-center p-2 rounded-lg bg-secondary/20"
                    >
                      <span className="font-medium text-sm truncate max-w-[70%]">
                        {supplier.name}
                      </span>
                      <span className="font-semibold font-mono text-rose-600">
                        {formatCurrency(supplier.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
