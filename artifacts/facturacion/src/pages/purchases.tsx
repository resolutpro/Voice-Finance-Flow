import { useState } from "react";
import { useListVendorInvoices, useListExpenses } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, ShoppingBag, Receipt } from "lucide-react";

export default function PurchasesPage() {
  const { activeCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState<'invoices' | 'expenses'>('invoices');
  
  const { data: invoices, isLoading: loadingInvoices } = useListVendorInvoices(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: expenses, isLoading: loadingExpenses } = useListExpenses(activeCompanyId ? { companyId: activeCompanyId } : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Compras y Gastos</h2>
          <p className="text-muted-foreground">Gestiona facturas de proveedores y tickets</p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Nuevo Gasto
        </Button>
      </div>

      <div className="flex gap-2 p-1 bg-secondary/50 rounded-xl w-fit border border-border">
        <button 
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === 'invoices' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Receipt className="w-4 h-4" /> Facturas Recibidas
        </button>
        <button 
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === 'expenses' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <ShoppingBag className="w-4 h-4" /> Tickets y Gastos Rapidos
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {activeTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Proveedor</th>
                    <th className="px-6 py-4 font-semibold">Factura</th>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingInvoices ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                  ) : invoices?.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 font-medium">{inv.supplierName || 'Proveedor'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.invoiceNumber || '-'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={inv.status === 'paid' ? 'success' : 'warning'}>{inv.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(inv.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Concepto</th>
                    <th className="px-6 py-4 font-semibold">Categoría</th>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingExpenses ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                  ) : expenses?.map((exp) => (
                    <tr key={exp.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 font-medium">{exp.description}</td>
                      <td className="px-6 py-4 text-muted-foreground">{exp.categoryName || '-'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.expenseDate)}</td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(exp.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
