import { useListBankAccounts, useListCashMovements } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Landmark, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";

export default function TreasuryPage() {
  const { activeCompanyId } = useCompany();
  const { data: accounts } = useListBankAccounts(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: movements } = useListCashMovements(activeCompanyId ? { companyId: activeCompanyId } : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Tesorería</h2>
          <p className="text-muted-foreground">Control de cuentas y movimientos</p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Nuevo Movimiento
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts?.map(acc => (
          <Card key={acc.id} className="group hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Landmark className="w-5 h-5" />
                </div>
                <Badge variant="outline" className="bg-secondary/50">{acc.bankName || 'Banco'}</Badge>
              </div>
              <h3 className="text-lg font-semibold mb-1">{acc.name}</h3>
              <p className="text-sm text-muted-foreground font-mono mb-4">{acc.iban || 'ES** **** **** **** ****'}</p>
              <div className="text-2xl font-display font-bold text-foreground">
                {formatCurrency(acc.currentBalance)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos Movimientos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Concepto</th>
                  <th className="px-6 py-4 font-semibold">Cuenta</th>
                  <th className="px-6 py-4 font-semibold text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {movements?.map((mov) => (
                  <tr key={mov.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(mov.movementDate)}</td>
                    <td className="px-6 py-4 font-medium">{mov.description || 'Movimiento'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{mov.bankAccountName}</td>
                    <td className={`px-6 py-4 text-right font-semibold font-mono flex items-center justify-end gap-2 ${Number(mov.amount) >= 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                      {Number(mov.amount) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
                      {formatCurrency(mov.amount)}
                    </td>
                  </tr>
                ))}
                {!movements?.length && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No hay movimientos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
