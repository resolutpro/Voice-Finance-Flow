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
import { Trash2, Building2, Upload, Users, Edit2 } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- QUERIES ---
  const { data: companies, isLoading: isLoadingCompanies } = useListCompanies();

  // Estado para saber qué empresa está seleccionada para añadir clientes
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");

  // Query para clientes (depende de la empresa seleccionada)
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

  // Estado para el cliente que se está editando
  const [editingClient, setEditingClient] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- MUTACIONES EMPRESAS ---
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
    onError: () =>
      toast({ title: "❌ Error al crear empresa", variant: "destructive" }),
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

  // --- MUTACIONES CLIENTES ---
  const createClientMutation = useMutation({
    mutationFn: async (newClient: any) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient),
      });
      if (!res.ok) throw new Error("Error al crear cliente");
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
    onError: () =>
      toast({ title: "❌ Error al crear cliente", variant: "destructive" }),
  });

  const updateClientMutation = useMutation({
    mutationFn: async (updatedClient: any) => {
      const res = await fetch(`/api/clients/${updatedClient.id}`, {
        // Asumiendo que tu API usa PUT (o PATCH) para actualizar
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedClient),
      });
      if (!res.ok) throw new Error("Error al actualizar cliente");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Cliente actualizado" });
      setEditingClient(null);
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    },
    onError: () =>
      toast({
        title: "❌ Error al actualizar cliente",
        variant: "destructive",
      }),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al borrar");
      return res.json();
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
    if (!selectedCompanyId) {
      toast({
        title: "⚠️ Selecciona una empresa primero",
        variant: "destructive",
      });
      return;
    }
    createClientMutation.mutate({
      ...clientFormData,
      companyId: Number(selectedCompanyId),
    });
  };

  const handleUpdateClient = (e: React.FormEvent) => {
    e.preventDefault();
    updateClientMutation.mutate(editingClient);
  };

  // Lógica para parsear TSV/CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompanyId) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const rows = text.split("\n").filter((row) => row.trim().length > 0);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const columns = rows[i]
          .split("\t")
          .map((c) => c.trim().replace(/['"]/g, ""));

        // Saltar cabecera si existe
        if (i === 0 && columns[0].toUpperCase().includes("EMPRESA")) continue;

        // Validar que tengamos al menos el nombre (columns.length >= 1 y no esté vacío)
        if (columns.length >= 1 && columns[0]) {
          try {
            const res = await fetch("/api/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: Number(selectedCompanyId),
                name: columns[0] || "",
                taxId: columns[1] || "",
                address: columns[2] || "",
                city: columns[3] || "",
                province: columns[4] || "",
                postalCode: columns[5] || "",
                phone: columns[6] || "",
                fax: columns[7] || "",
              }),
            });
            if (res.ok) successCount++;
            else errorCount++;
          } catch (err) {
            errorCount++;
          }
        }
      }

      toast({
        title: "Importación completada",
        description: `${successCount} clientes creados. ${errorCount > 0 ? `${errorCount} errores.` : ""}`,
      });
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
    } catch (err) {
      toast({ title: "Error leyendo el archivo", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-2 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="w-8 h-8" />
          Configuración
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona las empresas y clientes asociados a tu cuenta.
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

        {/* ==============================================
            PESTAÑA 1: EMPRESAS
        ================================================ */}
        <TabsContent value="empresas">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Añadir Empresa</CardTitle>
                  <CardDescription>
                    Registra una nueva entidad fiscal principal.
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
                    <div className="grid gap-2">
                      <Label>Provincia *</Label>
                      <Input
                        value={companyFormData.province}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            province: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Teléfono</Label>
                        <Input
                          value={companyFormData.phone}
                          onChange={(e) =>
                            setCompanyFormData({
                              ...companyFormData,
                              phone: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Fax</Label>
                        <Input
                          value={companyFormData.fax}
                          onChange={(e) =>
                            setCompanyFormData({
                              ...companyFormData,
                              fax: e.target.value,
                            })
                          }
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
                  ) : companies && companies.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>CIF</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies.map((company) => (
                          <TableRow key={company.id}>
                            <TableCell className="font-medium">
                              {company.name}
                            </TableCell>
                            <TableCell>{company.taxId}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm("¿Borrar empresa?"))
                                    deleteCompanyMutation.mutate(company.id);
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
                      No hay empresas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ==============================================
            PESTAÑA 2: CLIENTES
        ================================================ */}
        <TabsContent value="clientes">
          <div className="mb-6 max-w-md">
            <Label className="mb-2 block text-base font-semibold">
              Selecciona la empresa:
            </Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <CardDescription>Crea un cliente manual.</CardDescription>
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
                      <div className="grid gap-2">
                        <Label>Domicilio</Label>
                        <Input
                          value={clientFormData.address}
                          onChange={(e) =>
                            setClientFormData({
                              ...clientFormData,
                              address: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Localidad</Label>
                          <Input
                            value={clientFormData.city}
                            onChange={(e) =>
                              setClientFormData({
                                ...clientFormData,
                                city: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>C.P.</Label>
                          <Input
                            value={clientFormData.postalCode}
                            onChange={(e) =>
                              setClientFormData({
                                ...clientFormData,
                                postalCode: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Provincia</Label>
                        <Input
                          value={clientFormData.province}
                          onChange={(e) =>
                            setClientFormData({
                              ...clientFormData,
                              province: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Teléfono</Label>
                          <Input
                            value={clientFormData.phone}
                            onChange={(e) =>
                              setClientFormData({
                                ...clientFormData,
                                phone: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Fax</Label>
                          <Input
                            value={clientFormData.fax}
                            onChange={(e) =>
                              setClientFormData({
                                ...clientFormData,
                                fax: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full mt-2"
                        disabled={createClientMutation.isPending}
                      >
                        {createClientMutation.isPending
                          ? "Guardando..."
                          : "Guardar Cliente"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="bg-secondary/30">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Importar CSV/TSV
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Columnas separadas por Tabulación (Tab):
                      <br />
                      <span className="font-mono bg-background px-1 rounded">
                        EMPRESA | CIF | DOMICILIO | LOCALIDAD | PROVINCIA | C.P.
                        | TLF | FAX
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Input
                      type="file"
                      accept=".csv, .tsv, .txt"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="cursor-pointer"
                    />
                    {isUploading && (
                      <p className="text-xs text-primary mt-2 animate-pulse">
                        Procesando archivo...
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Clientes de la empresa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingClients ? (
                      <p>Cargando clientes...</p>
                    ) : clients && clients.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Empresa / Nombre</TableHead>
                            <TableHead>CIF</TableHead>
                            <TableHead>Población</TableHead>
                            <TableHead className="text-right">
                              Acciones
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clients.map((client: any) => (
                            <TableRow key={client.id}>
                              <TableCell className="font-medium">
                                {client.name}
                              </TableCell>
                              <TableCell>
                                {client.taxId || (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {client.city || client.province ? (
                                  <>
                                    {client.city}{" "}
                                    {client.province && (
                                      <span className="text-muted-foreground">
                                        ({client.province})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right space-x-2 flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => setEditingClient(client)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    if (confirm("¿Borrar cliente?"))
                                      deleteClientMutation.mutate(client.id);
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
                        Esta empresa no tiene clientes. Crea uno o importa un
                        archivo.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center p-12 border-2 border-dashed border-border/50 rounded-xl text-muted-foreground">
              Selecciona una empresa en el desplegable de arriba para gestionar
              sus clientes.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ==============================================
          MODAL DE EDICIÓN DE CLIENTE
      ================================================ */}
      {editingClient && (
        <Dialog
          open={!!editingClient}
          onOpenChange={(open) => !open && setEditingClient(null)}
        >
          {/* AQUÍ ESTÁ EL CAMBIO: Añadimos max-h-[85vh] y overflow-y-auto */}
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Modifica los datos del cliente seleccionado.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateClient} className="space-y-4 mt-2">
              <div className="grid gap-2">
                <Label>Nombre (EMPRESA) *</Label>
                <Input
                  value={editingClient.name}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>NIF / CIF</Label>
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
              <div className="grid gap-2">
                <Label>Domicilio</Label>
                <Input
                  value={editingClient.address || ""}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      address: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Localidad</Label>
                  <Input
                    value={editingClient.city || ""}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        city: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>C.P.</Label>
                  <Input
                    value={editingClient.postalCode || ""}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        postalCode: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Provincia</Label>
                <Input
                  value={editingClient.province || ""}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      province: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={editingClient.phone || ""}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Fax</Label>
                  <Input
                    value={editingClient.fax || ""}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        fax: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingClient(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateClientMutation.isPending}>
                  {updateClientMutation.isPending
                    ? "Guardando..."
                    : "Guardar Cambios"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
