import { useState, useEffect } from "react";
import {
  useListBankAccounts,
  useListCashMovements,
  useCreateCashMovement,
  useCreateBankAccount, // Añadimos el hook para crear cuentas
} from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Modal,
  Input,
  Label,
  Select,
} from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  Upload,
  Camera,
  Star,
  AlertCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TreasuryPage() {
  const { activeCompanyId } = useCompany();
  const [isCreateMovementOpen, setIsCreateMovementOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [accountToUpdate, setAccountToUpdate] = useState<any>(null);

  // Al pasar activeCompanyId, se filtra por empresa. Si no hay, trae todas (vista consolidada multimarca)
  const { data: accounts } = useListBankAccounts(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );
  const { data: movements } = useListCashMovements(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );

  // Cálculo de liquidez total consolidada
  const totalBalance =
    accounts?.reduce((sum, acc) => sum + Number(acc.currentBalance), 0) || 0;

  // Determinar cuenta principal (la de mayor saldo, por dar una jerarquía visual sin cambiar BD)
  const mainAccountId = accounts?.length
    ? [...accounts].sort(
        (a, b) => Number(b.currentBalance) - Number(a.currentBalance),
      )[0].id
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">
            Tesorería
          </h2>
          <p className="text-muted-foreground">
            Control de liquidez, cuentas y movimientos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setIsCreateAccountOpen(true)}
          >
            <Landmark className="w-4 h-4" /> Añadir Cuenta
          </Button>
          <Button
            className="gap-2 shadow-lg shadow-primary/20"
            onClick={() => setIsCreateMovementOpen(true)}
          >
            <Plus className="w-4 h-4" /> Registrar Movimiento
          </Button>
        </div>
      </div>

      {/* Tarjeta de Total Consolidado */}
      <div className="mb-6 p-6 rounded-2xl bg-primary text-primary-foreground flex justify-between items-center shadow-lg">
        <div>
          <p className="text-primary-foreground/80 text-sm font-medium mb-1">
            Total Liquidez Disponible
          </p>
          <h3 className="text-4xl sm:text-5xl font-display font-bold">
            {formatCurrency(totalBalance)}
          </h3>
        </div>
        <div className="hidden sm:block opacity-20">
          <Landmark className="w-20 h-20" />
        </div>
      </div>

      {/* Grid de Cuentas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts?.map((acc) => (
          <Card
            key={acc.id}
            className={`group transition-all ${acc.id === mainAccountId ? "border-primary shadow-md" : "hover:border-primary/50"}`}
          >
            <CardContent className="p-6 flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant={acc.id === mainAccountId ? "default" : "outline"}
                    className={
                      acc.id !== mainAccountId ? "bg-secondary/50" : ""
                    }
                  >
                    {acc.id === mainAccountId && (
                      <Star className="w-3 h-3 mr-1 fill-current" />
                    )}
                    {acc.id === mainAccountId
                      ? "Principal"
                      : acc.bankName || "Secundaria"}
                  </Badge>
                  {acc.updatedAt && (
                    <span
                      className="text-[10px] text-muted-foreground"
                      title="Última actualización"
                    >
                      Act: {formatDate(acc.updatedAt)}
                    </span>
                  )}
                </div>
              </div>

              <h3
                className="text-lg font-semibold mb-1 truncate"
                title={acc.name}
              >
                {acc.name}
              </h3>
              <p className="text-sm text-muted-foreground font-mono mb-4">
                {acc.iban || "Sin IBAN registrado"}
              </p>

              <div className="text-3xl font-display font-bold text-foreground mb-6 flex-grow">
                {formatCurrency(acc.currentBalance)}
              </div>

              {/* Acciones de actualización de cuenta */}
              <div className="flex gap-2 pt-4 border-t border-border/60 mt-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs h-8 flex-1 bg-secondary/50 hover:bg-secondary"
                  onClick={() => setAccountToUpdate(acc)}
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Actualizar saldo
                  manual
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Tarjeta para añadir cuenta vacía */}
        {!accounts?.length && (
          <Card className="border-dashed border-2 bg-secondary/10 flex items-center justify-center min-h-[200px]">
            <CardContent className="flex flex-col items-center text-center p-6">
              <Landmark className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">Aún no hay cuentas</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Añade tu primera cuenta para controlar la tesorería.
              </p>
              <Button
                variant="outline"
                onClick={() => setIsCreateAccountOpen(true)}
              >
                Crear Cuenta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Movimientos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Concepto</th>
                  <th className="px-6 py-4 font-semibold">Cuenta</th>
                  <th className="px-6 py-4 font-semibold text-right">
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {movements?.map((mov) => (
                  <tr
                    key={mov.id}
                    className="hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(mov.movementDate)}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {mov.description || "Movimiento"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {mov.bankAccountName}
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-semibold font-mono flex items-center justify-end gap-2 ${Number(mov.amount) >= 0 ? "text-emerald-600" : "text-foreground"}`}
                    >
                      {Number(mov.amount) >= 0 ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-destructive" />
                      )}
                      {formatCurrency(mov.amount)}
                    </td>
                  </tr>
                ))}
                {!movements?.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No hay movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modales */}
      <CreateAccountModal
        isOpen={isCreateAccountOpen}
        onClose={() => setIsCreateAccountOpen(false)}
        activeCompanyId={activeCompanyId}
      />
      <CreateMovementModal
        isOpen={isCreateMovementOpen}
        onClose={() => setIsCreateMovementOpen(false)}
        accounts={accounts || []}
      />
      <UpdateBalanceModal
        account={accountToUpdate}
        onClose={() => setAccountToUpdate(null)}
      />
    </div>
  );
}

// --- Componente: Modal para CREAR NUEVA CUENTA BANCARIA ---
function CreateAccountModal({
  isOpen,
  onClose,
  activeCompanyId,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeCompanyId: number | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateBankAccount();

  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [initialBalance, setInitialBalance] = useState("");

  const handleSubmit = () => {
    if (!activeCompanyId) return;

    createMutation.mutate(
      {
        data: {
          companyId: activeCompanyId,
          name,
          bankName,
          iban,
          currentBalance: initialBalance || "0",
          active: true,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Cuenta creada",
            description: "La cuenta bancaria ha sido registrada exitosamente.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
          onClose();
          // Limpiar formulario
          setName("");
          setBankName("");
          setIban("");
          setInitialBalance("");
        },
      },
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Añadir Cuenta Bancaria">
      {!activeCompanyId ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Por favor, selecciona una empresa en el menú principal para poder
            asociarle esta nueva cuenta bancaria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Nombre de la cuenta (Ej. Principal, Nóminas, Pagos)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Cuenta Principal Sabadell"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Entidad Bancaria</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Ej. Banco Sabadell"
              />
            </div>
            <div>
              <Label>Saldo Inicial</Label>
              <Input
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <Label>IBAN (Opcional)</Label>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !name}
            >
              Guardar Cuenta
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// --- Componente: Modal para nuevo movimiento transaccional ---
interface BankAccountOption {
  id: number;
  name: string;
}
function CreateMovementModal({
  isOpen,
  onClose,
  accounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccountOption[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateCashMovement();

  const [bankAccountId, setBankAccountId] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [movementDate, setMovementDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const handleSubmit = () => {
    const numAmount = parseFloat(amount || "0");
    const finalAmount =
      type === "expense" ? -Math.abs(numAmount) : Math.abs(numAmount);

    createMutation.mutate(
      {
        data: {
          bankAccountId: Number(bankAccountId),
          type,
          amount: finalAmount.toString(),
          description,
          movementDate,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Movimiento registrado",
            description: "El saldo ha sido actualizado automáticamente.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/cash-movements"] });
          queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
          onClose();
          setBankAccountId("");
          setAmount("");
          setDescription("");
          setType("income");
        },
      },
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Movimiento">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Cuenta bancaria</Label>
            <Select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Selecciona cuenta...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as "income" | "expense")}
            >
              <option value="income">Ingreso</option>
              <option value="expense">Gasto</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Concepto</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Ingreso en efectivo..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Importe</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input
              type="date"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !bankAccountId || !amount}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- Componente: Modal para actualizar saldo de forma manual (cuadre) ---
function UpdateBalanceModal({
  account,
  onClose,
}: {
  account: any;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [balance, setBalance] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (account) setBalance(account.currentBalance);
  }, [account]);

  const handleSubmit = async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bank-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentBalance: balance.toString() }),
      });
      if (res.ok) {
        toast({
          title: "Saldo Cuadrado",
          description: "El balance de la cuenta ha sido actualizado con éxito.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
        onClose();
      } else throw new Error("Error updating balance");
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un problema al actualizar el saldo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={!!account} onClose={onClose} title="Cuadre Manual de Saldo">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Establece el saldo real actual de la cuenta{" "}
          <strong>{account?.name}</strong>.
        </p>
        <div>
          <Label>Nuevo Saldo Disponible</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">
              €
            </span>
            <Input
              type="number"
              step="0.01"
              className="pl-8 text-lg font-bold h-12"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || balance === ""}>
            {isLoading ? "Actualizando..." : "Confirmar Saldo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
