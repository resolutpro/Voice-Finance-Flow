import { useState } from "react";
import {
  Plus,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
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
import { CommitmentFormModal } from "@/components/commitment-form-modal";

export default function RecurringCommitments() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Datos simulados (Mocks). Pronto vendrán de tu API.
  const commitments = [
    {
      id: 1,
      title: "Alquiler Oficina",
      type: "gasto",
      amount: 1200,
      frequency: "mensual",
      nextDueDate: "2024-04-01",
      active: true,
    },
    {
      id: 2,
      title: "Iguala Contable",
      type: "gasto",
      amount: 150,
      frequency: "mensual",
      nextDueDate: "2024-04-05",
      active: true,
    },
    {
      id: 3,
      title: "Seguros Sociales",
      type: "gasto",
      amount: 850,
      frequency: "ultimo_dia_habil_mes",
      nextDueDate: "2024-03-29",
      active: true,
    },
    {
      id: 4,
      title: "IVA 1T",
      type: "gasto",
      amount: 3500,
      frequency: "impuestos_trimestrales",
      nextDueDate: "2024-04-20",
      active: true,
    },
    {
      id: 5,
      title: "Suscripción Cliente VIP",
      type: "ingreso",
      amount: 500,
      frequency: "mensual",
      nextDueDate: "2024-04-01",
      active: false,
    },
  ];

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
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: "EUR",
                  }).format(item.amount)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.active ? "secondary" : "outline"}>
                    {item.active ? "Activo" : "Pausado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Editar</DropdownMenuItem>
                      <DropdownMenuItem>
                        {item.active ? "Pausar" : "Activar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CommitmentFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
