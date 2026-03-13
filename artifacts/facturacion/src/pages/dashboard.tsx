import { useGetDashboard, useGetCashForecast } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export default function Dashboard() {
  const { activeCompanyId } = useCompany();
  const { data: dashboard, isLoading } = useGetDashboard(
    activeCompanyId ? { companyId: activeCompanyId } : undefined
  );
  const { data: forecast } = useGetCashForecast(
    activeCompanyId ? { companyId: activeCompanyId, weeks: 6 } : { weeks: 6 }
  );

  const chartData = forecast?.weeks.map(w => ({
    name: `Sem ${w.weekStart.substring(5, 10)}`,
    Ingresos: Number(w.expectedIncome),
    Gastos: Number(w.expectedExpenses),
    Saldo: Number(w.projectedBalance),
  })) || [];

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center animate-pulse text-muted-foreground">Cargando métricas...</div>;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-primary to-blue-600 text-white border-none shadow-lg shadow-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Saldo Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold tracking-tight">
              {formatCurrency(dashboard.totalBalance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-500" /> Por Cobrar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-display font-semibold text-foreground">
              {formatCurrency(dashboard.pendingReceivables)}
            </div>
            {dashboard.overdueInvoices > 0 && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3 h-3" /> {dashboard.overdueInvoices} facturas vencidas
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-destructive" /> Por Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-display font-semibold text-foreground">
              {formatCurrency(dashboard.pendingPayables)}
            </div>
            {dashboard.overduePayables > 0 && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3 h-3" /> {dashboard.overduePayables} pagos vencidos
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance by company (if consolidated) */}
        {!activeCompanyId && (
          <Card>
            <CardHeader>
              <CardTitle>Saldos por Empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.balanceByCompany.map(company => (
                  <div key={company.companyId} className="flex justify-between items-center p-3 rounded-xl hover:bg-secondary/50 transition-colors">
                    <span className="font-medium">{company.companyName}</span>
                    <span className="font-semibold font-mono">{formatCurrency(company.balance)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Due this week */}
        <Card className={!activeCompanyId ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Vencimientos esta semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.thisWeekDue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No hay vencimientos pendientes para esta semana.</div>
            ) : (
              <div className="space-y-3">
                {dashboard.thisWeekDue.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:shadow-sm transition-shadow">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{item.description}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(item.dueDate)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={item.type === 'receivable' ? 'success' : 'destructive'} className="uppercase text-[10px]">
                        {item.type === 'receivable' ? 'Cobro' : 'Pago'}
                      </Badge>
                      <span className="font-semibold">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card className="shadow-lg border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Previsión de Caja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} dx={-10} tickFormatter={(val) => `€${val/1000}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                  <Bar dataKey="Ingresos" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Gastos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Line type="monotone" dataKey="Saldo" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Últimas Facturas Emitidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 rounded-r-lg font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.clientName || 'Cliente Genérico'}</td>
                    <td className="px-4 py-3">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'destructive' : 'warning'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold font-mono">{formatCurrency(inv.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
