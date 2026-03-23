import { useState } from "react";
import { useListVendorInvoices, useListExpenses, useCreateVendorInvoice, useCreateExpense, useListSuppliers, useListCategories } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Modal, Input, Label, Select } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, ShoppingBag, Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function PurchasesPage() {
  const { activeCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState<"invoices" | "expenses">("invoices");
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);

  const { data: invoices, isLoading: loadingInvoices } = useListVendorInvoices(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: expenses, isLoading: loadingExpenses } = useListExpenses(activeCompanyId ? { companyId: activeCompanyId } : undefined);

  const { toast } = useToast();
  const handleNewClick = () => {
    if (!activeCompanyId) {
      toast({ title: "Selecciona una empresa", description: "Debes seleccionar una empresa específica para crear registros.", variant: "destructive" });
      return;
    }
    if (activeTab === "invoices") setIsCreateInvoiceOpen(true);
    else setIsCreateExpenseOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Compras y Gastos</h2>
          <p className="text-muted-foreground">Gestiona facturas de proveedores y tickets</p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20" onClick={handleNewClick}>
          <Plus className="w-4 h-4" /> {activeTab === "invoices" ? "Nueva Factura Recibida" : "Nuevo Gasto"}
        </Button>
      </div>

      <div className="flex gap-2 p-1 bg-secondary/50 rounded-xl w-fit border border-border">
        <button
          onClick={() => setActiveTab("invoices")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === "invoices" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Receipt className="w-4 h-4" /> Facturas Recibidas
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === "expenses" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ShoppingBag className="w-4 h-4" /> Tickets y Gastos Rápidos
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {activeTab === "invoices" && (
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
                      <td className="px-6 py-4 font-medium">{inv.supplierName || "Proveedor"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.invoiceNumber || "-"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4">
                        <Badge variant={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(inv.total)}</td>
                    </tr>
                  ))}
                  {!loadingInvoices && !invoices?.length && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No hay facturas recibidas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "expenses" && (
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
                      <td className="px-6 py-4 text-muted-foreground">{exp.categoryName || "-"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.expenseDate)}</td>
                      <td className="px-6 py-4 text-right font-semibold font-mono">{formatCurrency(exp.total)}</td>
                    </tr>
                  ))}
                  {!loadingExpenses && !expenses?.length && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No hay gastos registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {activeCompanyId && (
        <>
          <CreateVendorInvoiceModal isOpen={isCreateInvoiceOpen} onClose={() => setIsCreateInvoiceOpen(false)} companyId={activeCompanyId} />
          <CreateExpenseModal isOpen={isCreateExpenseOpen} onClose={() => setIsCreateExpenseOpen(false)} companyId={activeCompanyId} />
        </>
      )}
    </div>
  );
}

function CreateVendorInvoiceModal({ isOpen, onClose, companyId }: { isOpen: boolean; onClose: () => void; companyId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateVendorInvoice();
  const { data: suppliers } = useListSuppliers({ companyId });
  const { data: categories } = useListCategories();

  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");

  const subtotalNum = parseFloat(subtotal || "0");
  const taxAmount = subtotalNum * 0.21;
  const total = subtotalNum + taxAmount;

  const handleSubmit = () => {
    createMutation.mutate({
      data: {
        companyId,
        supplierId: supplierId ? Number(supplierId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        invoiceNumber: invoiceNumber || undefined,
        description,
        subtotal: subtotalNum.toString(),
        taxRate: "21",
        issueDate,
        dueDate: dueDate || undefined,
        status: "pendiente_pago",
      }
    }, {
      onSuccess: () => {
        toast({ title: "Factura registrada", description: "La factura de proveedor se ha guardado." });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
        onClose();
        setSupplierId(""); setInvoiceNumber(""); setDescription(""); setSubtotal(""); setDueDate("");
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva Factura Recibida">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Proveedor</Label>
            <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selecciona...</option>
              {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Nº Factura Proveedor</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ej: FP-2026-001" />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label>Descripción</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Concepto de la factura" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Base imponible</Label>
            <Input type="number" step="0.01" value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Fecha emisión</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label>Fecha vencimiento</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="bg-secondary/30 rounded-xl p-4 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Base imponible</span>
            <span className="font-mono">{formatCurrency(subtotalNum.toString())}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">IVA 21%</span>
            <span className="font-mono">{formatCurrency(taxAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-bold mt-2 pt-2 border-t border-border">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(total.toString())}</span>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateExpenseModal({ isOpen, onClose, companyId }: { isOpen: boolean; onClose: () => void; companyId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateExpense();
  const { data: categories } = useListCategories();

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);

  const amountNum = parseFloat(amount || "0");
  const taxAmount = amountNum * 0.21;
  const total = amountNum + taxAmount;

  const handleSubmit = () => {
    createMutation.mutate({
      data: {
        companyId,
        description,
        categoryId: categoryId ? Number(categoryId) : undefined,
        amount: amountNum.toString(),
        taxRate: "21",
        expenseDate,
        status: "pending",
      }
    }, {
      onSuccess: () => {
        toast({ title: "Gasto registrado", description: "El gasto se ha guardado correctamente." });
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        onClose();
        setDescription(""); setAmount("");
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Gasto">
      <div className="space-y-4">
        <div>
          <Label>Concepto</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del gasto" />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Importe (base)</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
          </div>
        </div>
        <div className="bg-secondary/30 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Base</span>
            <span className="font-mono">{formatCurrency(amountNum.toString())}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">IVA 21%</span>
            <span className="font-mono">{formatCurrency(taxAmount.toString())}</span>
          </div>
          <div className="flex justify-between font-bold mt-2 pt-2 border-t border-border">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(total.toString())}</span>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
