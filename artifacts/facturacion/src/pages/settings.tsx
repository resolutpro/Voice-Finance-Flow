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
  Package,
  Link as LinkIcon,
  Copy,
} from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // --- QUERIES ---
  const { data: companiesData, isLoading: isLoadingCompanies } =
    useListCompanies();
  // Protección para asegurar que sea un array
  const companies = Array.isArray(companiesData)
    ? companiesData
    : companiesData?.data || [];

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");

  // Query clientes
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

  // Query productos
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["products", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/products?companyId=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });
  // Query invitaciones
  const { data: invitations, isLoading: isLoadingInvitations } = useQuery({
    queryKey: ["invitations", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(
        `/api/invitations?companyId=${selectedCompanyId}`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  const [inviteEmail, setInviteEmail] = useState("");

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { email: string; companyId: number }) => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al generar invitación");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Enlace de invitación generado" });
      setInviteEmail("");
      queryClient.invalidateQueries({
        queryKey: ["invitations", selectedCompanyId],
      });
    },
    onError: () =>
      toast({ title: "❌ Error al generar", variant: "destructive" }),
  });

  const copyToClipboard = (token: string) => {
    const link = `${window.location.origin}/register?token=${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: "📋 Enlace copiado al portapapeles" });
  };

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
    logo: "",
    color: "#000000",
    bankAccountNumber: "",
  });

  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
  const [isEditClientDialogOpen, setIsEditClientDialogOpen] = useState(false);

  // --- MUTACIONES EMPRESAS ---
  const createCompanyMutation = useMutation({
    mutationFn: async (newCompany: typeof companyFormData) => {
      const { color, ...rest } = newCompany;
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, themeColor: color }),
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
        logo: "",
        color: "#000000",
        bankAccountNumber: "",
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

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      formData: typeof companyFormData;
    }) => {
      const { color, ...rest } = data.formData;
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, themeColor: color }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Empresa actualizada" });
      setIsEditDialogOpen(false);
      setEditingCompany(null);
      setCompanyFormData({
        name: "",
        taxId: "",
        address: "",
        city: "",
        province: "",
        postalCode: "",
        phone: "",
        fax: "",
        logo: "",
        color: "#000000",
        bankAccountNumber: "",
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: () =>
      toast({
        title: "❌ Error al actualizar empresa",
        variant: "destructive",
      }),
  });

  // --- MUTACIONES CLIENTES ---
  const createClientMutation = useMutation({
    mutationFn: async (newClient: typeof clientFormData) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newClient,
          companyId: Number(selectedCompanyId),
        }),
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

  // --- MUTACIONES PRODUCTOS ---
  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al borrar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "🗑️ Producto eliminado" });
      queryClient.invalidateQueries({
        queryKey: ["products", selectedCompanyId],
      });
    },
  });

  // --- MANEJADORES DE SUBIDA DE ARCHIVOS ---
  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setCompanyFormData({
        ...companyFormData,
        logo: base64,
      });
      toast({ title: "✅ Logo cargado correctamente" });
    };
    reader.onerror = () => {
      toast({ title: "❌ Error al cargar el logo", variant: "destructive" });
    };
    reader.readAsDataURL(file);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
  };

  const handleClientFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCompanyId) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = text.split("\n");
      let count = 0;

      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].trim()) continue;
        const columns = rows[i]
          .split("\t")
          .map((c) => c.trim().replace(/['"]/g, ""));

        if (i === 0 && columns[0].toUpperCase().includes("EMPRESA")) continue;

        if (columns.length >= 1 && columns[0]) {
          try {
            await fetch("/api/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: Number(selectedCompanyId),
                name: columns[0],
                taxId: columns[1] || "",
                address: columns[2] || "",
                city: columns[3] || "",
                province: columns[4] || "",
                postalCode: columns[5] || "",
                phone: columns[6] || "",
                fax: columns[7] || "",
              }),
            });
            count++;
          } catch (error) {
            console.error("Error en fila", i, error);
          }
        }
      }
      toast({ title: `✅ ${count} clientes importados correctamente` });
      queryClient.invalidateQueries({
        queryKey: ["clients", selectedCompanyId],
      });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleProductFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCompanyId) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length === 0) {
          throw new Error("El archivo está vacío");
        }

        const productsToCreate = [];
        let headerFound = false;
        let headerLineIndex = -1;

        // Find header line more flexibly
        for (let i = 0; i < Math.min(5, lines.length); i++) {
          const columns = lines[i]
            .split("\t")
            .map((c) => c.trim().toUpperCase());
          // Look for columns that could be product name and price
          if (
            (columns[0]?.includes("ARTICULO") ||
              columns[0]?.includes("NOMBRE") ||
              columns[0]?.includes("PRODUCTO") ||
              columns[0]?.includes("PRODUCT")) &&
            (columns[1]?.includes("PRECIO") ||
              columns[1]?.includes("PRICE") ||
              columns[1]?.includes("COSTE") ||
              columns[1]?.includes("COST"))
          ) {
            headerFound = true;
            headerLineIndex = i;
            break;
          }
        }

        // If no clear header, assume first line is header
        if (!headerFound && lines.length > 1) {
          headerLineIndex = 0;
          headerFound = true;
        }

        // Start parsing from line after header
        const startLine = headerFound ? headerLineIndex + 1 : 0;

        for (let i = startLine; i < lines.length; i++) {
          const columns = lines[i].split("\t").map((c) => c.trim());

          if (!columns[0]) continue; // Skip empty lines

          // Clean and parse price
          const priceStr = (columns[1] || "0")
            .replace(/[€$]/g, "") // Remove currency symbols
            .replace(/\./g, "") // Remove thousands separator
            .replace(",", "."); // Convert decimal

          const price = parseFloat(priceStr) || 0;
          if (isNaN(price)) {
            console.warn(`Precio inválido en fila ${i + 1}: "${columns[1]}"`);
          }

          // Parse tax rate
          const taxStr = (columns[2] || "0").replace(/[%]/g, "").trim();
          const taxRate = parseFloat(taxStr) || 0;

          productsToCreate.push({
            companyId: Number(selectedCompanyId),
            name: columns[0],
            price: price.toString(),
            taxRate: taxRate.toString(),
            active: true,
          });
        }

        if (productsToCreate.length === 0) {
          throw new Error(
            "No se encontraron productos válidos en el archivo. Verifica que el archivo tenga al menos 2 columnas (Artículo y Precio).",
          );
        }

        const res = await fetch("/api/products/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productsToCreate),
        });

        const responseData = await res.json();

        if (!res.ok) {
          throw new Error(responseData.error || "Error en la subida masiva");
        }

        toast({
          title: `✅ ${productsToCreate.length} productos importados correctamente`,
        });
        queryClient.invalidateQueries({
          queryKey: ["products", selectedCompanyId],
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        toast({
          title: `❌ Error: ${errorMessage}`,
          variant: "destructive",
        });
        console.error("Error importing products:", error);
      } finally {
        setIsUploading(false);
        if (productFileInputRef.current) productFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      </div>

      <Tabs defaultValue="empresas" className="w-full">
        <TabsList>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
        </TabsList>

        {/* --- PESTAÑA EMPRESAS --- */}
        <TabsContent value="empresas" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Añadir Empresa
                </CardTitle>
                <CardDescription>
                  Añade las entidades o marcas con las que facturas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createCompanyMutation.mutate(companyFormData);
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-2">
                    <Label>Nombre de la Empresa (EMPRESA)</Label>
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
                    <Label>CIF/NIF</Label>
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
                    <Label>Domicilio</Label>
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
                      <Label>Localidad</Label>
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
                      <Label>Provincia</Label>
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Código Postal (C.P.)</Label>
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
                    <div className="grid gap-2">
                      <Label>Teléfono (opcional)</Label>
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Fax (opcional)</Label>
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
                    <div className="grid gap-2">
                      <Label>Color Marca</Label>
                      <Input
                        type="color"
                        className="h-10 cursor-pointer w-full p-1"
                        value={companyFormData.color}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            color: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Logo (opcional)</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={logoFileInputRef}
                        onChange={handleLogoUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoFileInputRef.current?.click()}
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {companyFormData.logo
                          ? "Cambiar Logo"
                          : "Seleccionar Logo"}
                      </Button>
                      {companyFormData.logo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setCompanyFormData({
                              ...companyFormData,
                              logo: "",
                            })
                          }
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                    {companyFormData.logo && (
                      <div className="mt-2 p-2 bg-gray-100 rounded">
                        <img
                          src={companyFormData.logo}
                          alt="Logo preview"
                          className="h-16 object-contain"
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label>Cuenta Bancaria (IBAN)</Label>
                    <Input
                      placeholder="ES91 2100 0418 4502 0005 1332"
                      value={companyFormData.bankAccountNumber}
                      onChange={(e) =>
                        setCompanyFormData({
                          ...companyFormData,
                          bankAccountNumber: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={createCompanyMutation.isPending}
                    className="w-full"
                  >
                    {createCompanyMutation.isPending
                      ? "Guardando..."
                      : "Guardar Empresa"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Empresas Existentes</CardTitle>
                <CardDescription>
                  Entidades registradas en el sistema.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCompanies ? (
                  <p>Cargando empresas...</p>
                ) : companies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay empresas registradas.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead>CIF/NIF</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies.map((company: any) => (
                          <TableRow key={company.id}>
                            <TableCell className="font-medium">
                              {company.name}
                            </TableCell>
                            <TableCell>{company.taxId}</TableCell>
                            <TableCell className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-500 hover:text-blue-700"
                                onClick={() => {
                                  setEditingCompany(company);
                                  setCompanyFormData({
                                    name: company.name,
                                    taxId: company.taxId,
                                    address: company.address,
                                    city: company.city,
                                    province: company.province,
                                    postalCode: company.postalCode,
                                    phone: company.phone || "",
                                    fax: company.fax || "",
                                    logo: company.logo || "",
                                    color: company.themeColor || "#000000",
                                    bankAccountNumber:
                                      company.bankAccountNumber || "",
                                  });
                                  setIsEditDialogOpen(true);
                                }}
                                title="Editar"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700"
                                onClick={() =>
                                  deleteCompanyMutation.mutate(company.id)
                                }
                                disabled={deleteCompanyMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- PESTAÑA CLIENTES --- */}
        <TabsContent value="clientes" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Añadir / Importar Clientes
                </CardTitle>
                <CardDescription>
                  Añade clientes a una empresa específica.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>1. Selecciona la Empresa a la que pertenecen</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={selectedCompanyId}
                    onChange={(e) =>
                      setSelectedCompanyId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">-- Seleccionar Empresa --</option>
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <Label className="mb-2 block">
                    2. Importar masivamente desde TSV
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".tsv,.csv,.txt"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleClientFileUpload}
                      disabled={!selectedCompanyId || isUploading}
                    />
                    <Button
                      variant="outline"
                      disabled={!selectedCompanyId || isUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploading ? "Procesando..." : "Subir TSV de Clientes"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background px-2 text-xs text-muted-foreground">
                    O añadir manualmente
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createClientMutation.mutate(clientFormData);
                    }}
                    className="space-y-4 mt-4"
                  >
                    <div className="grid gap-2">
                      <Label>Cliente (EMPRESA)</Label>
                      <Input
                        value={clientFormData.name}
                        onChange={(e) =>
                          setClientFormData({
                            ...clientFormData,
                            name: e.target.value,
                          })
                        }
                        disabled={!selectedCompanyId}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>CIF/NIF</Label>
                      <Input
                        value={clientFormData.taxId}
                        onChange={(e) =>
                          setClientFormData({
                            ...clientFormData,
                            taxId: e.target.value,
                          })
                        }
                        disabled={!selectedCompanyId}
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
                        disabled={!selectedCompanyId}
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
                          disabled={!selectedCompanyId}
                        />
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
                          disabled={!selectedCompanyId}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Código Postal (C.P.)</Label>
                        <Input
                          value={clientFormData.postalCode}
                          onChange={(e) =>
                            setClientFormData({
                              ...clientFormData,
                              postalCode: e.target.value,
                            })
                          }
                          disabled={!selectedCompanyId}
                        />
                      </div>
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
                          disabled={!selectedCompanyId}
                        />
                      </div>
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
                        disabled={!selectedCompanyId}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        !selectedCompanyId || createClientMutation.isPending
                      }
                      className="w-full"
                    >
                      Guardar Cliente
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Listado de Clientes</CardTitle>
                <CardDescription>
                  {selectedCompanyId
                    ? "Mostrando clientes de la empresa seleccionada"
                    : "Selecciona una empresa para ver sus clientes"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingClients ? (
                  <p>Cargando clientes...</p>
                ) : clients?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay clientes registrados.
                  </p>
                ) : (
                  <div className="rounded-md border max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>CIF/NIF</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients?.map((client: any) => (
                          <TableRow key={client.id}>
                            <TableCell className="font-medium">
                              {client.name}
                            </TableCell>
                            <TableCell>{client.taxId}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700"
                                onClick={() =>
                                  deleteClientMutation.mutate(client.id)
                                }
                                disabled={deleteClientMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- PESTAÑA PRODUCTOS --- */}
        <TabsContent value="productos" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Gestión de Productos
                </CardTitle>
                <CardDescription>
                  Selecciona una empresa y sube el listado de productos (TSV).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Empresa</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={selectedCompanyId}
                    onChange={(e) =>
                      setSelectedCompanyId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">-- Seleccionar Empresa --</option>
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <Label className="mb-2 block">
                    Importar masivamente desde TSV
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".tsv,.csv,.txt"
                      className="hidden"
                      ref={productFileInputRef}
                      onChange={handleProductFileUpload}
                      disabled={!selectedCompanyId || isUploading}
                    />
                    <Button
                      variant="outline"
                      disabled={!selectedCompanyId || isUploading}
                      onClick={() => productFileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploading ? "Procesando..." : "Subir TSV de Productos"}
                    </Button>
                  </div>
                  {!selectedCompanyId && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Selecciona una empresa primero para subir sus productos.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Listado de Productos</CardTitle>
                <CardDescription>
                  {selectedCompanyId
                    ? "Productos registrados para la empresa seleccionada"
                    : "Selecciona una empresa para ver sus productos"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProducts ? (
                  <p>Cargando productos...</p>
                ) : products?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay productos registrados.
                  </p>
                ) : (
                  <div className="rounded-md border max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Artículo</TableHead>
                          <TableHead>Precio</TableHead>
                          <TableHead>IGIC (%)</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products?.map((prod: any) => (
                          <TableRow key={prod.id}>
                            <TableCell className="font-medium">
                              {prod.name}
                            </TableCell>
                            <TableCell>{prod.price}€</TableCell>
                            <TableCell>{prod.taxRate}%</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700"
                                onClick={() =>
                                  deleteProductMutation.mutate(prod.id)
                                }
                                disabled={deleteProductMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* --- DIALOG EDITAR EMPRESA --- */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
            <DialogDescription>
              Modifica los datos de la empresa seleccionada.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingCompany) {
                updateCompanyMutation.mutate({
                  id: editingCompany.id,
                  formData: companyFormData,
                });
              }
            }}
            className="space-y-4"
          >
            <div className="grid gap-2">
              <Label>Nombre de la Empresa (EMPRESA)</Label>
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
              <Label>CIF/NIF</Label>
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
              <Label>Domicilio</Label>
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
                <Label>Localidad</Label>
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
                <Label>Provincia</Label>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Código Postal (C.P.)</Label>
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
              <div className="grid gap-2">
                <Label>Teléfono (opcional)</Label>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fax (opcional)</Label>
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
              <div className="grid gap-2">
                <Label>Color Marca</Label>
                <Input
                  type="color"
                  className="h-10 cursor-pointer w-full p-1"
                  value={companyFormData.color}
                  onChange={(e) =>
                    setCompanyFormData({
                      ...companyFormData,
                      color: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Logo (opcional)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={logoFileInputRef}
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {companyFormData.logo ? "Cambiar Logo" : "Seleccionar Logo"}
                </Button>
                {companyFormData.logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCompanyFormData({
                        ...companyFormData,
                        logo: "",
                      })
                    }
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </Button>
                )}
              </div>
              {companyFormData.logo && (
                <div className="mt-2 p-2 bg-gray-100 rounded">
                  <img
                    src={companyFormData.logo}
                    alt="Logo preview"
                    className="h-16 object-contain"
                  />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Cuenta Bancaria (IBAN)</Label>
              <Input
                placeholder="ES91 2100 0418 4502 0005 1332"
                value={companyFormData.bankAccountNumber}
                onChange={(e) =>
                  setCompanyFormData({
                    ...companyFormData,
                    bankAccountNumber: e.target.value,
                  })
                }
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateCompanyMutation.isPending}>
                {updateCompanyMutation.isPending
                  ? "Guardando..."
                  : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
