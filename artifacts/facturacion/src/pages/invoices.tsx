import { useState, useEffect } from "react";
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
import { UploadCloud, FileText, Plus, Loader2, Eye } from "lucide-react";

// Diccionario de traducción de campos de Google Document AI
const AI_FIELD_LABELS: Record<string, string> = {
  supplier_name: "Nombre Proveedor",
  supplier_tax_id: "CIF/NIF Proveedor",
  supplier_address: "Dirección Proveedor",
  supplier_email: "Email Proveedor",
  supplier_phone: "Teléfono",
  supplier_iban: "Cuenta Bancaria (IBAN)",
  receiver_name: "Cliente (Tu Empresa)",
  receiver_tax_id: "Tu CIF/NIF",
  receiver_address: "Tu Dirección",
  invoice_id: "Nº Factura",
  invoice_date: "Fecha Emisión",
  due_date: "Fecha Vencimiento",
  net_amount: "Base Imponible",
  total_tax_amount: "Total Impuestos (IVA)",
  total_amount: "Total Factura",
  currency: "Moneda",
  invoice_type: "Tipo de Documento",
  purchase_order: "Nº Pedido (PO)",
  freight_amount: "Gastos Envío",
};

const translateLabel = (key: string) =>
  AI_FIELD_LABELS[key] || key.replace(/_/g, " ").toUpperCase();

const getStatusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "cobrada" || s === "pagada")
    return (
      <span className="text-green-700 bg-green-100 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
        {status.replace("_", " ")}
      </span>
    );
  if (s === "borrador")
    return (
      <span className="text-gray-700 bg-gray-100 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
        {status}
      </span>
    );
  if (s === "vencida")
    return (
      <span className="text-red-700 bg-red-100 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
        {status}
      </span>
    );
  return (
    <span className="text-blue-700 bg-blue-100 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
      {status.replace("_", " ")}
    </span>
  );
};

export default function InvoicesPage() {
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const companyId = activeCompanyId;

  // === ESTADOS DE LA UI ===
  const [activeTab, setActiveTab] = useState("emitidas");
  const [isUploading, setIsUploading] = useState(false);

  // Modal OCR (IA)
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

  // Modal Detalles y Cambio de Estado
  const [selectedVendorInvoice, setSelectedVendorInvoice] = useState<any>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // === ESTADOS DE BD ===
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    const fetchAllInvoices = async () => {
      setIsLoadingData(true);
      try {
        const urlEmitidas = companyId
          ? `/api/invoices?companyId=${companyId}`
          : `/api/invoices`;
        const resEmitidas = await fetch(urlEmitidas);
        if (resEmitidas.ok) {
          const dataEmitidas = await resEmitidas.json();
          setInvoices(
            Array.isArray(dataEmitidas)
              ? dataEmitidas
              : dataEmitidas.data || [],
          );
        }

        const urlRecibidas = companyId
          ? `/api/vendor-invoices?companyId=${companyId}`
          : `/api/vendor-invoices`;
        const resRecibidas = await fetch(urlRecibidas);
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

  // === LÓGICA DE SUBIDA DE PDF ===
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa específica arriba.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    if (file.type !== "application/pdf") {
      toast({
        title: "Archivo inválido",
        description: "Solo PDF",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", companyId.toString());

    try {
      const response = await fetch("/api/vendor-invoices/parse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setParsedData(data.parsedData);
        setShowReviewDialog(true);
        toast({
          title: "Factura analizada",
          description: "Revisa los datos extraídos por la IA.",
        });
      } else {
        throw new Error(data.error || "Error al procesar el PDF");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  // === GUARDAR FACTURA OCR ===
  const handleSaveVendorInvoice = async () => {
    try {
      const payload = {
        companyId: companyId,
        supplierId: parsedData.supplierId,
        invoiceNumber: parsedData.invoiceNumber || "S/N",
        issueDate:
          parsedData.issueDate || new Date().toISOString().split("T")[0],
        dueDate: parsedData.dueDate || null,
        subtotal: parsedData.netAmount?.toString() || "0",
        taxAmount: parsedData.taxAmount?.toString() || "0",
        total: parsedData.totalAmount?.toString() || "0",
        extractedData: parsedData.allExtractedFields,
        lineItems: parsedData.lineItems,
        status: "borrador",
      };

      const response = await fetch("/api/vendor-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Error al guardar en la base de datos",
        );
      }

      const newInvoice = await response.json();
      setVendorInvoices((prev) => [newInvoice, ...prev]);

      toast({ title: "Éxito", description: "Factura guardada correctamente." });
      setShowReviewDialog(false);
      setParsedData(null);
    } catch (error: any) {
      console.error("❌ Error guardando factura:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // === ACTUALIZAR ESTADO DE FACTURA ===
  const handleUpdateVendorInvoiceStatus = async (
    id: number,
    newStatus: string,
  ) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/vendor-invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Error actualizando el estado");

      // Actualizamos la lista y el modal abierto instantáneamente
      setVendorInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: newStatus } : inv,
        ),
      );
      setSelectedVendorInvoice((prev: any) =>
        prev ? { ...prev, status: newStatus } : null,
      );

      toast({
        title: "Estado actualizado",
        description: `La factura ahora está: ${newStatus.replace("_", " ")}`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveManualInvoice = async () => {
    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Factura Creada",
      description: `Borrador guardado para ${newInvoiceData.clientName}.`,
    });
    setShowNewInvoiceDialog(false);
    setNewInvoiceData({ clientName: "", concept: "", amount: 0, date: "" });
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* HEADER CON BOTONES ALINEADOS A LA DERECHA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
          <p className="text-muted-foreground">Gestiona tus ventas y gastos.</p>
        </div>

        <div className="flex gap-3">
          {activeTab === "emitidas" && (
            <Button
              onClick={() =>
                companyId
                  ? setShowNewInvoiceDialog(true)
                  : toast({
                      title: "Atención",
                      description: "Selecciona una empresa.",
                      variant: "destructive",
                    })
              }
            >
              <Plus className="w-4 h-4 mr-2" /> Nueva Factura (Venta)
            </Button>
          )}

          {activeTab === "recibidas" && (
            <>
              {/* Input oculto para subir PDF */}
              <input
                type="file"
                id="upload-pdf-input"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileUpload}
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                disabled={isUploading || !companyId}
              />
              <Button
                onClick={() => {
                  if (!companyId) {
                    toast({
                      title: "Atención",
                      description:
                        "Selecciona una empresa específica para subir facturas.",
                      variant: "destructive",
                    });
                    return;
                  }
                  document.getElementById("upload-pdf-input")?.click();
                }}
                disabled={isUploading || !companyId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4 mr-2" />
                )}
                {isUploading ? "Procesando IA..." : "Subir Factura (PDF)"}
              </Button>
            </>
          )}
        </div>
      </div>

      {!companyId && (
        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-md border border-blue-200 dark:border-blue-800 text-sm">
          <strong>Vista Consolidada.</strong> Estás viendo las facturas de todas
          las empresas. Selecciona una en el menú superior para poder crear o
          subir facturas.
        </div>
      )}

      <Tabs
        defaultValue="emitidas"
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="emitidas">Emitidas (Ventas)</TabsTrigger>
          <TabsTrigger value="recibidas">Recibidas (Gastos)</TabsTrigger>
        </TabsList>

        {/* ========================================== */}
        {/* PESTAÑA EMITIDAS */}
        {/* ========================================== */}
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
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay facturas emitidas.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
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

        {/* ========================================== */}
        {/* PESTAÑA RECIBIDAS (PROVEEDORES) */}
        {/* ========================================== */}
        <TabsContent value="recibidas" className="space-y-4">
          <div className="rounded-md border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Nº Factura</TableHead>
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
                ) : vendorInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">
                        No hay facturas de gastos registradas.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Usa el botón "Subir Factura (PDF)" de arriba para añadir
                        una.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  vendorInvoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                      onClick={() => setSelectedVendorInvoice(inv)}
                    >
                      {/* Usamos el supplierName directo que extrajimos en el backend */}
                      <TableCell className="font-semibold text-gray-800 dark:text-gray-200">
                        {inv.supplierName ||
                          `Proveedor #${inv.supplierId || "Desconocido"}`}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {inv.invoiceNumber || "S/N"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {new Date(inv.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right font-bold">
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

      {/* ========================================== */}
      {/* MODAL 1: REVISAR PDF IA (AL SUBIR) */}
      {/* ========================================== */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="w-6 h-6 text-primary" /> Revisión de Factura
            </DialogTitle>
            <DialogDescription>
              La Inteligencia Artificial ha extraído los siguientes datos.
              Confirma antes de guardar.
            </DialogDescription>
          </DialogHeader>

          {parsedData && (
            <div className="overflow-y-auto px-6 pb-6 space-y-6">
              <div className="grid gap-4 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                <h4 className="font-semibold text-sm text-blue-800 dark:text-blue-300">
                  Datos Contables Principales
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Proveedor
                    </Label>
                    <Input
                      className="h-8 bg-white dark:bg-zinc-950"
                      value={parsedData.supplierName}
                      onChange={(e) =>
                        setParsedData({
                          ...parsedData,
                          supplierName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Nº Factura
                    </Label>
                    <Input
                      className="h-8 bg-white dark:bg-zinc-950"
                      value={parsedData.invoiceNumber}
                      onChange={(e) =>
                        setParsedData({
                          ...parsedData,
                          invoiceNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Base Imponible
                    </Label>
                    <Input
                      type="number"
                      className="h-8 bg-white dark:bg-zinc-950"
                      value={parsedData.netAmount}
                      onChange={(e) =>
                        setParsedData({
                          ...parsedData,
                          netAmount: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Total Factura
                    </Label>
                    <Input
                      type="number"
                      className="h-8 bg-white dark:bg-zinc-950 font-bold"
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
              </div>

              {parsedData.lineItems && parsedData.lineItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm border-b pb-2">
                    Líneas detectadas
                  </h4>
                  <div className="rounded-md border bg-card overflow-hidden">
                    <Table className="text-xs">
                      <TableHeader className="bg-gray-50 dark:bg-zinc-900">
                        <TableRow>
                          <TableHead className="py-2 h-8">
                            Descripción
                          </TableHead>
                          <TableHead className="py-2 h-8 text-right">
                            Cant.
                          </TableHead>
                          <TableHead className="py-2 h-8 text-right">
                            Precio Ud.
                          </TableHead>
                          <TableHead className="py-2 h-8 text-right">
                            Importe
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.lineItems.map((line: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell
                              className="py-2 font-medium truncate max-w-[200px]"
                              title={line.description}
                            >
                              {line.description}
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              {line.quantity}
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              {line.unitPrice} €
                            </TableCell>
                            <TableCell className="py-2 text-right font-semibold">
                              {line.amount} €
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {parsedData.allExtractedFields &&
                Object.keys(parsedData.allExtractedFields).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-gray-500 border-b pb-2">
                      Información adicional extraída
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(parsedData.allExtractedFields).map(
                        ([key, value]) => {
                          if (
                            [
                              "supplier_name",
                              "invoice_id",
                              "net_amount",
                              "total_amount",
                              "line_item",
                            ].includes(key)
                          )
                            return null;
                          const displayValue = Array.isArray(value)
                            ? value.join(" | ")
                            : String(value);
                          if (!displayValue.trim()) return null;
                          return (
                            <div
                              key={key}
                              className="flex flex-col bg-gray-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border text-sm"
                            >
                              <span className="text-[10px] text-primary font-bold mb-1">
                                {translateLabel(key)}
                              </span>
                              <span
                                className="truncate text-xs font-medium text-gray-700 dark:text-gray-300"
                                title={displayValue}
                              >
                                {displayValue}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
          <DialogFooter className="px-6 py-4 border-t bg-gray-50 dark:bg-zinc-900/20">
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

      {/* ========================================== */}
      {/* MODAL 2: DETALLES FACTURA RECIBIDA (AL CLICAR LA FILA) */}
      {/* ========================================== */}
      <Dialog
        open={!!selectedVendorInvoice}
        onOpenChange={(open) => !open && setSelectedVendorInvoice(null)}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Detalles del Gasto</DialogTitle>
          </DialogHeader>

          {selectedVendorInvoice && (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm bg-muted/30 p-4 rounded-lg border">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">
                    Proveedor
                  </span>
                  <span className="font-semibold">
                    {selectedVendorInvoice.supplierName ||
                      `Proveedor #${selectedVendorInvoice.supplierId}`}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">
                    Nº Factura
                  </span>
                  <span className="font-medium">
                    {selectedVendorInvoice.invoiceNumber || "S/N"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">
                    Fecha Emisión
                  </span>
                  <span>
                    {new Date(
                      selectedVendorInvoice.issueDate,
                    ).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">
                    Total
                  </span>
                  <span className="font-bold text-lg">
                    {Number(selectedVendorInvoice.total).toLocaleString(
                      "es-ES",
                      { style: "currency", currency: "EUR" },
                    )}
                  </span>
                </div>
              </div>

              {/* CAMBIO DE ESTADO RÁPIDO */}
              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-semibold">
                  Estado de la Factura
                </Label>
                <div className="flex gap-2 items-center">
                  <select
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    value={selectedVendorInvoice.status}
                    onChange={(e) =>
                      handleUpdateVendorInvoiceStatus(
                        selectedVendorInvoice.id,
                        e.target.value,
                      )
                    }
                    disabled={isUpdatingStatus}
                  >
                    <option value="borrador">Borrador</option>
                    <option value="pendiente_pago">Pendiente de Pago</option>
                    <option value="parcialmente_pagada">
                      Parcialmente Pagada
                    </option>
                    <option value="pagada">Pagada</option>
                    <option value="vencida">Vencida</option>
                    <option value="anulada">Anulada</option>
                  </select>
                  {isUpdatingStatus && (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Al cambiar el estado, se actualizará instantáneamente en la
                  base de datos.
                </p>
              </div>

              {/* OPCIONAL: Mostrar datos extraídos por la IA si los tiene guardados */}
              {selectedVendorInvoice.extractedData &&
                Object.keys(selectedVendorInvoice.extractedData).length > 0 && (
                  <div className="mt-4">
                    <Label className="text-xs font-semibold text-muted-foreground block mb-2">
                      Datos extraídos (OCR)
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(selectedVendorInvoice.extractedData)
                        .slice(0, 5)
                        .map((key) => (
                          <span
                            key={key}
                            className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-1 rounded border border-blue-100 dark:border-blue-800"
                          >
                            {translateLabel(key)}
                          </span>
                        ))}
                      {Object.keys(selectedVendorInvoice.extractedData).length >
                        5 && (
                        <span className="text-[10px] text-muted-foreground py-1">
                          +
                          {Object.keys(selectedVendorInvoice.extractedData)
                            .length - 5}{" "}
                          más
                        </span>
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL 3: CREAR FACTURA MANUAL (VENTAS) */}
      {/* ========================================== */}
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
