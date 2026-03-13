import { useState } from "react";
import { useListInvoices, useCreateInvoice, useUpdateInvoiceStatus, useListClients, useGetNextInvoiceNumber } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Modal, Input, Label, Select } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Search, FileText, Trash2, Download, CheckCircle, Send, MoreVertical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitida",
  paid: "Cobrada",
  overdue: "Vencida",
  cancelled: "Anulada",
};

export default function InvoicesPage() {
  const { activeCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const { data: invoices, isLoading } = useListInvoices(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const statusMutation = useUpdateInvoiceStatus();

  const filtered = invoices?.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!inv.invoiceNumber.toLowerCase().includes(s) && !(inv.clientName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const handleStatusChange = (invoiceId: number, newStatus: string) => {
    statusMutation.mutate({ id: invoiceId, data: { status: newStatus } }, {
      onSuccess: () => {
        toast({ title: "Estado actualizado", description: `Factura marcada como ${statusLabels[newStatus] || newStatus}` });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        setMenuOpenId(null);
      }
    });
  };

  const handleDownloadPdf = (invoiceId: number) => {
    const url = `${API_BASE}/invoices/${invoiceId}/pdf`;
    window.open(url, "_blank");
  };

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
            <Input className="pl-9" placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select className="w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="issued">Emitida</option>
            <option value="paid">Cobrada</option>
            <option value="overdue">Vencida</option>
          </Select>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando facturas...</div>
          ) : !filtered?.length ? (
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
                    <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/20 transition-colors group">
                      <td className="px-6 py-4 font-medium text-primary">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 font-medium">{inv.clientName || 'Cliente Genérico'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.dueDate ? formatDate(inv.dueDate) : '-'}</td>
                      <td className="px-6 py-4">
                        <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'destructive' : inv.status === 'draft' ? 'secondary' : 'warning'}>
                          {statusLabels[inv.status] || inv.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                            title="Descargar PDF"
                            onClick={() => handleDownloadPdf(inv.id)}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button
                              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                              title="Cambiar estado"
                              onClick={() => setMenuOpenId(menuOpenId === inv.id ? null : inv.id)}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {menuOpenId === inv.id && (
                              <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-lg py-1 w-44">
                                {inv.status === "draft" && (
                                  <button className="w-full px-4 py-2 text-left text-sm hover:bg-secondary/50 flex items-center gap-2"
                                    onClick={() => handleStatusChange(inv.id, "issued")}>
                                    <Send className="w-3.5 h-3.5" /> Emitir factura
                                  </button>
                                )}
                                {(inv.status === "issued" || inv.status === "overdue") && (
                                  <button className="w-full px-4 py-2 text-left text-sm hover:bg-secondary/50 flex items-center gap-2"
                                    onClick={() => handleStatusChange(inv.id, "paid")}>
                                    <CheckCircle className="w-3.5 h-3.5" /> Marcar cobrada
                                  </button>
                                )}
                                {inv.status !== "cancelled" && inv.status !== "paid" && (
                                  <button className="w-full px-4 py-2 text-left text-sm hover:bg-secondary/50 text-destructive flex items-center gap-2"
                                    onClick={() => handleStatusChange(inv.id, "cancelled")}>
                                    <Trash2 className="w-3.5 h-3.5" /> Anular factura
                                  </button>
                                )}
                                {inv.status === "paid" && (
                                  <span className="w-full px-4 py-2 text-xs text-muted-foreground block">Sin acciones disponibles</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
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
  const { data: nextNumberData } = useGetNextInvoiceNumber({ companyId });

  const [clientId, setClientId] = useState("");
  const autoInvoiceNumber = nextNumberData?.invoiceNumber || "";
  const [invoiceNumberOverride, setInvoiceNumberOverride] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState("");
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
        invoiceNumber: invoiceNumberOverride || "",
        issueDate,
        dueDate: dueDate || undefined,
        taxRate: "21",
        items
      }
    }, {
      onSuccess: () => {
        toast({ title: "Factura creada", description: "La factura se ha guardado correctamente." });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        onClose();
        setClientId("");
        setInvoiceNumberOverride("");
        setItems([{ description: "", quantity: "1", unitPrice: "0" }]);
        setDueDate("");
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
            <Input value={invoiceNumberOverride} onChange={e => setInvoiceNumberOverride(e.target.value)} placeholder={autoInvoiceNumber ? `Auto: ${autoInvoiceNumber}` : "Auto"} />
          </div>
          <div>
            <Label>Fecha de Emisión</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label>Fecha de Vencimiento</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
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
