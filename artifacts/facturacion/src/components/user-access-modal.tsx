import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
// Ajusta hooks según tu API generada
import {
  usePostAuthorizedUsers,
  usePutAuthorizedUsersUserId,
  useListCompanies,
} from "@workspace/api-client-react";

// Lista de módulos disponibles en tu app
const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard (Resumen)" },
  { id: "invoices", label: "Ventas y Facturación" },
  { id: "purchases", label: "Compras y Gastos" },
  { id: "treasury", label: "Tesorería y Bancos" },
  { id: "forecast", label: "Previsión de Caja" },
  { id: "tasks", label: "Tareas" },
];

export function UserAccessModal({ isOpen, onClose, user, onSuccess }: any) {
  const { toast } = useToast();
  // Traemos todas las empresas del owner para poder asignárselas al nuevo usuario
  const { data: companies } = useListCompanies();

  const { mutateAsync: createUser, isPending: isCreating } =
    usePostAuthorizedUsers();
  const { mutateAsync: updateUser, isPending: isUpdating } =
    usePutAuthorizedUsersUserId();

  const [formData, setFormData] = useState({
    email: "",
    name: "",
  });

  // Estado para guardar la matriz de { companyId, modules: string[] }
  const [accessMap, setAccessMap] = useState<Record<string, string[]>>({});

  // Precargar datos si estamos editando
  useEffect(() => {
    if (user) {
      setFormData({ email: user.email, name: user.name });
      const initialAccess: Record<string, string[]> = {};
      user.companyAccess.forEach((acc: any) => {
        initialAccess[acc.companyId] = acc.modules;
      });
      setAccessMap(initialAccess);
    } else {
      setFormData({ email: "", name: "" });
      setAccessMap({});
    }
  }, [user, isOpen]);

  const handleModuleToggle = (companyId: string, moduleId: string) => {
    setAccessMap((prev) => {
      const currentModules = prev[companyId] || [];
      const isSelected = currentModules.includes(moduleId);

      const newModules = isSelected
        ? currentModules.filter((m) => m !== moduleId) // Quitar
        : [...currentModules, moduleId]; // Añadir

      return { ...prev, [companyId]: newModules };
    });
  };

  const handleSave = async () => {
    try {
      // Transformar el record (objeto) de vuelta al array que espera el backend Zod
      const companyAccessPayload = Object.entries(accessMap)
        .filter(([_, modules]) => modules.length > 0) // Ignorar empresas sin módulos seleccionados
        .map(([companyId, modules]) => ({
          companyId,
          modules,
        }));

      if (user) {
        await updateUser({
          userId: user.id,
          data: { companyAccess: companyAccessPayload },
        });
        toast({
          title: "Permisos actualizados",
          description: "El acceso se ha modificado correctamente.",
        });
      } else {
        await createUser({
          data: { ...formData, companyAccess: companyAccessPayload },
        });
        toast({
          title: "Usuario invitado",
          description: "Se ha creado el acceso correctamente.",
        });
      }
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un problema al guardar.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user ? "Editar Permisos" : "Invitar Usuario"}
          </DialogTitle>
          <DialogDescription>
            Configura a qué empresas y módulos puede acceder este usuario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={!!user} // No dejar cambiar el nombre si ya existe
                placeholder="Ej. Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={!!user} // No dejar cambiar email si ya existe
                placeholder="juan@ejemplo.com"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">
              Permisos por Empresa
            </h3>
            {companies?.map((company) => (
              <div
                key={company.id}
                className="p-4 border rounded-md bg-slate-50 dark:bg-slate-900"
              >
                <h4 className="font-medium mb-3">{company.name}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_MODULES.map((mod) => (
                    <div key={mod.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${company.id}-${mod.id}`}
                        checked={(accessMap[company.id] || []).includes(mod.id)}
                        onCheckedChange={() =>
                          handleModuleToggle(company.id, mod.id)
                        }
                      />
                      <Label
                        htmlFor={`${company.id}-${mod.id}`}
                        className="cursor-pointer font-normal"
                      >
                        {mod.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isCreating || isUpdating}>
            {isCreating || isUpdating ? "Guardando..." : "Guardar Permisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
