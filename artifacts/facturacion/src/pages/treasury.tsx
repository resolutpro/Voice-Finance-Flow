import { useState } from "react";
import { useListBankAccounts, useListCashMovements, useCreateCashMovement } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Modal, Input, Label, Select } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Landmark, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TreasuryPage() {
  const { activeCompanyId } = useCompany();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: accounts } = useListBankAccounts(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: movements } = useListCashMovements(activeCompanyId ? { companyId: activeCompanyId } : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Tesorería</h2>
          <p className="text-muted-foreground">Control de cuentas y movimientos</p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20" onClick={() => setIsCreateOpen(true)}>
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
                <Badge variant="outline" className="bg-secondary/50">{acc.bankName || "Banco"}</Badge>
              </div>
              <h3 className="text-lg font-semibold mb-1">{acc.name}</h3>
              <p className="text-sm text-muted-foreground font-mono mb-4">{acc.iban || "ES** **** **** **** ****"}</p>
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
                    <td className="px-6 py-4 font-medium">{mov.description || "Movimiento"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{mov.bankAccountName}</td>
                    <td className={`px-6 py-4 text-right font-semibold font-mono flex items-center justify-end gap-2 ${Number(mov.amount) >= 0 ? "text-emerald-600" : "text-foreground"}`}>
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

      <CreateMovementModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} accounts={accounts || []} />
    </div>
  );
}

interface BankAccountOption {
  id: number;
  name: string;
}

function CreateMovementModal({ isOpen, onClose, accounts }: { isOpen: boolean; onClose: () => void; accounts: BankAccountOption[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateCashMovement();

  const [bankAccountId, setBankAccountId] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = () => {
    const numAmount = parseFloat(amount || "0");
    const finalAmount = type === "expense" ? -Math.abs(numAmount) : Math.abs(numAmount);

    createMutation.mutate({
      data: {
        bankAccountId: Number(bankAccountId),
        type,
        amount: finalAmount.toString(),
        description,
        movementDate,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Movimiento registrado", description: "El movimiento se ha guardado y el saldo actualizado." });
        queryClient.invalidateQueries({ queryKey: ["/api/cash-movements"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
        onClose();
        setBankAccountId(""); setAmount(""); setDescription(""); setType("income");
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Movimiento">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Cuenta bancaria</Label>
            <Select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
              <option value="">Selecciona cuenta...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onChange={e => setType(e.target.value as "income" | "expense")}>
              <option value="income">Ingreso</option>
              <option value="expense">Gasto</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Concepto</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del movimiento" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Importe</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || !bankAccountId}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
