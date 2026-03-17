import { useState, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useListCompanies } from "@workspace/api-client-react";
import {
  Trash2,
  Building2,
  Upload,
  Users,
  Edit2,
  ImageIcon,
  Palette,
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";

// --- COMPONENTE INTERNO PARA EDITAR LOGO Y COLOR DE EMPRESA ---
function EditCompanyDialog({
  company,
  onClose,
}: {
  company: any;
  onClose: () => void;
}) {
  const [logoBase64, setLogoBase64] = useState(company?.logo || "");
  const [themeColor, setThemeColor] = useState(
    company?.themeColor || "#000000",
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Empresa actualizada" });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      onClose();
    },
    onError: () =>
      toast({ title: "❌ Error al actualizar", variant: "destructive" }),
  });

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar {company.name}</DialogTitle>
          <DialogDescription>
            Configura la imagen corporativa y el color de la aplicación.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Logo
            </Label>
            <div className="flex items-center gap-4">
              {logoBase64 && (
                <img
                  src={logoBase64}
                  className="w-12 h-12 object-contain border rounded"
                  alt="Preview"
                />
              )}
              <Input type="file" accept="image/*" onChange={handleLogoUpload} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" /> Color Corporativo
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <span className="text-sm font-mono">{themeColor}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              updateMutation.mutate({ logo: logoBase64, themeColor })
            }
          >
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- QUERIES ---
  const { data: companies, isLoading: isLoadingCompanies } = useListCompanies();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");
  const [editingCompany, setEditingCompany] = useState<any>(null);

  const { data: clients, isLoading: isLoadingClients } = useQuery({
    queryKey: ["clients", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/clients?companyId=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  // --- ESTADOS DE FORMULARIO ---
  const [companyFormData, setCompanyFormData] = useState({
    name: "",
    taxId: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    phone: "",
    fax: "",
  });

  const [clientFormData, setClientFormData] = useState({
    name: "",
    taxId: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    phone: "",
    fax: "",
  });

  const [editingClient, setEditingClient] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- MUTACIONES ---
  const createCompanyMutation = useMutation({
    mutationFn: async (newCompany: typeof companyFormData) => {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCompany),
      });
      if (!res.ok) throw new Error("Error al crear");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Empresa creada" });
      setCompanyFormData({
        name: "",
        taxId: "",
        address: "",
        city: "",
        province: "",
        postalCode: "",
        phone: "",
        fax: "",
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al borrar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "🗑️ Empresa eliminada" });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (newClient: any) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Cliente creado" });
      setClientFormData({
        name: "",
        taxId: "",
        address: "",
        city: "",
        province: "",
        postalCode: "",
        phone: "",
        fax: "",
      });
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (updatedClient: any) => {
      const res = await fetch(`/api/clients/${updatedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedClient),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Cliente actualizado" });
      setEditingClient(null);
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/clients/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "🗑️ Cliente eliminado" });
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    },
  });

  // --- HANDLERS ---
  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    createCompanyMutation.mutate(companyFormData);
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId)
      return toast({
        title: "⚠️ Selecciona una empresa",
        variant: "destructive",
      });
    createClientMutation.mutate({
      ...clientFormData,
      companyId: Number(selectedCompanyId),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompanyId) return;
    setIsUploading(true);
    try {
      const text = await file.text();
      const rows = text.split("\n").filter((r) => r.trim().length > 0);
      for (let i = 0; i < rows.length; i++) {
        const cols = rows[i]
          .split("\t")
          .map((c) => c.trim().replace(/['"]/g, ""));
        if (i === 0 && cols[0].toUpperCase().includes("EMPRESA")) continue;
        if (cols[0]) {
          await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: Number(selectedCompanyId),
              name: cols[0],
              taxId: cols[1],
              address: cols[2],
              city: cols[3],
              province: cols[4],
              postalCode: cols[5],
              phone: cols[6],
              fax: cols[7],
            }),
          });
        }
      }
      toast({ title: "Importación completada" });
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    } catch (err) {
      toast({ title: "Error leyendo el archivo", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-2 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="w-8 h-8 text-primary" /> Configuración
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona la identidad visual de tus empresas y sus carteras de
          clientes.
        </p>
      </div>

      <Tabs defaultValue="empresas" className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="empresas" className="flex gap-2">
            <Building2 className="w-4 h-4" /> Empresas
          </TabsTrigger>
          <TabsTrigger value="clientes" className="flex gap-2">
            <Users className="w-4 h-4" /> Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresas">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Añadir Empresa</CardTitle>
                  <CardDescription>
                    Registra una nueva entidad fiscal.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCompany} className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Razón Social *</Label>
                      <Input
                        value={companyFormData.name}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            name: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>NIF / CIF *</Label>
                      <Input
                        value={companyFormData.taxId}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            taxId: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Dirección *</Label>
                      <Input
                        value={companyFormData.address}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            address: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Localidad *</Label>
                        <Input
                          value={companyFormData.city}
                          onChange={(e) =>
                            setCompanyFormData({
                              ...companyFormData,
                              city: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>C.P. *</Label>
                        <Input
                          value={companyFormData.postalCode}
                          onChange={(e) =>
                            setCompanyFormData({
                              ...companyFormData,
                              postalCode: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-2"
                      disabled={createCompanyMutation.isPending}
                    >
                      {createCompanyMutation.isPending
                        ? "Guardando..."
                        : "Guardar Empresa"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Empresas registradas</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingCompanies ? (
                    <p>Cargando...</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Logo</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies?.map((company: any) => (
                          <TableRow key={company.id}>
                            <TableCell>
                              {company.logo ? (
                                <img
                                  src={company.logo}
                                  className="w-8 h-8 object-contain rounded border"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-[10px]">
                                  Sin logo
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {company.name}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded-full border shadow-sm"
                                  style={{
                                    backgroundColor:
                                      company.themeColor || "#000",
                                  }}
                                ></div>
                                <span className="text-xs">
                                  {company.themeColor || "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-500"
                                onClick={() => setEditingCompany(company)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500"
                                onClick={() =>
                                  confirm("¿Borrar?") &&
                                  deleteCompanyMutation.mutate(company.id)
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clientes">
          <div className="mb-6 max-w-md">
            <Label className="mb-2 block text-base font-semibold">
              Selecciona la empresa:
            </Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
              value={selectedCompanyId}
              onChange={(e) =>
                setSelectedCompanyId(
                  e.target.value ? Number(e.target.value) : "",
                )
              }
            >
              <option value="" disabled>
                -- Elige una empresa --
              </option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCompanyId ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Añadir Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateClient} className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Nombre (EMPRESA) *</Label>
                        <Input
                          value={clientFormData.name}
                          onChange={(e) =>
                            setClientFormData({
                              ...clientFormData,
                              name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>NIF / CIF</Label>
                        <Input
                          value={clientFormData.taxId}
                          onChange={(e) =>
                            setClientFormData({
                              ...clientFormData,
                              taxId: e.target.value,
                            })
                          }
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full mt-2"
                        disabled={createClientMutation.isPending}
                      >
                        Guardar Cliente
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/30">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Importar CSV/TSV
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Input
                      type="file"
                      accept=".csv, .tsv, .txt"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </CardContent>
                </Card>
              </div>
              <div className="lg:col-span-2">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Clientes registrados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingClients ? (
                      <p>Cargando clientes...</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>CIF</TableHead>
                            <TableHead className="text-right">
                              Acciones
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clients?.map((client: any) => (
                            <TableRow key={client.id}>
                              <TableCell className="font-medium">
                                {client.name}
                              </TableCell>
                              <TableCell>{client.taxId || "-"}</TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-blue-500"
                                  onClick={() => setEditingClient(client)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500"
                                  onClick={() =>
                                    confirm("¿Borrar?") &&
                                    deleteClientMutation.mutate(client.id)
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center p-12 border-2 border-dashed rounded-xl text-muted-foreground">
              Selecciona una empresa para gestionar sus clientes.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* MODALES */}
      {editingCompany && (
        <EditCompanyDialog
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
        />
      )}

      {editingClient && (
        <Dialog
          open={!!editingClient}
          onOpenChange={() => setEditingClient(null)}
        >
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateClientMutation.mutate(editingClient);
              }}
              className="space-y-4"
            >
              <div className="grid gap-2">
                <Label>Nombre *</Label>
                <Input
                  value={editingClient.name}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>CIF</Label>
                <Input
                  value={editingClient.taxId || ""}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      taxId: e.target.value,
                    })
                  }
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setEditingClient(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Guardar Cambios</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
