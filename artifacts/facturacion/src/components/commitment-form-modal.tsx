import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CommitmentFormModal({ isOpen, onClose }: Props) {
  const [type, setType] = useState("gasto");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("mensual");
  const [startDate, setStartDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();

  // Cambiamos el evento del formulario por un onClick directo
  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();

    console.log("1. Botón pulsado. Datos actuales:", {
      activeCompanyId,
      type,
      title,
      amount,
      frequency,
      startDate,
    });

    // Validación 1: Empresa
    if (!activeCompanyId) {
      console.warn("Fallo: No hay activeCompanyId");
      toast({
        title: "Error",
        description: "No hay ninguna empresa seleccionada.",
        variant: "destructive",
      });
      return;
    }

    // Validación 2: Campos obligatorios (manual en vez de HTML5)
    if (!title || !amount || !startDate) {
      console.warn("Fallo: Faltan campos");
      toast({
        title: "Atención",
        description: "Por favor, rellena Concepto, Importe y Fecha de inicio.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log("2. Enviando datos al servidor...");

    try {
      // AQUÍ ESTÁ LA CLAVE: Añadimos companyId al payload para que el backend lo reciba
      const payload = {
        companyId: activeCompanyId,
        type,
        title,
        amount,
        frequency,
        startDate,
      };

      console.log("Payload:", payload);

      const res = await customFetch("/api/recurring-commitments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": activeCompanyId.toString(), // Lo mantenemos por si tu middleware lo usa
        },
        body: JSON.stringify(payload),
      });

      console.log("3. Respuesta del servidor HTTP:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        console.error("Error devuelto por la API:", errorData);
        throw new Error("Error al guardar en el backend");
      }

      toast({
        title: "Compromiso guardado",
        description: "El compromiso recurrente ha sido creado con éxito.",
      });

      queryClient.invalidateQueries({
        queryKey: ["recurring-commitments", activeCompanyId],
      });

      // Limpiar y cerrar
      setTitle("");
      setAmount("");
      setFrequency("mensual");
      setStartDate("");
      onClose();
    } catch (error) {
      console.error("4. Excepción capturada:", error);
      toast({
        title: "Error al guardar",
        description: "Revisa la consola para más detalles.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Compromiso Recurrente</DialogTitle>
        </DialogHeader>

        {/* Hemos quitado la etiqueta <form> y los 'required' de HTML5 */}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Tipo</Label>
            <RadioGroup
              value={type}
              onValueChange={setType}
              className="flex space-x-4 col-span-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="gasto" id="gasto" />
                <Label htmlFor="gasto">Gasto</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ingreso" id="ingreso" />
                <Label htmlFor="ingreso">Ingreso</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Concepto
            </Label>
            <Input
              id="title"
              placeholder="Ej: Alquiler Oficina"
              className="col-span-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Importe (€)
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              className="col-span-3"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="frequency" className="text-right">
              Frecuencia
            </Label>
            <div className="col-span-3">
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una frecuencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="ultimo_dia_habil_mes">
                    Último día hábil (S. Sociales)
                  </SelectItem>
                  <SelectItem value="impuestos_trimestrales">
                    Día 20 Trimestral (IVA/IRPF)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startDate" className="text-right">
              Inicio
            </Label>
            <Input
              id="startDate"
              type="date"
              className="col-span-3"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          {/* El botón llama directamente a handleSave */}
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Compromiso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
