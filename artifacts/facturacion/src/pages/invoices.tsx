import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  UploadCloud,
  FileText,
  Plus,
  Loader2,
  Eye,
  Download,
  Search,
  ChevronsUpDown,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";

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

const toDisplayNumber = (value: any, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value).trim().replace(/\s/g, "").replace(/€/g, "");
  if (!raw) return fallback;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInvoiceItems = (invoice: any) => {
  const rawItems =
    invoice?.items ||
    invoice?.lineItems ||
    invoice?.invoiceItems ||
    invoice?.details ||
    [];

  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item: any, idx: number) => {
    const quantity = toDisplayNumber(item.quantity, 1) || 1;
    const amount = toDisplayNumber(item.amount, 0);
    const unitPrice =
      toDisplayNumber(item.unitPrice, 0) ||
      toDisplayNumber(item.price, 0) ||
      (amount && quantity ? amount / quantity : 0);

    return {
      ...item,
      description:
        item.description || item.productName || item.name || `Línea ${idx + 1}`,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      amount: String(amount || quantity * unitPrice),
      sortOrder: item.sortOrder ?? idx,
    };
  });
};

const normalizeInvoiceForEditing = (invoice: any) => {
  const items = normalizeInvoiceItems(invoice);
  const subtotalFromItems = items.reduce(
    (acc: number, item: any) =>
      acc +
      toDisplayNumber(item.quantity, 1) * toDisplayNumber(item.unitPrice, 0),
    0,
  );

  const subtotal = toDisplayNumber(invoice?.subtotal, subtotalFromItems);
  const taxAmount = toDisplayNumber(invoice?.taxAmount, 0);
  const total = toDisplayNumber(invoice?.total, subtotal + taxAmount);

  let taxRate = toDisplayNumber(invoice?.taxRate, 0);
  if (!taxRate && subtotal > 0 && taxAmount > 0) {
    taxRate = (taxAmount / subtotal) * 100;
  }
  if (!taxRate) taxRate = 21;

  return {
    ...invoice,
    clientName:
      invoice?.clientName ||
      invoice?.client?.name ||
      invoice?.customerName ||
      "",
    items,
    subtotal: String(subtotal),
    taxRate: String(taxRate),
    taxAmount: String(taxAmount),
    total: String(total),
  };
};

const hasIssuedInvoiceOriginalPdf = (invoice: any) =>
  Boolean(
    invoice?.fileUrl ||
      invoice?.extractedData?.originalPdfName ||
      invoice?.extractedData?.originalFileName ||
      invoice?.extractedData?.pdfPath,
  );

const getIssuedInvoicePdfUrl = (invoice: any) => {
  if (!invoice?.id) return "";

  // Para facturas emitidas importadas desde PDF usamos la misma idea que en gastos:
  // si existe PDF original asociado en BD, servimos ese PDF físico.
  if (hasIssuedInvoiceOriginalPdf(invoice)) {
    return `/api/invoices/uploaded-pdf/${invoice.id}`;
  }

  // Para facturas creadas manualmente, mantenemos el PDF generado.
  return `/api/invoice-pdf/${invoice.id}`;
};

const getStatusBadge = (status: string) => {
  const s = status?.toLowerCase() || "borrador";
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
  const [activeTab, setActiveTab] = useState("presupuestos");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputAlbaranRef = useRef<HTMLInputElement>(null);
  const fileInputIssuedPdfRef = useRef<HTMLInputElement>(null);

  // Modal OCR (IA)
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);

  // Modal Detalles y Cambio de Estado (Gastos)
  const [selectedVendorInvoice, setSelectedVendorInvoice] = useState<any>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // === ESTADOS DE BD ===
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Estado unificado para CREAR o EDITAR factura/presupuesto emitido
  const [editingInvoice, setEditingInvoice] = useState<any>(null);

  // Dividimos las facturas emitidas de los presupuestos
  const facturasEmitidas = invoices.filter(
    (inv) => inv.type === "invoice" || !inv.type,
  );
  const presupuestos = invoices.filter((inv) => inv.type === "quote");

  // === QUERIES DE CLIENTES Y PRODUCTOS ===
  const { data: clients } = useQuery({
    queryKey: ["clients", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/clients?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: products } = useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/products?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const productOptions = useMemo(() => {
    if (!products) return [];
    const options: any[] = [];

    products.forEach((p: any) => {
      options.push({
        id: `base_${p.id}`,
        displayName: `${p.name} (Base: ${p.price}€)`,
        description: p.name,
        price: p.price,
        taxRate: p.taxRate,
      });

      if (p.priceTiers && Array.isArray(p.priceTiers)) {
        p.priceTiers.forEach((tier: any, tIdx: number) => {
          options.push({
            id: `tier_${p.id}_${tIdx}`,
            displayName: `${p.name} - ${tier.name} (${tier.price}€)`,
            description: `${p.name} - ${tier.name}`,
            price: tier.price,
            taxRate: p.taxRate,
          });
        });
      }
    });
    return options;
  }, [products]);

  const [openProductSearch, setOpenProductSearch] = useState<number | null>(
    null,
  );

  // === UI HELPER: BOTÓN DESCARGA ===
  const renderDownloadButton = (invoiceOrId: any) => {
    const id = typeof invoiceOrId === "number" ? invoiceOrId : invoiceOrId?.id;
    const url =
      typeof invoiceOrId === "number"
        ? `/api/invoice-pdf/${id}`
        : getIssuedInvoicePdfUrl(invoiceOrId);

    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-blue-600 hover:text-blue-800"
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, "_blank");
        }}
      >
        <Download className="w-4 h-4" />
      </Button>
    );
  };

  const fetchAllInvoices = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const urlEmitidas = companyId
        ? `/api/invoices?companyId=${companyId}`
        : `/api/invoices`;
      const resEmitidas = await fetch(urlEmitidas);
      if (resEmitidas.ok) {
        const dataEmitidas = await resEmitidas.json();
        const parsedEmitidas = Array.isArray(dataEmitidas)
          ? dataEmitidas
          : dataEmitidas.data || [];

        setInvoices(
          parsedEmitidas.map((invoice: any) =>
            normalizeInvoiceForEditing(invoice),
          ),
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
  }, [companyId]);

  useEffect(() => {
    fetchAllInvoices();
  }, [fetchAllInvoices]);

  const openInvoiceDetail = useCallback(async (invoice: any) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el detalle actualizado");
      }

      const detail = await response.json();

      setEditingInvoice(
        normalizeInvoiceForEditing({
          ...invoice,
          ...detail,
        }),
      );
    } catch (error) {
      console.warn("No se pudo recargar el detalle de la factura:", error);
      setEditingInvoice(normalizeInvoiceForEditing(invoice));
    }
  }, []);

  // === LÓGICA PARA CAPTURAR BORRADOR CREADO POR VOZ ===
  const loadVoiceDraft = useCallback(() => {
    const draft = sessionStorage.getItem("voice_draft_invoice");
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);

        setEditingInvoice({
          isNew: true,
          type: parsedDraft.type === "quote" ? "quote" : "invoice",
          status: "borrador",
          invoiceNumber: "",
          clientId: parsedDraft.clientId
            ? Number(parsedDraft.clientId)
            : undefined,
          clientName: parsedDraft.clientName || "",
          issueDate:
            parsedDraft.issueDate || new Date().toISOString().split("T")[0],
          dueDate: parsedDraft.dueDate || undefined,
          concept: parsedDraft.items?.[0]?.description || "",
          taxRate: parsedDraft.taxRate ? Number(parsedDraft.taxRate) : 21,
          items:
            parsedDraft.items?.length > 0
              ? parsedDraft.items.map((item: any) => ({
                  description: item.description || "",
                  quantity: String(item.quantity || "1"),
                  unitPrice: String(item.unitPrice || "0"),
                }))
              : [{ description: "Nueva línea", quantity: "1", unitPrice: "0" }],
        });

        setActiveTab(
          parsedDraft.type === "quote" ? "presupuestos" : "emitidas",
        );

        sessionStorage.removeItem("voice_draft_invoice");
      } catch (e) {
        console.error("Error cargando borrador de voz:", e);
      }
    }
  }, []);

  useEffect(() => {
    loadVoiceDraft();
  }, [loadVoiceDraft]);

  useEffect(() => {
    window.addEventListener("voice_draft_ready", loadVoiceDraft);
    return () =>
      window.removeEventListener("voice_draft_ready", loadVoiceDraft);
  }, [loadVoiceDraft]);

  // === LÓGICA DE SUBIDA DE PDF (INDIVIDUAL O EN MASA) ===
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa específica arriba.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf",
    );

    if (pdfFiles.length === 0) {
      toast({
        title: "Archivo(s) inválido(s)",
        description: "Solo se permiten archivos PDF",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setIsUploading(true);

    // CASO A: SUBIDA INDIVIDUAL
    if (pdfFiles.length === 1) {
      const formData = new FormData();
      formData.append("file", pdfFiles[0]);
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
      return;
    }

    // CASO B: SUBIDA EN MASA
    toast({
      title: "Procesando subida masiva",
      description: `Se están analizando ${pdfFiles.length} facturas con IA. Esto puede tardar unos momentos...`,
    });

    let successCount = 0;
    let errorCount = 0;
    const newInvoicesList: any[] = [];

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId.toString());

      try {
        const parseRes = await fetch("/api/vendor-invoices/parse", {
          method: "POST",
          body: formData,
        });
        const parseData = await parseRes.json();

        if (!parseRes.ok || !parseData.success) {
          errorCount++;
          continue;
        }

        const pData = parseData.parsedData;

        const payload = {
          companyId: companyId,
          supplierId: pData.supplierId,
          invoiceNumber: pData.invoiceNumber || "S/N",
          issueDate: pData.issueDate || new Date().toISOString().split("T")[0],
          dueDate: pData.dueDate || null,
          subtotal: pData.netAmount?.toString() || "0",
          taxAmount: pData.taxAmount?.toString() || "0",
          total: pData.totalAmount?.toString() || "0",
          extractedData: pData.allExtractedFields,
          lineItems: pData.lineItems,
          status: "borrador",
          pdfPath: pData.pdfPath, // Vinculamos la ruta del disco devuelta por la API
        };

        const saveRes = await fetch("/api/vendor-invoices", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });

        if (saveRes.ok) {
          const newInvoice = await saveRes.json();
          newInvoicesList.push(newInvoice);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error en factura ${i + 1}:`, error);
        errorCount++;
      }
    }

    if (newInvoicesList.length > 0) {
      setVendorInvoices((prev) => [...newInvoicesList, ...prev]);
    }

    toast({
      title: "Subida en masa finalizada",
      description: `Completadas: ${successCount} | Errores: ${errorCount}. Recuerda revisar los borradores.`,
      variant: errorCount > 0 ? "destructive" : "default",
    });

    setIsUploading(false);
    event.target.value = "";
  };

  // === SUBIDA MASIVA DE PDFs DE FACTURAS EMITIDAS ===
  const handleIssuedPdfBulkUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa específica arriba.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const pdfFiles = Array.from(files).filter(
      (file) => file.type === "application/pdf",
    );

    if (pdfFiles.length === 0) {
      toast({
        title: "Archivo(s) inválido(s)",
        description: "Solo se permiten archivos PDF.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    toast({
      title: "Importando facturas emitidas",
      description: `Se están procesando ${pdfFiles.length} PDF(s) con OpenAI.`,
    });

    try {
      const formData = new FormData();
      pdfFiles.forEach((file) => formData.append("files", file));
      formData.append("companyId", companyId.toString());

      const response = await fetch("/api/invoices/bulk-upload-pdfs", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok && !data.created?.length) {
        throw new Error(data.error || "No se pudo importar ningún PDF");
      }

      const created = Array.isArray(data.created) ? data.created : [];
      if (created.length > 0) {
        setInvoices((prev) => [
          ...created.map((invoice: any) => normalizeInvoiceForEditing(invoice)),
          ...prev,
        ]);
        fetchAllInvoices();
      }

      const errorCount = Array.isArray(data.errors) ? data.errors.length : 0;
      toast({
        title: "Importación finalizada",
        description: `Emitidas registradas: ${created.length} | Errores: ${errorCount}. Se han guardado con estado emitida.`,
        variant: errorCount > 0 ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({
        title: "Error importando PDFs",
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
        status: "pendiente_pago",
        pdfPath: parsedData.pdfPath, // Propagamos la referencia del PDF físico al confirmar individualmente
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // === ACTUALIZAR ESTADO DE FACTURA RECIBIDA ===
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

  // === ABRIR MODAL CREACIÓN ===
  const handleCreateNewDocument = (docType: "invoice" | "quote") => {
    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa.",
        variant: "destructive",
      });
      return;
    }
    setEditingInvoice({
      isNew: true,
      type: docType,
      status: "borrador",
      invoiceNumber: "",
      clientName: "",
      issueDate: new Date().toISOString().split("T")[0],
      concept: "",
      taxRate: 21,
      items: [{ description: "Nueva línea", quantity: "1", unitPrice: "0" }],
    });
  };

  // === LÓGICA PARA PARSEAR ALBARÁN EXCEL/CSV EN MASA ===
  const handleUploadAlbaran = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!companyId) {
      toast({
        title: "Atención",
        description: "Selecciona una empresa.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    toast({
      title: "Procesando albaranes",
      description: `Analizando ${files.length} archivo(s)...`,
    });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const items: any[] = [];
        let isItemSection = false;

        let clientName = "";
        let clientNif = "";
        let clientAddress = "";
        let clientPhone = "";
        let clientEmail = "";
        let clientContact = "";

        let descIdx = -1,
          qtyIdx = -1,
          priceIdx = -1;

        for (const rawRow of rows as any[]) {
          if (!rawRow || !Array.isArray(rawRow) || rawRow.length === 0)
            continue;

          const cells = rawRow.map((cell) => String(cell || "").trim());

          for (let c = 0; c < cells.length; c++) {
            const cell = cells[c];
            if (!cell) continue;

            const lowerCell = cell.toLowerCase();

            const getValue = () => {
              if (cell.includes(":")) {
                const parts = cell.split(":");
                const val = parts.slice(1).join(":").trim();
                if (val) return val;
              }
              for (let j = c + 1; j < cells.length; j++) {
                if (cells[j] && cells[j].trim() !== "") return cells[j].trim();
              }
              return "";
            };

            if (
              (lowerCell.includes("cliente") ||
                lowerCell.includes("razón social")) &&
              !clientName
            ) {
              clientName = getValue();
            } else if (
              (lowerCell.includes("n.i.f") ||
                lowerCell.includes("nif") ||
                lowerCell.includes("cif")) &&
              !clientNif
            ) {
              clientNif = getValue();
            } else if (
              (lowerCell.includes("dirección") ||
                lowerCell.includes("direccion")) &&
              !clientAddress
            ) {
              clientAddress = getValue();
            } else if (
              (lowerCell.includes("teléfono") ||
                lowerCell.includes("telefono")) &&
              !clientPhone
            ) {
              clientPhone = getValue();
            } else if (
              (lowerCell.includes("email") || lowerCell.includes("correo")) &&
              !clientEmail
            ) {
              clientEmail = getValue();
            } else if (
              lowerCell.includes("persona de contacto") &&
              !clientContact
            ) {
              clientContact = getValue();
            }
          }

          if (!isItemSection) {
            const lowerCellsForHeaders = cells.map((c) => c.toLowerCase());
            if (
              lowerCellsForHeaders.includes("código") ||
              lowerCellsForHeaders.includes("descripción") ||
              lowerCellsForHeaders.includes("artículo")
            ) {
              isItemSection = true;
              descIdx = lowerCellsForHeaders.findIndex(
                (c) => c.includes("descripción") || c.includes("artículo"),
              );
              qtyIdx = lowerCellsForHeaders.findIndex(
                (c) =>
                  c === "unidades" || c.includes("cant") || c.includes("cajas"),
              );
              priceIdx = lowerCellsForHeaders.findIndex((c) =>
                c.includes("precio"),
              );
              continue;
            }
          }

          if (isItemSection && descIdx !== -1 && cells[descIdx]) {
            const description = cells[descIdx];

            if (
              description.toLowerCase() === "descripción" ||
              description === "undefined" ||
              description === "null" ||
              description === "total"
            )
              continue;

            const quantity = qtyIdx !== -1 ? parseFloat(cells[qtyIdx]) || 1 : 1;
            const priceWithTax =
              priceIdx !== -1 ? parseFloat(cells[priceIdx]) || 0 : 0;
            const baseUnitPrice = priceWithTax / 1.21;

            items.push({
              description,
              quantity: quantity.toString(),
              unitPrice: baseUnitPrice.toFixed(6),
            });
          }
        }

        if (items.length > 0) {
          let finalClientId = undefined;

          if (clientName || clientNif) {
            const matchedClient = clients?.find(
              (c: any) =>
                (clientNif && c.taxId === clientNif) ||
                (clientName &&
                  c.name.toLowerCase() === clientName.toLowerCase()),
            );

            if (matchedClient) {
              finalClientId = matchedClient.id;
              clientName = matchedClient.name;
            } else if (clientName) {
              try {
                let extractedPostalCode = "";
                let extractedCity = "";
                let extractedAddress = clientAddress;

                if (clientAddress) {
                  const cpMatch = clientAddress.match(/\b\d{5}\b/);
                  if (cpMatch) {
                    extractedPostalCode = cpMatch[0];
                    const parts = clientAddress.split(extractedPostalCode);
                    if (parts.length > 1) {
                      extractedCity = parts[1].replace(/^[.\s,-]+/, "").trim();
                      extractedAddress = parts[0].replace(/[,\s]+$/, "").trim();
                    }
                  }
                }

                const clientPayload = {
                  companyId: companyId,
                  name: clientName,
                  taxId: clientNif || "",
                  address: extractedAddress || "",
                  phone: clientPhone || undefined,
                  email: clientEmail || undefined,
                  contactPerson: clientContact || undefined,
                  city: extractedCity || "",
                  province: "",
                  postalCode: extractedPostalCode || "",
                };

                const res = await fetch("/api/clients", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(clientPayload),
                });

                if (res.ok) {
                  const newClient = await res.json();
                  finalClientId =
                    newClient?.data?.id ||
                    newClient?.id ||
                    (Array.isArray(newClient) ? newClient[0]?.id : undefined);
                }
              } catch (e) {
                console.error("Error creando cliente:", e);
              }
            }
          }

          const invoicePayload = {
            companyId: companyId,
            clientId: finalClientId,
            clientName: clientName || "Cliente Desconocido",
            type: "invoice",
            status: "borrador",
            issueDate: new Date().toISOString().split("T")[0],
            concept: `Albarán importado: ${file.name}`,
            items: items,
            taxRate: "21",
          };

          const invoiceRes = await fetch("/api/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invoicePayload),
          });

          if (invoiceRes.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error parseando archivo ${file.name}:`, error);
        errorCount++;
      }
    }

    toast({
      title: "Importación masiva finalizada",
      description: `Éxito: ${successCount} albaranes | Errores: ${errorCount}`,
      variant: errorCount > 0 && successCount === 0 ? "destructive" : "default",
    });

    fetchAllInvoices();
    setIsUploading(false);
    if (event.target) event.target.value = "";
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* HEADER CON BOTONES ALINEADOS A LA DERECHA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
          <p className="text-muted-foreground">
            Gestiona tus ventas, presupuestos y gastos.
          </p>
        </div>

        <div className="flex gap-3">
          {activeTab === "emitidas" && (
            <>
              <input
                type="file"
                accept=".csv, .xls, .xlsx, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                ref={fileInputAlbaranRef}
                multiple
                onChange={handleUploadAlbaran}
              />
              <Button
                variant="outline"
                className="bg-secondary/50 hover:bg-secondary border-border"
                onClick={() => fileInputAlbaranRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" /> Desde Albarán
              </Button>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                ref={fileInputIssuedPdfRef}
                multiple
                onChange={handleIssuedPdfBulkUpload}
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                disabled={isUploading || !companyId}
              />
              <Button
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                onClick={() => {
                  if (!companyId) {
                    toast({
                      title: "Atención",
                      description:
                        "Selecciona una empresa específica para importar facturas emitidas.",
                      variant: "destructive",
                    });
                    return;
                  }
                  fileInputIssuedPdfRef.current?.click();
                }}
                disabled={isUploading || !companyId}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4 mr-2" />
                )}
                {isUploading ? "Procesando IA..." : "Subir PDFs emitidos"}
              </Button>
              <Button onClick={() => handleCreateNewDocument("invoice")}>
                <Plus className="w-4 h-4 mr-2" /> Nueva Factura (Venta)
              </Button>
            </>
          )}

          {activeTab === "presupuestos" && (
            <Button onClick={() => handleCreateNewDocument("quote")}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Presupuesto
            </Button>
          )}

          {activeTab === "recibidas" && (
            <>
              <input
                type="file"
                id="upload-pdf-input"
                accept="application/pdf"
                className="hidden"
                multiple
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
                {isUploading ? "Procesando IA..." : "Subir Factura(s) PDF"}
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
        defaultValue="presupuestos"
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full md:w-[600px] grid-cols-3">
          <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>
          <TabsTrigger value="emitidas">Emitidas (Ventas)</TabsTrigger>
          <TabsTrigger value="recibidas">Recibidas (Gastos)</TabsTrigger>
        </TabsList>

        {/* ========================================== */}
        {/* PESTAÑA PRESUPUESTOS */}
        {/* ========================================== */}
        <TabsContent value="presupuestos" className="space-y-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Presupuesto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center w-16">Descargar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingData ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : presupuestos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay presupuestos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  presupuestos.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openInvoiceDetail(inv)}
                    >
                      <TableCell className="font-medium">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {inv.clientName ||
                          (inv.clientId
                            ? `Cliente #${inv.clientId}`
                            : "Sin Cliente")}
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
                      <TableCell className="text-center">
                        {renderDownloadButton(inv)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

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
                  <TableHead className="text-center w-16">Descargar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingData ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : facturasEmitidas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay facturas emitidas.
                    </TableCell>
                  </TableRow>
                ) : (
                  facturasEmitidas.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openInvoiceDetail(inv)}
                    >
                      <TableCell className="font-medium">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {inv.clientName ||
                          (inv.clientId
                            ? `Cliente #${inv.clientId}`
                            : "Sin Cliente")}
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
                      <TableCell className="text-center">
                        {renderDownloadButton(inv)}
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
        <DialogContent className="lg:max-w-[1250px] md:max-w-[85vw] sm:max-w-[550px] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 border-b">
            <DialogTitle className="text-xl">Detalles del Gasto</DialogTitle>
          </DialogHeader>

          {selectedVendorInvoice && (
            <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 overflow-hidden">
              {/* COLUMNA IZQUIERDA: Datos del Gasto */}
              <div className="overflow-y-auto px-6 py-6 space-y-6 max-h-[calc(90vh-140px)] border-b lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">
                      Proveedor
                    </span>
                    <span className="font-semibold text-blue-900 dark:text-blue-300">
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

                {selectedVendorInvoice.lineItems &&
                  selectedVendorInvoice.lineItems.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        Conceptos de la Factura
                      </Label>
                      <div className="rounded-md border bg-card overflow-hidden">
                        <Table className="text-xs">
                          <TableHeader className="bg-muted/30">
                            <TableRow>
                              <TableHead className="py-2 h-8">
                                Descripción
                              </TableHead>
                              <TableHead className="py-2 h-8 text-right">
                                Cant.
                              </TableHead>
                              <TableHead className="py-2 h-8 text-right">
                                Precio
                              </TableHead>
                              <TableHead className="py-2 h-8 text-right">
                                Importe
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedVendorInvoice.lineItems.map(
                              (line: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="py-2 font-medium">
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
                              ),
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                {selectedVendorInvoice.extractedData &&
                  Object.keys(selectedVendorInvoice.extractedData).length >
                    0 && (
                    <div className="space-y-2 border-t pt-4 mt-4">
                      <Label className="text-sm font-semibold block mb-2">
                        Información Adicional (OCR)
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(
                          selectedVendorInvoice.extractedData,
                        ).map(([key, value]) => {
                          if (key === "pdfPath") return null;
                          const displayValue = Array.isArray(value)
                            ? value.join(" | ")
                            : String(value);
                          if (!displayValue.trim()) return null;
                          return (
                            <div
                              key={key}
                              className="bg-gray-50 dark:bg-zinc-900/50 p-2 rounded border"
                            >
                              <span className="text-[10px] text-muted-foreground font-bold block">
                                {translateLabel(key)}
                              </span>
                              <span
                                className="text-xs truncate block"
                                title={displayValue}
                              >
                                {displayValue}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                <div className="space-y-2 border-t pt-4 mt-4">
                  <Label className="text-sm font-semibold">
                    Estado de la Factura
                  </Label>
                  <div className="flex gap-2 items-center">
                    <select
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                </div>
              </div>

              {/* COLUMNA DERECHA: Visualizador del PDF Original */}
              <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center min-h-[350px] lg:min-h-0">
                {/* 👇 Ahora valida directamente contra tu campo fileUrl de la BD */}
                {selectedVendorInvoice.fileUrl ? (
                  <iframe
                    src={`/api/vendor-invoices/pdf/${selectedVendorInvoice.id}#navpanes=0&toolbar=0`}
                    className="w-full h-full border-0 min-h-[350px] lg:h-[calc(90vh-75px)]"
                    title="Vista previa del PDF original"
                  />
                ) : (
                  <div className="text-center p-6 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs">
                      Esta factura se creó manualmente y no dispone de archivo
                      PDF original.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center px-6 py-4 border-t bg-gray-50 dark:bg-zinc-900/20 gap-4">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="destructive"
                onClick={async () => {
                  if (
                    confirm(
                      "¿Estás seguro de borrar esta factura de forma permanente?",
                    )
                  ) {
                    try {
                      await fetch(
                        `/api/vendor-invoices/${selectedVendorInvoice.id}`,
                        {
                          method: "DELETE",
                        },
                      );
                      toast({ title: "Factura eliminada" });
                      setSelectedVendorInvoice(null);
                      fetchAllInvoices();
                    } catch (e) {
                      toast({
                        title: "Error al borrar",
                        variant: "destructive",
                      });
                    }
                  }
                }}
              >
                Borrar
              </Button>
            </div>
            <Button onClick={() => setSelectedVendorInvoice(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL 4: DETALLES DE FACTURA/PRESUPUESTO EMITIDO */}
      {/* ========================================== */}
      <Dialog
        open={!!editingInvoice}
        onOpenChange={(open) => {
          if (!open) setEditingInvoice(null);
        }}
      >
        <DialogContent
          className={`${editingInvoice && !editingInvoice.isNew ? "lg:max-w-[1250px] md:max-w-[85vw]" : "sm:max-w-[750px]"} w-full max-h-[90vh] flex flex-col p-0 overflow-hidden`}
        >
          <DialogHeader className="px-6 pt-6 pb-2 border-b">
            <DialogTitle className="text-xl">
              {editingInvoice?.isNew
                ? editingInvoice?.type === "quote"
                  ? "Crear Nuevo Presupuesto"
                  : "Crear Nueva Factura"
                : editingInvoice?.type === "quote"
                  ? `Presupuesto: ${editingInvoice?.invoiceNumber}`
                  : `Factura: ${editingInvoice?.invoiceNumber}`}
            </DialogTitle>
            <DialogDescription>
              {editingInvoice?.type === "invoice" &&
              editingInvoice?.status !== "borrador" &&
              !editingInvoice?.isNew
                ? "Esta factura es definitiva y los datos no pueden ser alterados. Puedes descargar el documento."
                : "Edita los detalles y añade las líneas del documento."}
            </DialogDescription>
          </DialogHeader>

          {editingInvoice &&
            (() => {
              const originalInvoice = invoices.find(
                (inv) => inv.id === editingInvoice.id,
              );
              const originalStatus = originalInvoice
                ? originalInvoice.status
                : editingInvoice.status;

              const isReadonly =
                !editingInvoice.isNew &&
                editingInvoice.type === "invoice" &&
                originalStatus !== "borrador";

              const issuedPdfUrl = getIssuedInvoicePdfUrl(editingInvoice);
              const issuedHasOriginalPdf =
                hasIssuedInvoiceOriginalPdf(editingInvoice);

              if (isReadonly) {
                const readonlyItems = editingInvoice.items || [];

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 overflow-hidden">
                    {/* COLUMNA IZQUIERDA: Detalle de la factura emitida */}
                    <div className="overflow-y-auto px-6 py-6 space-y-6 max-h-[calc(90vh-140px)] border-b lg:border-b-0 lg:border-r">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Cliente
                          </span>
                          <span className="font-semibold text-blue-900 dark:text-blue-300">
                            {editingInvoice.clientName ||
                              (editingInvoice.clientId
                                ? `Cliente #${editingInvoice.clientId}`
                                : "Sin Cliente")}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Nº Factura
                          </span>
                          <span className="font-medium">
                            {editingInvoice.invoiceNumber || "S/N"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Fecha Emisión
                          </span>
                          <span>
                            {editingInvoice.issueDate
                              ? new Date(
                                  editingInvoice.issueDate,
                                ).toLocaleDateString()
                              : "Sin fecha"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Total
                          </span>
                          <span className="font-bold text-lg">
                            {toDisplayNumber(
                              editingInvoice.total,
                              0,
                            ).toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Estado
                          </span>
                          {getStatusBadge(editingInvoice.status)}
                        </div>
                        {editingInvoice.concept && (
                          <div>
                            <span className="text-xs text-muted-foreground block mb-1">
                              Concepto
                            </span>
                            <span className="font-medium">
                              {editingInvoice.concept}
                            </span>
                          </div>
                        )}
                      </div>

                      {readonlyItems.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">
                            Conceptos de la Factura
                          </Label>
                          <div className="rounded-md border bg-card overflow-hidden">
                            <Table className="text-xs">
                              <TableHeader className="bg-muted/30">
                                <TableRow>
                                  <TableHead className="py-2 h-8">
                                    Descripción
                                  </TableHead>
                                  <TableHead className="py-2 h-8 text-right">
                                    Cant.
                                  </TableHead>
                                  <TableHead className="py-2 h-8 text-right">
                                    Precio
                                  </TableHead>
                                  <TableHead className="py-2 h-8 text-right">
                                    Importe
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {readonlyItems.map((line: any, idx: number) => {
                                  const quantity = toDisplayNumber(
                                    line.quantity,
                                    1,
                                  );
                                  const unitPrice = toDisplayNumber(
                                    line.unitPrice,
                                    0,
                                  );
                                  const amount = toDisplayNumber(
                                    line.amount,
                                    quantity * unitPrice,
                                  );

                                  return (
                                    <TableRow key={idx}>
                                      <TableCell className="py-2 font-medium">
                                        {line.description || "Sin descripción"}
                                      </TableCell>
                                      <TableCell className="py-2 text-right">
                                        {quantity.toLocaleString("es-ES")}
                                      </TableCell>
                                      <TableCell className="py-2 text-right">
                                        {unitPrice.toLocaleString("es-ES", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 6,
                                        })}{" "}
                                        €
                                      </TableCell>
                                      <TableCell className="py-2 text-right font-semibold">
                                        {amount.toLocaleString("es-ES", {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}{" "}
                                        €
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-6 text-sm border-t pt-4">
                        <div className="text-right space-y-2 w-64">
                          <p className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              Base Imponible:
                            </span>
                            <span className="font-medium">
                              {toDisplayNumber(
                                editingInvoice.subtotal,
                                0,
                              ).toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              €
                            </span>
                          </p>
                          <p className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              IVA (
                              {toDisplayNumber(
                                editingInvoice.taxRate,
                                21,
                              ).toLocaleString("es-ES", {
                                maximumFractionDigits: 2,
                              })}
                              %):
                            </span>
                            <span className="font-medium">
                              {toDisplayNumber(
                                editingInvoice.taxAmount,
                                0,
                              ).toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              €
                            </span>
                          </p>
                          <p className="flex justify-between items-center text-lg border-t pt-2 mt-2">
                            <span className="font-bold">Total:</span>
                            <span className="font-bold">
                              {toDisplayNumber(
                                editingInvoice.total,
                                0,
                              ).toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              €
                            </span>
                          </p>
                        </div>
                      </div>

                      {editingInvoice.extractedData &&
                        Object.keys(editingInvoice.extractedData).length >
                          0 && (
                          <div className="space-y-2 border-t pt-4 mt-4">
                            <Label className="text-sm font-semibold block mb-2">
                              Información Adicional (OCR)
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(editingInvoice.extractedData).map(
                                ([key, value]) => {
                                  if (
                                    [
                                      "pdfPath",
                                      "originalPdfName",
                                      "originalFileName",
                                    ].includes(key)
                                  )
                                    return null;
                                  const displayValue = Array.isArray(value)
                                    ? value.join(" | ")
                                    : String(value ?? "");
                                  if (!displayValue.trim()) return null;
                                  return (
                                    <div
                                      key={key}
                                      className="bg-gray-50 dark:bg-zinc-900/50 p-2 rounded border"
                                    >
                                      <span className="text-[10px] text-muted-foreground font-bold block">
                                        {translateLabel(key)}
                                      </span>
                                      <span
                                        className="text-xs truncate block"
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

                    {/* COLUMNA DERECHA: PDF original o PDF generado */}
                    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center min-h-[350px] lg:min-h-0">
                      {issuedPdfUrl ? (
                        <iframe
                          src={`${issuedPdfUrl}#navpanes=0&toolbar=0`}
                          className="w-full h-full border-0 min-h-[350px] lg:h-[calc(90vh-75px)]"
                          title={
                            issuedHasOriginalPdf
                              ? "Vista previa del PDF original"
                              : "Factura PDF"
                          }
                        />
                      ) : (
                        <div className="text-center p-6 text-muted-foreground">
                          <FileText className="w-10 h-10 mx-auto mb-2 text-zinc-400" />
                          <p className="text-xs">
                            Esta factura no dispone de archivo PDF asociado.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  className={`grid grid-cols-1 ${!editingInvoice.isNew ? "lg:grid-cols-2" : ""} flex-1 min-h-0 overflow-hidden`}
                >
                  {/* COLUMNA FORMULARIO */}
                  <div className="overflow-y-auto px-6 py-6 space-y-6 max-h-[calc(90vh-140px)] min-h-0 border-b lg:border-b-0 lg:border-r">
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Cliente
                        </Label>
                        <div className="flex gap-2">
                          <select
                            disabled={isReadonly}
                            className="flex h-10 w-1/2 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                            value={editingInvoice.clientId || ""}
                            onChange={(e) => {
                              const selectedId = e.target.value
                                ? Number(e.target.value)
                                : undefined;
                              const selectedClient = clients?.find(
                                (c: any) => c.id === selectedId,
                              );
                              setEditingInvoice({
                                ...editingInvoice,
                                clientId: selectedId,
                                clientName: selectedClient
                                  ? selectedClient.name
                                  : "",
                              });
                            }}
                          >
                            <option value="">-- Nuevo / Libre --</option>
                            {clients?.map((client: any) => (
                              <option key={client.id} value={client.id}>
                                {client.name}
                              </option>
                            ))}
                          </select>
                          <Input
                            disabled={isReadonly || !!editingInvoice.clientId}
                            value={editingInvoice.clientName || ""}
                            onChange={(e) =>
                              setEditingInvoice({
                                ...editingInvoice,
                                clientName: e.target.value,
                              })
                            }
                            className="w-1/2 disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                            placeholder="Escribe el nombre..."
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Fecha de Emisión
                        </Label>
                        <Input
                          type="date"
                          disabled={isReadonly}
                          value={editingInvoice.issueDate?.split("T")[0] || ""}
                          onChange={(e) =>
                            setEditingInvoice({
                              ...editingInvoice,
                              issueDate: e.target.value,
                            })
                          }
                          className="mt-1 disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Concepto General
                        </Label>
                        <Input
                          disabled={isReadonly}
                          value={editingInvoice.concept || ""}
                          onChange={(e) =>
                            setEditingInvoice({
                              ...editingInvoice,
                              concept: e.target.value,
                            })
                          }
                          className="mt-1 disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                          placeholder="Ej. Servicios prestados"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Estado
                        </Label>
                        <select
                          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                          value={
                            editingInvoice.type === "invoice"
                              ? editingInvoice.status
                              : editingInvoice.type === "quote" &&
                                  editingInvoice.status !== "borrador"
                                ? editingInvoice.status
                                : "borrador"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (
                              editingInvoice.type === "quote" &&
                              val === "convert_to_invoice"
                            ) {
                              if (
                                confirm(
                                  "Al convertir a Factura, pasará a ser un documento de ventas y, una vez no sea borrador, no se podrá editar. ¿Continuar?",
                                )
                              ) {
                                setEditingInvoice({
                                  ...editingInvoice,
                                  status: "convert_to_invoice",
                                });
                              }
                            } else {
                              setEditingInvoice({
                                ...editingInvoice,
                                status: val,
                              });
                            }
                          }}
                        >
                          {editingInvoice.type === "invoice" ? (
                            <>
                              <option value="borrador">Borrador</option>
                              <option value="emitida">Emitida</option>
                              <option value="pendiente_cobro">
                                Pendiente de Cobro
                              </option>
                              <option value="cobrada">Cobrada</option>
                              <option value="vencida">Vencida</option>
                              <option value="anulada">Anulada</option>
                            </>
                          ) : (
                            <>
                              <option value="borrador">
                                Borrador (Presupuesto)
                              </option>
                              <option
                                value="convert_to_invoice"
                                className="font-bold text-blue-600"
                              >
                                ➡️ Convertir a Factura
                              </option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-sm">
                          Líneas del Documento
                        </h4>
                        {!isReadonly && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newItems = [
                                ...(editingInvoice.items || []),
                                {
                                  description: "Nueva línea",
                                  quantity: "1",
                                  unitPrice: "0",
                                },
                              ];
                              setEditingInvoice({
                                ...editingInvoice,
                                items: newItems,
                              });
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" /> Añadir Concepto
                          </Button>
                        )}
                      </div>

                      <Table className="border rounded-md">
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Descripción / Producto</TableHead>
                            <TableHead className="w-24 text-right">
                              Cant.
                            </TableHead>
                            <TableHead className="w-32 text-right">
                              Precio Ud.
                            </TableHead>
                            {!isReadonly && (
                              <TableHead className="w-10"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(editingInvoice.items || []).map(
                            (item: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="p-2 min-w-[450px]">
                                  <div className="flex gap-2 items-center">
                                    {!isReadonly && (
                                      <Popover
                                        open={openProductSearch === idx}
                                        onOpenChange={(isOpen) =>
                                          setOpenProductSearch(
                                            isOpen ? idx : null,
                                          )
                                        }
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={
                                              openProductSearch === idx
                                            }
                                            className="w-[220px] justify-between px-3 bg-white dark:bg-zinc-950 font-normal shrink-0"
                                            title="Buscar en catálogo"
                                          >
                                            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                                            <span className="truncate flex-1 text-left text-muted-foreground">
                                              Buscar producto...
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-[350px] p-0"
                                          align="start"
                                        >
                                          <Command>
                                            <CommandInput placeholder="Buscar por nombre o tarifa..." />
                                            <CommandList>
                                              <CommandEmpty>
                                                No se encontraron productos.
                                              </CommandEmpty>
                                              <CommandGroup>
                                                {productOptions.map((opt) => (
                                                  <CommandItem
                                                    key={opt.id}
                                                    value={opt.displayName}
                                                    onSelect={() => {
                                                      const newItems = [
                                                        ...editingInvoice.items,
                                                      ];
                                                      newItems[
                                                        idx
                                                      ].description =
                                                        opt.description;
                                                      newItems[idx].unitPrice =
                                                        String(
                                                          opt.price ?? "0",
                                                        );
                                                      setEditingInvoice({
                                                        ...editingInvoice,
                                                        items: newItems,
                                                        taxRate:
                                                          opt.taxRate ||
                                                          editingInvoice.taxRate,
                                                      });
                                                      setOpenProductSearch(
                                                        null,
                                                      );
                                                    }}
                                                  >
                                                    {opt.displayName}
                                                  </CommandItem>
                                                ))}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    )}

                                    <Input
                                      disabled={isReadonly}
                                      className="flex-1 disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-800"
                                      value={item.description || ""}
                                      placeholder="Concepto libre o modificado..."
                                      onChange={(e) => {
                                        const newItems = [
                                          ...editingInvoice.items,
                                        ];
                                        newItems[idx].description =
                                          e.target.value;
                                        setEditingInvoice({
                                          ...editingInvoice,
                                          items: newItems,
                                        });
                                      }}
                                    />
                                  </div>
                                </TableCell>

                                <TableCell className="p-2">
                                  <Input
                                    type="number"
                                    disabled={isReadonly}
                                    className="text-right disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-800"
                                    value={item.quantity ?? "1"}
                                    onChange={(e) => {
                                      const newItems = [
                                        ...editingInvoice.items,
                                      ];
                                      newItems[idx].quantity = e.target.value;
                                      setEditingInvoice({
                                        ...editingInvoice,
                                        items: newItems,
                                      });
                                    }}
                                  />
                                </TableCell>

                                <TableCell className="p-2">
                                  <Input
                                    type="number"
                                    step="0.000001"
                                    disabled={isReadonly}
                                    className="text-right disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-800"
                                    value={item.unitPrice ?? "0"}
                                    onChange={(e) => {
                                      const newItems = [
                                        ...editingInvoice.items,
                                      ];
                                      newItems[idx].unitPrice = e.target.value;
                                      setEditingInvoice({
                                        ...editingInvoice,
                                        items: newItems,
                                      });
                                    }}
                                  />
                                </TableCell>

                                {!isReadonly && (
                                  <TableCell className="p-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => {
                                        const newItems =
                                          editingInvoice.items.filter(
                                            (_: any, i: number) => i !== idx,
                                          );
                                        setEditingInvoice({
                                          ...editingInvoice,
                                          items: newItems,
                                        });
                                      }}
                                    >
                                      X
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Cálculo dinámico de totales */}
                    {(() => {
                      const currentItems = editingInvoice.items || [];
                      const subtotalFromItems = currentItems.reduce(
                        (acc: number, item: any) =>
                          acc +
                          toDisplayNumber(item.quantity, 0) *
                            toDisplayNumber(item.unitPrice, 0),
                        0,
                      );

                      const currentTaxRate =
                        editingInvoice.taxRate !== undefined &&
                        editingInvoice.taxRate !== null
                          ? toDisplayNumber(editingInvoice.taxRate, 21)
                          : 21;

                      const calcSubtotal =
                        isReadonly && editingInvoice.subtotal !== undefined
                          ? toDisplayNumber(
                              editingInvoice.subtotal,
                              subtotalFromItems,
                            )
                          : subtotalFromItems;

                      const calcTax =
                        isReadonly && editingInvoice.taxAmount !== undefined
                          ? toDisplayNumber(
                              editingInvoice.taxAmount,
                              calcSubtotal * (currentTaxRate / 100),
                            )
                          : calcSubtotal * (currentTaxRate / 100);

                      const calcTotal =
                        isReadonly && editingInvoice.total !== undefined
                          ? toDisplayNumber(
                              editingInvoice.total,
                              calcSubtotal + calcTax,
                            )
                          : calcSubtotal + calcTax;

                      return (
                        <div className="flex justify-end gap-6 text-sm border-t pt-4">
                          <div className="text-right space-y-2 w-64">
                            <p className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Base Imponible:
                              </span>
                              <span className="font-medium">
                                {calcSubtotal.toLocaleString("es-ES", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </span>
                            </p>

                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-2">
                                % IVA:
                                <Input
                                  type="number"
                                  disabled={isReadonly}
                                  className="w-20 h-8 text-right px-2 disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-800"
                                  value={currentTaxRate}
                                  onChange={(e) =>
                                    setEditingInvoice({
                                      ...editingInvoice,
                                      taxRate: e.target.value,
                                    })
                                  }
                                />
                              </span>
                              <span className="font-medium">
                                {calcTax.toLocaleString("es-ES", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </span>
                            </div>

                            <p className="flex justify-between items-center text-lg border-t pt-2 mt-2">
                              <span className="font-bold">Total:</span>
                              <span className="font-bold">
                                {calcTotal.toLocaleString("es-ES", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* COLUMNA DERECHA: Visualizador del PDF Original o Autogenerado */}
                  {!editingInvoice.isNew && (
                    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center min-h-[350px] lg:min-h-0">
                      <iframe
                        src={`${getIssuedInvoicePdfUrl(editingInvoice)}#navpanes=0&toolbar=0`}
                        className="w-full h-full border-0 min-h-[350px] lg:h-[calc(90vh-75px)]"
                        title="Factura PDF"
                      />
                    </div>
                  )}
                </div>
              );
            })()}

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center px-6 py-4 border-t bg-gray-50 dark:bg-zinc-900/20 gap-4">
            <div className="flex gap-2 w-full sm:w-auto">
              {!editingInvoice?.isNew &&
                (!editingInvoice?.status ||
                  editingInvoice?.status === "borrador" ||
                  editingInvoice?.type === "quote") && (
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (
                        confirm(
                          "¿Estás seguro de borrar este documento de forma permanente?",
                        )
                      ) {
                        try {
                          await fetch(`/api/invoices/${editingInvoice.id}`, {
                            method: "DELETE",
                          });
                          toast({ title: "Documento eliminado" });
                          setEditingInvoice(null);
                          fetchAllInvoices();
                        } catch (e) {
                          toast({
                            title: "Error al borrar",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                  >
                    Borrar
                  </Button>
                )}
              {!editingInvoice?.isNew && (
                <Button
                  variant="outline"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() =>
                    window.open(
                      getIssuedInvoicePdfUrl(editingInvoice),
                      "_blank",
                    )
                  }
                >
                  <FileText className="w-4 h-4 mr-2" /> Descargar PDF
                </Button>
              )}
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setEditingInvoice(null)}>
                Cerrar
              </Button>

              <Button
                onClick={async () => {
                  try {
                    const cleanItems = (editingInvoice.items || []).map(
                      (item: any) => ({
                        description: item.description || "",
                        quantity: String(item.quantity || "1"),
                        unitPrice: String(item.unitPrice || "0"),
                      }),
                    );

                    const safeStatus =
                      editingInvoice.status === "convert_to_invoice"
                        ? "borrador"
                        : editingInvoice.status;
                    const safeType =
                      editingInvoice.status === "convert_to_invoice"
                        ? "invoice"
                        : editingInvoice.type;

                    const payload = {
                      companyId: editingInvoice.isNew
                        ? companyId
                        : editingInvoice.companyId,
                      clientId: editingInvoice.clientId,
                      projectId: editingInvoice.projectId,
                      type: safeType,
                      clientName: editingInvoice.clientName,
                      invoiceNumber: editingInvoice.invoiceNumber,
                      status: safeStatus,
                      issueDate: editingInvoice.issueDate,
                      dueDate: editingInvoice.dueDate,
                      concept: editingInvoice.concept,
                      items: cleanItems,
                      taxRate: String(editingInvoice.taxRate ?? 21),
                    };

                    const url = editingInvoice.isNew
                      ? "/api/invoices"
                      : `/api/invoices/${editingInvoice.id}`;
                    const method = editingInvoice.isNew ? "POST" : "PATCH";

                    const res = await fetch(url, {
                      method: method,
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });

                    if (res.ok) {
                      toast({
                        title: "Guardado exitoso",
                        description: "Los cambios se aplicaron correctamente.",
                      });
                      setEditingInvoice(null);
                      fetchAllInvoices();
                    } else {
                      const errorData = await res.json();
                      toast({
                        title: "Error al guardar",
                        description: errorData.error || "Revisa los datos.",
                        variant: "destructive",
                      });
                    }
                  } catch (e) {
                    toast({
                      title: "Error al conectar",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {editingInvoice?.isNew ? "Crear Documento" : "Guardar Cambios"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
