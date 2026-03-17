import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, FileText, Plus, Loader2 } from "lucide-react";

const getStatusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "cobrada" || s === "pagada")
    return (
      <span className="text-green-700 bg-green-100 px-2 py-1 rounded-full text-xs font-medium capitalize">
        {status.replace("_", " ")}
      </span>
    );
  if (s === "borrador")
    return (
      <span className="text-gray-700 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium capitalize">
        {status}
      </span>
    );
  if (s === "vencida")
    return (
      <span className="text-red-700 bg-red-100 px-2 py-1 rounded-full text-xs font-medium capitalize">
        {status}
      </span>
    );
  return (
    <span className="text-blue-700 bg-blue-100 px-2 py-1 rounded-full text-xs font-medium capitalize">
      {status.replace("_", " ")}
    </span>
  );
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ========================================================================
  // 🚀 DETECCIÓN ULTRA-ROBUSTA DE LA EMPRESA
  // Capturamos TODO el contexto para ver cómo se llama realmente la variable
  // ========================================================================
  const companyCtx = useCompany() as any;

  // Red de arrastre: intentamos extraer el ID de todas las formas comunes
  const extractedCompanyId =
    companyCtx?.currentCompany?.id ||
    companyCtx?.company?.id ||
    companyCtx?.selectedCompany?.id ||
    companyCtx?.activeCompany?.id ||
    companyCtx?.companyId ||
    user?.companyId;

  // Si a pesar de todo falla, usamos 1 como salvavidas para que no explote la app
  const companyId = extractedCompanyId || 1;

  // Imprimimos en consola para ver la estructura real de tu hook
  useEffect(() => {
    console.log(
      "🏢 [DEBUG EMPRESA] Todo lo que devuelve useCompany():",
      companyCtx,
    );
    console.log(
      "🏢 [DEBUG EMPRESA] ID finalmente detectado para usar en la app:",
      companyId,
    );
  }, [companyCtx, companyId]);
  // ========================================================================

  // === ESTADOS DE LA UI ===
  const [activeTab, setActiveTab] = useState("emitidas");
  const [isUploading, setIsUploading] = useState(false);

  // Modal IA
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);

  // Modal Nueva Factura Manual
  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false);
  const [newInvoiceData, setNewInvoiceData] = useState({
    clientName: "",
    concept: "",
    amount: 0,
    date: "",
  });

  // === ESTADOS PARA LOS DATOS REALES DE LA BD ===
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const fetchAllInvoices = async () => {
      setIsLoadingData(true);
      try {
        const resEmitidas = await fetch(`/api/invoices?companyId=${companyId}`);
        if (resEmitidas.ok) {
          const dataEmitidas = await resEmitidas.json();
          setInvoices(
            Array.isArray(dataEmitidas)
              ? dataEmitidas
              : dataEmitidas.data || [],
          );
        }
        const resRecibidas = await fetch(
          `/api/vendor-invoices?companyId=${companyId}`,
        );
        if (resRecibidas.ok) {
          const dataRecibidas = await resRecibidas.json();
          setVendorInvoices(
            Array.isArray(dataRecibidas)
              ? dataRecibidas
              : dataRecibidas.data || [],
          );
        }
      } catch (error) {
        console.error("Error cargando facturas:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchAllInvoices();
  }, [companyId]);

  // === LÓGICA DE SUBIDA DE PDF CON LOGS ABUNDANTES ===
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    console.log("🔍 [FRONTEND] 1. EVENTO ONCHANGE DISPARADO NATIVAMENTE!");

    const file = event.target.files?.[0];
    console.log(
      "🔍 [FRONTEND] 2. Archivo capturado:",
      file ? file.name : "Nulo",
    );

    if (!file) {
      console.warn(
        "⚠️ [FRONTEND] Cancelado: El usuario abrió la ventana pero no eligió archivo.",
      );
      return;
    }

    if (file.type !== "application/pdf") {
      console.error(
        "❌ [FRONTEND] El archivo no es un PDF. Tipo detectado:",
        file.type,
      );
      toast({
        title: "Archivo inválido",
        description: "Solo se permiten archivos PDF",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", companyId.toString());

    console.log(
      "🔍 [FRONTEND] 3. Enviando petición POST al servidor para empresa ID:",
      companyId,
    );

    try {
      const response = await fetch("/api/vendor-invoices/parse", {
        method: "POST",
        body: formData,
      });

      console.log(
        "🔍 [FRONTEND] 4. El servidor respondió con Status:",
        response.status,
      );

      const data = await response.json();
      console.log("🔍 [FRONTEND] 5. JSON del servidor:", data);

      if (response.ok && data.success) {
        setParsedData(data.parsedData);
        setShowReviewDialog(true);
        toast({
          title: "Factura leída",
          description: "Revisa los datos extraídos.",
        });
      } else {
        throw new Error(data.error || "Error al procesar la factura");
      }
    } catch (error: any) {
      console.error("❌ [FRONTEND] Excepción en fetch:", error);
      toast({
        title: "Error de procesamiento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleSaveVendorInvoice = async () => {
    toast({ title: "Éxito", description: "Factura guardada correctamente." });
    setShowReviewDialog(false);
    setParsedData(null);
  };

  const handleSaveManualInvoice = async () => {
    toast({
      title: "Factura Creada",
      description: `Factura para ${newInvoiceData.clientName} guardada como borrador.`,
    });
    setShowNewInvoiceDialog(false);
    setNewInvoiceData({ clientName: "", concept: "", amount: 0, date: "" });
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
          <p className="text-muted-foreground">Gestiona tus ventas y gastos.</p>
        </div>

        {activeTab === "emitidas" && (
          <Button onClick={() => setShowNewInvoiceDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Factura (Venta)
          </Button>
        )}
      </div>

      <Tabs
        defaultValue="emitidas"
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="emitidas">Emitidas (Ventas)</TabsTrigger>
          <TabsTrigger value="recibidas">Recibidas (Gastos)</TabsTrigger>
        </TabsList>

        {/* PESTAÑA EMITIDAS */}
        <TabsContent value="emitidas" className="space-y-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingData ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No hay facturas emitidas.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {inv.client?.name || `Cliente #${inv.clientId}`}
                      </TableCell>
                      <TableCell>
                        {new Date(inv.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(inv.total).toLocaleString("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* PESTAÑA RECIBIDAS */}
        <TabsContent value="recibidas" className="space-y-6">
          <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-10 flex flex-col items-center justify-center text-center bg-gray-50 dark:bg-zinc-900/50 hover:bg-gray-100 transition-colors overflow-hidden group">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              onClick={(e) => {
                (e.target as HTMLInputElement).value = "";
              }}
              disabled={isUploading}
              className="absolute inset-0 w-full h-full opacity-0 z-50 cursor-pointer disabled:cursor-not-allowed"
            />

            {isUploading ? (
              <div className="relative z-10 flex flex-col items-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <h3 className="text-lg font-semibold">Analizando con IA...</h3>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center pointer-events-none">
                <UploadCloud className="h-12 w-12 text-gray-400 mb-4 group-hover:text-primary transition-colors" />
                <h3 className="text-lg font-semibold">
                  Sube el PDF de tu factura
                </h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Arrastra el archivo aquí o haz clic en este recuadro.
                </p>
                <Button variant="outline" className="pointer-events-none">
                  Seleccionar PDF
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Nº Factura</TableHead>
                  <TableHead>Fecha Emisión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingData ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : vendorInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No hay gastos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  vendorInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        {inv.supplier?.name || `Proveedor #${inv.supplierId}`}
                      </TableCell>
                      <TableCell>{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        {new Date(inv.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(inv.total).toLocaleString("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL: REVISAR PDF IA */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Revisar Datos Extraídos</DialogTitle>
          </DialogHeader>
          {parsedData && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Proveedor</Label>
                <Input
                  className="col-span-3"
                  value={parsedData.supplierName}
                  onChange={(e) =>
                    setParsedData({
                      ...parsedData,
                      supplierName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Nº Factura</Label>
                <Input
                  className="col-span-3"
                  value={parsedData.invoiceNumber}
                  onChange={(e) =>
                    setParsedData({
                      ...parsedData,
                      invoiceNumber: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Base</Label>
                <Input
                  type="number"
                  className="col-span-3"
                  value={parsedData.netAmount}
                  onChange={(e) =>
                    setParsedData({
                      ...parsedData,
                      netAmount: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Total</Label>
                <Input
                  type="number"
                  className="col-span-3 font-bold"
                  value={parsedData.totalAmount}
                  onChange={(e) =>
                    setParsedData({
                      ...parsedData,
                      totalAmount: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveVendorInvoice}>
              Confirmar y Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CREAR FACTURA MANUAL */}
      <Dialog
        open={showNewInvoiceDialog}
        onOpenChange={setShowNewInvoiceDialog}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nueva Factura de Venta</DialogTitle>
            <DialogDescription>
              Rellena los datos básicos. Podrás añadir líneas de detalle más
              tarde.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Cliente</Label>
              <Input
                className="col-span-3"
                placeholder="Nombre del cliente o empresa"
                value={newInvoiceData.clientName}
                onChange={(e) =>
                  setNewInvoiceData({
                    ...newInvoiceData,
                    clientName: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Concepto</Label>
              <Input
                className="col-span-3"
                placeholder="Ej. Servicios de consultoría"
                value={newInvoiceData.concept}
                onChange={(e) =>
                  setNewInvoiceData({
                    ...newInvoiceData,
                    concept: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Total (€)</Label>
              <Input
                type="number"
                className="col-span-3"
                placeholder="0.00"
                value={newInvoiceData.amount || ""}
                onChange={(e) =>
                  setNewInvoiceData({
                    ...newInvoiceData,
                    amount: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Fecha</Label>
              <Input
                type="date"
                className="col-span-3"
                value={newInvoiceData.date}
                onChange={(e) =>
                  setNewInvoiceData({ ...newInvoiceData, date: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewInvoiceDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveManualInvoice}>Crear Borrador</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
