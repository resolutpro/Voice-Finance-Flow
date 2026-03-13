import { useState } from "react";
import { useListInvoices, useCreateInvoice, useListClients } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Modal, Input, Label, Select } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Search, FileText, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function InvoicesPage() {
  const { activeCompanyId } = useCompany();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: invoices, isLoading } = useListInvoices(activeCompanyId ? { companyId: activeCompanyId } : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Facturas Emitidas</h2>
          <p className="text-muted-foreground">Gestiona la facturación a clientes</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Nueva Factura
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-border/50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por número o cliente..." />
          </div>
          <Select className="w-40">
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="issued">Emitida</option>
            <option value="paid">Cobrada</option>
          </Select>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando facturas...</div>
          ) : !invoices?.length ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No hay facturas</h3>
              <p className="text-muted-foreground mb-6">Aún no has emitido ninguna factura para esta selección.</p>
              <Button onClick={() => setIsCreateOpen(true)} variant="outline">Crear la primera</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Número</th>
                    <th className="px-6 py-4 font-semibold">Cliente</th>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold">Vencimiento</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/20 transition-colors group cursor-pointer">
                      <td className="px-6 py-4 font-medium text-primary">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 font-medium">{inv.clientName || 'Cliente Genérico'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.dueDate ? formatDate(inv.dueDate) : '-'}</td>
                      <td className="px-6 py-4">
                        <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'destructive' : inv.status === 'draft' ? 'secondary' : 'warning'}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(inv.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateInvoiceModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} companyId={activeCompanyId || 1} />
    </div>
  );
}

function CreateInvoiceModal({ isOpen, onClose, companyId }: { isOpen: boolean, onClose: () => void, companyId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateInvoice();
  const { data: clients } = useListClients({ companyId });

  // Form state
  const [clientId, setClientId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("FAC-2026-001");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState([{ description: "", quantity: "1", unitPrice: "0" }]);

  const handleAddItem = () => setItems([...items, { description: "", quantity: "1", unitPrice: "0" }]);
  const handleRemoveItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  
  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const subtotal = items.reduce((acc, item) => acc + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")), 0);
  const tax = subtotal * 0.21;
  const total = subtotal + tax;

  const handleSubmit = () => {
    createMutation.mutate({
      data: {
        companyId,
        clientId: clientId ? Number(clientId) : null,
        invoiceNumber,
        issueDate,
        taxRate: "21",
        items
      }
    }, {
      onSuccess: () => {
        toast({ title: "Factura creada", description: "La factura se ha guardado correctamente." });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        onClose();
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva Factura" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Cliente</Label>
            <Select value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Selecciona un cliente...</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Número de Factura</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <Label>Fecha de Emisión</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-secondary/50 p-3 flex justify-between items-center border-b border-border">
            <h4 className="font-semibold text-sm">Líneas de Factura</h4>
            <Button size="sm" variant="outline" onClick={handleAddItem}>Añadir línea</Button>
          </div>
          <div className="p-4 space-y-3 bg-card">
            {items.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1">
                  <Input placeholder="Concepto" value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} />
                </div>
                <div className="w-24">
                  <Input type="number" placeholder="Cant." value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} />
                </div>
                <div className="w-32">
                  <Input type="number" placeholder="Precio" value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', e.target.value)} />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive flex-shrink-0" onClick={() => handleRemoveItem(index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="bg-muted/30 p-4 border-t border-border flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span> <span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IVA (21%)</span> <span>{formatCurrency(tax)}</span></div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border/50"><span>Total</span> <span>{formatCurrency(total)}</span></div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={createMutation.isPending}>Guardar Factura</Button>
        </div>
      </div>
    </Modal>
  );
}
