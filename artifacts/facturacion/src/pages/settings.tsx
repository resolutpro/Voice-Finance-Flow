import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListCompanies } from "@workspace/api-client-react"; // Importamos tus empresas reales
import { Trash2, Building2 } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Obtenemos la lista de empresas reales de tu API
  const { data: companies, isLoading } = useListCompanies();

  // Estado para el formulario
  const [formData, setFormData] = useState({
    name: "",
    taxId: "",
    address: "",
  });

  // Mutación para CREAR empresa
  const createCompanyMutation = useMutation({
    mutationFn: async (newCompany: typeof formData) => {
      // Usamos ruta relativa por si el proxy de Vite lo maneja, o pon "http://localhost:3000/api/companies" si falla
      const res = await fetch("http://localhost:3000/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCompany),
      });
      if (!res.ok) throw new Error("Error al crear");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Empresa creada" });
      setFormData({ name: "", taxId: "", address: "" });
      queryClient.invalidateQueries({ queryKey: ["companies"] }); // Refresca la tabla
    },
    onError: () => toast({ title: "❌ Error", variant: "destructive" }),
  });

  // Mutación para BORRAR empresa
  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`http://localhost:3000/api/companies/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al borrar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "🗑️ Empresa eliminada" });
      queryClient.invalidateQueries({ queryKey: ["companies"] }); // Refresca la tabla
    },
    onError: () =>
      toast({
        title: "❌ Error al borrar",
        description: "Es posible que tenga facturas asociadas.",
        variant: "destructive",
      }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCompanyMutation.mutate(formData);
  };

  return (
    <div className="p-2 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="w-8 h-8" />
          Empresas y Configuración
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona las empresas asociadas a tu cuenta.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUMNA IZQUIERDA: Formulario de alta */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Añadir Empresa</CardTitle>
              <CardDescription>
                Registra una nueva entidad fiscal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Razón Social *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="taxId">NIF / CIF</Label>
                  <Input
                    id="taxId"
                    value={formData.taxId}
                    onChange={(e) =>
                      setFormData({ ...formData, taxId: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createCompanyMutation.isPending}
                >
                  {createCompanyMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* COLUMNA DERECHA: Tabla de empresas existentes */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Empresas registradas</CardTitle>
              <CardDescription>
                Listado de todas tus empresas activas en el sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Cargando empresas...
                </p>
              ) : companies && companies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>NIF/CIF</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">
                          {company.name}
                        </TableCell>
                        <TableCell>{company.taxId || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Estás seguro de borrar la empresa ${company.name}?`,
                                )
                              ) {
                                deleteCompanyMutation.mutate(company.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay empresas registradas todavía. Usa el formulario para
                  crear la primera.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
