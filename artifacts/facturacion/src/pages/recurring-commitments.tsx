import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Loader2,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CommitmentFormModal } from "@/components/commitment-form-modal";
import { useCompany } from "@/hooks/use-company";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";

// Interfaz para TypeScript basada en la tabla que creamos en Drizzle
type RecurringCommitment = {
  id: number;
  title: string;
  type: "gasto" | "ingreso";
  amount: string; // En Drizzle los campos numeric vienen como string
  frequency: string;
  nextDueDate: string;
  active: boolean;
};

export default function RecurringCommitments() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<RecurringCommitment | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const { activeCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Hacemos fetch real a nuestra nueva ruta del API
  const {
    data: commitments = [],
    isLoading,
    isError,
  } = useQuery<RecurringCommitment[]>({
    queryKey: ["recurring-commitments", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const data = await customFetch<RecurringCommitment[]>(`/api/recurring-commitments`, {
        headers: {
          "x-company-id": activeCompanyId.toString(),
        },
      });
      return data;
    },
    enabled: !!activeCompanyId, // Solo se ejecuta si hay una empresa seleccionada
  });

  const handleEdit = (commitment: RecurringCommitment) => {
    setSelectedCommitment(commitment);
    setIsEditModalOpen(true);
  };

  const handleToggleStatus = async (commitment: RecurringCommitment) => {
    if (!activeCompanyId) return;
    
    setIsTogglingStatus(true);
    try {
      await customFetch(
        `/api/recurring-commitments/${commitment.id}/toggle`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": activeCompanyId.toString(),
          },
        }
      );

      toast({
        title: "Estado actualizado",
        description: commitment.active ? "Compromiso pausado" : "Compromiso activado",
      });

      queryClient.invalidateQueries({
        queryKey: ["recurring-commitments", activeCompanyId],
      });
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado del compromiso.",
        variant: "destructive",
      });
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeleteClick = (commitment: RecurringCommitment) => {
    setSelectedCommitment(commitment);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!activeCompanyId || !selectedCommitment) return;
    
    setIsDeleting(true);
    try {
      await customFetch(
        `/api/recurring-commitments/${selectedCommitment.id}`,
        {
          method: "DELETE",
          headers: {
            "x-company-id": activeCompanyId.toString(),
          },
        }
      );

      toast({
        title: "Compromiso eliminado",
        description: "El compromiso ha sido eliminado correctamente.",
      });

      queryClient.invalidateQueries({
        queryKey: ["recurring-commitments", activeCompanyId],
      });
      
      setIsDeleteDialogOpen(false);
      setSelectedCommitment(null);
    } catch (error) {
      console.error("Error al eliminar:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el compromiso.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recurrentes</h1>
          <p className="text-muted-foreground">
            Gestiona tus ingresos y gastos periódicos para la previsión de
            tesorería.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo Compromiso
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-red-500">
            Hubo un error al cargar la información.
          </div>
        ) : commitments.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Repeat className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">
              No hay compromisos configurados
            </h3>
            <p className="text-muted-foreground mt-2 mb-4">
              Aún no has registrado ningún gasto o ingreso recurrente en la base
              de datos.
            </p>
            <Button variant="outline" onClick={() => setIsModalOpen(true)}>
              Crear el primero
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Próx. Vencimiento</TableHead>
                <TableHead className="text-right">Importe Est.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commitments.map((item) => (
                <TableRow
                  key={item.id}
                  className={!item.active ? "opacity-50 grayscale" : ""}
                >
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>
                    {item.type === "gasto" ? (
                      <Badge
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-700 flex w-fit items-center"
                      >
                        <ArrowDownRight className="mr-1 h-3 w-3" /> Gasto
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-green-200 bg-green-50 text-green-700 flex w-fit items-center"
                      >
                        <ArrowUpRight className="mr-1 h-3 w-3" /> Ingreso
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {item.frequency.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm">
                      <Calendar className="mr-2 h-3 w-3 text-muted-foreground" />
                      {new Date(item.nextDueDate).toLocaleDateString("es-ES")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {/* Convertimos el string numérico de BD a Number antes de formatearlo */}
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    }).format(Number(item.amount))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "secondary" : "outline"}>
                      {item.active ? "Activo" : "Pausado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={isTogglingStatus || isDeleting}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(item)}>
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleToggleStatus(item)}
                          disabled={isTogglingStatus}
                        >
                          {item.active ? "Pausar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => handleDeleteClick(item)}
                          disabled={isDeleting}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modal de creación */}
      <CommitmentFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Modal de edición */}
      <CommitmentFormModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedCommitment(null);
        }}
        commitmentId={selectedCommitment?.id}
        initialData={selectedCommitment ? {
          id: selectedCommitment.id,
          type: selectedCommitment.type,
          title: selectedCommitment.title,
          amount: selectedCommitment.amount,
          frequency: selectedCommitment.frequency,
          startDate: selectedCommitment.nextDueDate,
        } : undefined}
      />

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar compromiso</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar "{selectedCommitment?.title}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
