import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CommitmentFormModal({ isOpen, onClose }: Props) {
  // En un caso real, aquí usarías react-hook-form y zod para validar
  const [type, setType] = useState("gasto");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Compromiso Recurrente</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Tipo</Label>
            <RadioGroup 
              defaultValue="gasto" 
              className="flex space-x-4 col-span-3"
              onValueChange={setType}
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
            <Label htmlFor="title" className="text-right">Concepto</Label>
            <Input id="title" placeholder="Ej: Alquiler Oficina" className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">Importe (€)</Label>
            <Input id="amount" type="number" step="0.01" placeholder="0.00" className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="frequency" className="text-right">Frecuencia</Label>
            <div className="col-span-3">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una frecuencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="ultimo_dia_habil_mes">Último día hábil (Seguros Sociales)</SelectItem>
                  <SelectItem value="impuestos_trimestrales">Día 20 Trimestral (IVA/IRPF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startDate" className="text-right">Inicio</Label>
            <Input id="startDate" type="date" className="col-span-3" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Guardar Compromiso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}