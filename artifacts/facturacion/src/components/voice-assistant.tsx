import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, X, Check } from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useParseVoiceCommand, useCreateInvoice, useCreateExpense, useCreateTask } from "@workspace/api-client-react";
import { Button, Modal, Input, Label } from "@/components/shared-ui";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface VoicePreview {
  type: string;
  companyId?: number;
  clientId?: number | null;
  clientName?: string | null;
  items?: Array<{ description: string; quantity: string; unitPrice: string }>;
  taxRate?: string;
  issueDate?: string;
  description?: string;
  amount?: string;
  expenseDate?: string;
  title?: string;
  dueDate?: string | null;
  status?: string;
  priority?: string;
  path?: string;
  invoiceNumber?: string;
}

export function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [editablePreview, setEditablePreview] = useState<VoicePreview>({ type: "" });
  const [voiceIntent, setVoiceIntent] = useState("");
  const [voiceMessage, setVoiceMessage] = useState("");
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const parseMutation = useParseVoiceCommand();
  const createInvoiceMutation = useCreateInvoice();
  const createExpenseMutation = useCreateExpense();
  const createTaskMutation = useCreateTask();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "es-ES";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setTranscript(prev => prev + transcriptPiece);
          } else {
            interimTranscript += transcriptPiece;
            setTranscript(interimTranscript);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        toast({ title: "Error de voz", description: "No se pudo reconocer la voz.", variant: "destructive" });
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);

  const processCommand = useCallback((text: string) => {
    if (!text.trim()) return;

    parseMutation.mutate({
      data: { text, companyId: activeCompanyId || undefined }
    }, {
      onSuccess: (res) => {
        setVoiceIntent(res.intent || "unknown");
        setVoiceMessage(res.message || "");

        if (res.preview && res.preview.type === "navigation" && res.preview.path) {
          setLocation(res.preview.path);
          toast({ title: "Navegando", description: res.message });
          return;
        }

        if (res.preview) {
          setEditablePreview(res.preview as VoicePreview);
          setShowPreview(true);
        } else {
          toast({ title: "Comando recibido", description: res.message });
        }
      },
      onError: () => {
        toast({ title: "Error", description: "No se pudo procesar el comando.", variant: "destructive" });
      }
    });
  }, [parseMutation, activeCompanyId, setLocation, toast]);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      processCommand(transcript);
    } else {
      setTranscript("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleConfirmPreview = () => {
    const companyId = editablePreview.companyId || activeCompanyId;
    if (!companyId) {
      toast({ title: "Error", description: "Selecciona una empresa primero.", variant: "destructive" });
      return;
    }

    if (voiceIntent === "create_invoice") {
      createInvoiceMutation.mutate({
        data: {
          companyId,
          clientId: editablePreview.clientId ?? undefined,
          items: editablePreview.items || [],
          taxRate: editablePreview.taxRate || "21",
          issueDate: editablePreview.issueDate || new Date().toISOString().split("T")[0],
          status: "draft",
        }
      }, {
        onSuccess: () => {
          toast({ title: "Factura creada", description: "Se ha creado la factura desde comando de voz." });
          setShowPreview(false);
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo crear la factura.", variant: "destructive" });
        }
      });
      return;
    }

    if (voiceIntent === "create_expense") {
      createExpenseMutation.mutate({
        data: {
          companyId,
          description: editablePreview.description || "Gasto desde voz",
          amount: editablePreview.amount || "0",
          taxRate: editablePreview.taxRate || "21",
          expenseDate: editablePreview.expenseDate || new Date().toISOString().split("T")[0],
          status: "pending",
        }
      }, {
        onSuccess: () => {
          toast({ title: "Gasto registrado", description: "Se ha registrado el gasto desde comando de voz." });
          setShowPreview(false);
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo registrar el gasto.", variant: "destructive" });
        }
      });
      return;
    }

    if (voiceIntent === "create_task") {
      createTaskMutation.mutate({
        data: {
          companyId,
          title: editablePreview.title || "Tarea desde voz",
          status: "pending",
          priority: editablePreview.priority || "normal",
          dueDate: editablePreview.dueDate || undefined,
        }
      }, {
        onSuccess: () => {
          toast({ title: "Tarea creada", description: "Se ha creado la tarea desde comando de voz." });
          setShowPreview(false);
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo crear la tarea.", variant: "destructive" });
        }
      });
      return;
    }

    toast({ title: "Acción no soportada", description: "Este tipo de acción aún no se puede confirmar.", variant: "destructive" });
  };

  const previewLabels: Record<string, string> = {
    type: "Tipo",
    companyId: "Empresa",
    clientId: "Cliente",
    clientName: "Nombre del cliente",
    description: "Descripción",
    amount: "Importe",
    taxRate: "% IVA",
    issueDate: "Fecha emisión",
    expenseDate: "Fecha gasto",
    title: "Título",
    dueDate: "Fecha límite",
    status: "Estado",
    priority: "Prioridad",
    invoiceNumber: "Nº Factura",
  };

  return (
    <>
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 right-8 bg-card border border-border shadow-2xl p-6 rounded-2xl max-w-sm w-full z-50"
          >
            <div className="flex items-center gap-3 text-primary mb-3">
              <Sparkles className="w-5 h-5 animate-pulse" />
              <h4 className="font-semibold">Escuchando...</h4>
            </div>
            <p className="text-foreground/80 italic min-h-[3rem]">
              {transcript || "Di algo como 'Crear factura para Acme por 500 euros'..."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleListen}
        className={`fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-50 text-white transition-colors duration-300 ${
          isListening ? "bg-destructive animate-pulse" : "bg-primary hover:bg-primary/90"
        }`}
      >
        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </motion.button>

      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Confirmar Acción">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-2">{voiceMessage}</p>
          <p className="text-xs text-muted-foreground mb-4">Revisa los datos extraídos de tu comando de voz antes de guardar.</p>

          <div className="space-y-4">
            {Object.entries(editablePreview)
              .filter(([key]) => key !== "type" && key !== "items" && key !== "path")
              .map(([key, value]) => (
                <div key={key}>
                  <Label>{previewLabels[key] || key}</Label>
                  <Input
                    value={String(value ?? "")}
                    onChange={(e) => setEditablePreview({ ...editablePreview, [key]: e.target.value })}
                  />
                </div>
              ))}

            {editablePreview.items && editablePreview.items.length > 0 && (
              <div>
                <Label>Líneas</Label>
                {editablePreview.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mt-2">
                    <Input
                      placeholder="Descripción"
                      value={item.description}
                      onChange={(e) => {
                        const newItems = [...editablePreview.items!];
                        newItems[idx] = { ...newItems[idx], description: e.target.value };
                        setEditablePreview({ ...editablePreview, items: newItems });
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Cantidad"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...editablePreview.items!];
                        newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                        setEditablePreview({ ...editablePreview, items: newItems });
                      }}
                      className="w-20"
                    />
                    <Input
                      placeholder="Precio"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const newItems = [...editablePreview.items!];
                        newItems[idx] = { ...newItems[idx], unitPrice: e.target.value };
                        setEditablePreview({ ...editablePreview, items: newItems });
                      }}
                      className="w-24"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmPreview}
              className="gap-2"
              disabled={createInvoiceMutation.isPending || createExpenseMutation.isPending || createTaskMutation.isPending}
            >
              <Check className="w-4 h-4" /> Confirmar y Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
