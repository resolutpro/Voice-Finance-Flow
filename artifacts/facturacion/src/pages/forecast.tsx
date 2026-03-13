import { useGetCashForecast } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

export default function ForecastPage() {
  const { activeCompanyId } = useCompany();
  const { data: forecast, isLoading } = useGetCashForecast(
    activeCompanyId ? { companyId: activeCompanyId, weeks: 8 } : { weeks: 8 }
  );

  if (isLoading) return <div className="p-8 text-center animate-pulse">Calculando previsión...</div>;
  if (!forecast) return null;

  const chartData = forecast.weeks.map(w => ({
    name: `Sem ${w.weekStart.substring(5, 10)}`,
    Ingresos: Number(w.expectedIncome),
    Gastos: Number(w.expectedExpenses),
    Saldo: Number(w.projectedBalance),
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            Previsión de Caja <Badge variant="secondary">Próximas 8 semanas</Badge>
          </h2>
          <p className="text-muted-foreground mt-1">Proyección de liquidez basada en vencimientos</p>
        </div>
      </div>

      {forecast.alerts.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-4 items-start">
          <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-destructive">Alertas de Tesorería</h4>
            <ul className="mt-2 space-y-1 text-sm text-destructive/90">
              {forecast.alerts.map((alert, i) => (
                <li key={i}>• {alert.message} ({formatDate(alert.weekStart)})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="shadow-lg border-border/50">
        <CardHeader>
          <CardTitle>Evolución de Saldo Proyectado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dx={-10} tickFormatter={(val) => `€${val/1000}k`} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <ReferenceLine y={0} yAxisId="left" stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                <Bar yAxisId="left" dataKey="Ingresos" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="Gastos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line yAxisId="left" type="monotone" dataKey="Saldo" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle Semanal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                <tr>
                  <th className="px-6 py-4 font-semibold">Semana</th>
                  <th className="px-6 py-4 font-semibold text-right">Cobros Previstos</th>
                  <th className="px-6 py-4 font-semibold text-right">Pagos Previstos</th>
                  <th className="px-6 py-4 font-semibold text-right text-primary">Saldo Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {forecast.weeks.map((w, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium">{formatDate(w.weekStart)} - {formatDate(w.weekEnd)}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-mono">{formatCurrency(w.expectedIncome)}</td>
                    <td className="px-6 py-4 text-right text-destructive font-mono">{formatCurrency(w.expectedExpenses)}</td>
                    <td className={`px-6 py-4 text-right font-bold font-mono ${Number(w.projectedBalance) < 0 ? 'text-destructive' : 'text-primary'}`}>
                      {formatCurrency(w.projectedBalance)}
                    </td>
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
