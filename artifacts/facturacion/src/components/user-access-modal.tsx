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
import {
  usePostAuthorizedUsers,
  usePutAuthorizedUsersUserId,
  useListCompanies,
} from "@workspace/api-client-react";

const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard / Resumen" },
  { id: "invoices", label: "Ventas y Facturación" },
  { id: "purchases", label: "Compras y Proveedores" },
  { id: "treasury", label: "Tesorería y Bancos" },
  { id: "forecast", label: "Previsión de Caja" },
  { id: "debt-control", label: "Control de Deuda" },
  { id: "recurring-commitments", label: "Compromisos Recurrentes" },
  { id: "contabilidad", label: "Contabilidad" },
  { id: "tasks", label: "Tareas y Seguimiento" },
  { id: "informes", label: "Informes y Analytics" },
  { id: "settings", label: "Configuración" },
];

export function UserAccessModal({ isOpen, onClose, user, onSuccess }: any) {
  const { toast } = useToast();
  const { data: companies } = useListCompanies();

  const { mutateAsync: createUser, isPending: isCreating } =
    usePostAuthorizedUsers();
  const { mutateAsync: updateUser, isPending: isUpdating } =
    usePutAuthorizedUsersUserId();

  // 1. Añadimos 'password' al estado inicial
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
  });

  const [accessMap, setAccessMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (user) {
      // 2. Al editar, cargamos nombre y email, dejamos password vacío (opcional)
      setFormData({ email: user.email, name: user.name, password: "" });
      const initialAccess: Record<string, string[]> = {};
      user.companyAccess?.forEach((acc: any) => {
        initialAccess[acc.companyId] = acc.modules || [];
      });
      setAccessMap(initialAccess);
    } else {
      setFormData({ email: "", name: "", password: "" });
      setAccessMap({});
    }
  }, [user, isOpen]);

  const handleModuleToggle = (companyId: string, moduleId: string) => {
    setAccessMap((prev) => {
      const currentModules = prev[companyId] || [];
      const isSelected = currentModules.includes(moduleId);

      const newModules = isSelected
        ? currentModules.filter((m) => m !== moduleId)
        : [...currentModules, moduleId];

      return { ...prev, [companyId]: newModules };
    });
  };

  const handleSave = async () => {
    // Validar contraseña al crear
    if (!user && formData.password.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      const companyAccessPayload = Object.entries(accessMap)
        .filter(([_, modules]) => modules.length > 0)
        .map(([companyId, modules]) => ({
          companyId: parseInt(companyId, 10),
          modules,
        }));

      if (user) {
        // 3. Al actualizar, enviamos los datos del formulario.
        // Si dejó el password vacío, no lo enviamos.
        const updatePayload: any = {
          name: formData.name,
          email: formData.email,
          companyAccess: companyAccessPayload,
        };
        if (formData.password) updatePayload.password = formData.password;

        await updateUser({
          userId: user.id,
          data: updatePayload,
        });
        toast({
          title: "Permisos actualizados",
          description: "El usuario se ha modificado correctamente.",
        });
      } else {
        await createUser({
          data: { ...formData, companyAccess: companyAccessPayload } as any,
        });
        toast({
          title: "Usuario invitado",
          description: "Se ha creado el usuario y su acceso.",
        });
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
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
          <DialogTitle>{user ? "Editar Usuario" : "Crear Usuario"}</DialogTitle>
          <DialogDescription>
            Configura los datos del usuario y a qué empresas/módulos tiene
            acceso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              {/* Hemos quitado el disabled={!!user} */}
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ej. Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              {/* Hemos quitado el disabled={!!user} */}
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="juan@ejemplo.com"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>
                {user ? "Nueva Contraseña (Opcional)" : "Contraseña"}
              </Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder={
                  user
                    ? "Deja en blanco para mantener la actual"
                    : "Mínimo 6 caracteres"
                }
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
                          handleModuleToggle(company.id.toString(), mod.id)
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
            {isCreating || isUpdating ? "Guardando..." : "Guardar Usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
