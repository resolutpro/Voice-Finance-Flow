import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Check } from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import {
  useParseVoiceCommand,
  useCreateInvoice,
  useCreateExpense,
  useCreateTask,
  useRegisterInvoicePayment,
  useListInvoices,
  useListBankAccounts,
} from "@workspace/api-client-react";
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
  const [editablePreview, setEditablePreview] = useState<VoicePreview>({
    type: "",
  });
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
  const transcriptRef = useRef(""); // Acumula las frases finales
  const latestTranscriptRef = useRef(""); // Guarda el texto EXACTO en tiempo real (final + provisional)
  const processCommandRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "es-ES";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        let currentFinal = transcriptRef.current;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentFinal += transcriptPiece + " ";
            transcriptRef.current = currentFinal; // Actualizamos la ref consolidada al instante
          } else {
            interimTranscript += transcriptPiece;
          }
        }

        const fullText = currentFinal + interimTranscript;
        latestTranscriptRef.current = fullText; // Guardamos lo último escuchado sin retrasos de React
        setTranscript(fullText);
      };

      recognition.onerror = () => {
        setIsListening(false);
        // Si hubo un error (ej. silencio prolongado) pero hay texto, intentamos mandarlo
        if (latestTranscriptRef.current.trim()) {
          processCommandRef.current(latestTranscriptRef.current);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Este evento se dispara automáticamente cuando llamamos a stop()
        if (latestTranscriptRef.current.trim()) {
          processCommandRef.current(latestTranscriptRef.current);
        }

        // Limpiamos referencias para la próxima vez
        transcriptRef.current = "";
        latestTranscriptRef.current = "";
        setTranscript("");
      };

      recognitionRef.current = recognition;
    }
    return () => recognitionRef.current?.stop();
  }, []);

  const processCommand = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      toast({
        title: "Procesando audio...",
        description: "La IA está analizando tu solicitud.",
      });

      parseMutation.mutate(
        {
          data: { text, companyId: activeCompanyId || undefined },
        },
        {
          onSuccess: (res) => {
            const intent = (res.intent || "unknown").toLowerCase();
            setVoiceIntent(intent);
            setVoiceMessage(res.message || "");

            if (res.preview?.type === "navigation" && res.preview.path) {
              setLocation(String(res.preview.path));
              toast({
                title: "Navegando",
                description: "Mostrando datos solicitados...",
              });
              return;
            }

            // NUEVO: COMPORTAMIENTO PARA FACTURAS Y PRESUPUESTOS
            if (intent === "create_invoice") {
              const currentPath = window.location.pathname;

              // 1. Guardamos el borrador de la IA en la memoria del navegador
              sessionStorage.setItem(
                "voice_draft_invoice",
                JSON.stringify(res.preview),
              );

              // 2. Si ya estamos en /invoices avisamos a la página, si no, navegamos hacia allá
              if (currentPath === "/invoices") {
                window.dispatchEvent(new Event("voice_draft_ready"));
              } else {
                setLocation("/invoices");
              }

              toast({
                title:
                  res.preview?.type === "quote"
                    ? "📋 Abriendo Presupuesto..."
                    : "🧾 Abriendo Factura...",
                description: "Cargando datos en el formulario principal.",
              });
              return; // Salimos de la función para que NO se abra el modal pequeño
            }

            // Para el resto (gastos, tareas) mantenemos el modal de vista previa
            if (res.preview) {
              setEditablePreview(res.preview as unknown as VoicePreview);
              setShowPreview(true);
            } else {
              toast({ title: "Comando recibido", description: res.message });
            }
          },
          onError: () => {
            toast({
              title: "Error",
              description: "No se pudo procesar el comando.",
              variant: "destructive",
            });
          },
        },
      );
    },
    [parseMutation, activeCompanyId, setLocation, toast],
  );

  processCommandRef.current = processCommand;

  const toggleListen = () => {
    if (isListening) {
      // Al hacer stop(), el micrófono se apaga y dispara el evento 'onend' que configuramos arriba,
      // el cual se encarga de coger el latestTranscriptRef y enviarlo con total seguridad.
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      transcriptRef.current = "";
      latestTranscriptRef.current = "";
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleConfirmPreview = () => {
    const companyId = editablePreview.companyId || activeCompanyId;
    if (!companyId) return;

    if (voiceIntent === "create_invoice") {
      createInvoiceMutation.mutate(
        {
          data: {
            companyId,
            clientId: editablePreview.clientId ?? undefined,
            items: editablePreview.items || [],
            taxRate: editablePreview.taxRate || "21",
            issueDate:
              editablePreview.issueDate ||
              new Date().toISOString().split("T")[0],
            dueDate: editablePreview.dueDate || undefined,
            type: editablePreview.type === "quote" ? "quote" : "invoice",
            status: "borrador",
          },
        },
        {
          onSuccess: () => {
            toast({
              title:
                editablePreview.type === "quote"
                  ? "Presupuesto guardado"
                  : "Factura guardada",
              description: "Se ha creado como borrador.",
            });
            setShowPreview(false);
            queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
          },
          onError: (error: any) => {
            toast({
              title: "Error guardando documento",
              description: error.message || "Ocurrió un error inesperado",
              variant: "destructive",
            });
          },
        },
      );
      return;
    }

    if (voiceIntent === "create_expense") {
      createExpenseMutation.mutate(
        {
          data: {
            companyId,
            description: editablePreview.description || "",
            amount: editablePreview.amount || "0",
            taxRate: editablePreview.taxRate || "21",
            expenseDate:
              editablePreview.expenseDate ||
              new Date().toISOString().split("T")[0],
            status: "pending",
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Gasto registrado",
              description: "Se ha añadido correctamente.",
            });
            setShowPreview(false);
            queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          },
        },
      );
      return;
    }

    if (voiceIntent === "create_task") {
      createTaskMutation.mutate(
        {
          data: {
            companyId,
            title: editablePreview.title || "",
            status: "pending",
            priority: "normal",
            dueDate: editablePreview.dueDate || undefined,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Tarea creada" });
            setShowPreview(false);
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          },
        },
      );
      return;
    }
  };

  return (
    <>
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 right-8 bg-card border border-border shadow-2xl p-6 rounded-2xl max-w-sm w-full z-50"
          >
            <div className="flex items-center gap-3 text-primary mb-3">
              <Sparkles className="w-5 h-5 animate-pulse" />
              <h4 className="font-semibold">Escuchando...</h4>
            </div>
            <p className="text-foreground/80 italic min-h-[3rem]">
              {transcript || "Di 'Crear presupuesto para Acme por 500 euros'"}
            </p>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Pulsa el micrófono para enviar
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleListen}
        className={`fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-50 text-white transition-colors duration-300 ${
          isListening
            ? "bg-destructive animate-pulse"
            : "bg-primary hover:bg-primary/90"
        }`}
      >
        {isListening ? (
          <MicOff className="w-6 h-6" />
        ) : (
          <Mic className="w-6 h-6" />
        )}
      </motion.button>

      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Confirmar Acción"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Revisa los datos extraídos de tu comando de voz.
          </p>

          {/* Formulario FACTURA / PRESUPUESTO */}
          {voiceIntent === "create_invoice" && (
            <div className="space-y-4">
              <div className="font-bold text-lg text-primary border-b pb-2">
                {editablePreview.type === "quote"
                  ? "📋 Nuevo Presupuesto"
                  : "🧾 Nueva Factura"}
              </div>
              <div>
                <Label>Nombre del Cliente</Label>
                <Input
                  value={editablePreview.clientName || ""}
                  onChange={(e) =>
                    setEditablePreview({
                      ...editablePreview,
                      clientName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Importe (€)</Label>
                  <Input
                    type="number"
                    value={editablePreview.items?.[0]?.unitPrice || ""}
                    onChange={(e) => {
                      const newItems = [
                        ...(editablePreview.items || [
                          { description: "", quantity: "1", unitPrice: "0" },
                        ]),
                      ];
                      newItems[0].unitPrice = e.target.value;
                      setEditablePreview({
                        ...editablePreview,
                        items: newItems,
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>% IVA</Label>
                  <Input
                    type="number"
                    value={editablePreview.taxRate || ""}
                    onChange={(e) =>
                      setEditablePreview({
                        ...editablePreview,
                        taxRate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Concepto</Label>
                <Input
                  value={editablePreview.items?.[0]?.description || ""}
                  onChange={(e) => {
                    const newItems = [
                      ...(editablePreview.items || [
                        { description: "", quantity: "1", unitPrice: "0" },
                      ]),
                    ];
                    newItems[0].description = e.target.value;
                    setEditablePreview({ ...editablePreview, items: newItems });
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha Emisión</Label>
                  <Input
                    type="date"
                    value={editablePreview.issueDate || ""}
                    onChange={(e) =>
                      setEditablePreview({
                        ...editablePreview,
                        issueDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Vencimiento (Opcional)</Label>
                  <Input
                    type="date"
                    value={editablePreview.dueDate || ""}
                    onChange={(e) =>
                      setEditablePreview({
                        ...editablePreview,
                        dueDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Formulario GASTO */}
          {voiceIntent === "create_expense" && (
            <div className="space-y-4">
              <div>
                <Label>Descripción del Gasto</Label>
                <Input
                  value={editablePreview.description || ""}
                  onChange={(e) =>
                    setEditablePreview({
                      ...editablePreview,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Importe (€)</Label>
                  <Input
                    type="number"
                    value={editablePreview.amount || ""}
                    onChange={(e) =>
                      setEditablePreview({
                        ...editablePreview,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={editablePreview.expenseDate || ""}
                    onChange={(e) =>
                      setEditablePreview({
                        ...editablePreview,
                        expenseDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Formulario TAREA */}
          {voiceIntent === "create_task" && (
            <div className="space-y-4">
              <div>
                <Label>Título de la Tarea</Label>
                <Input
                  value={editablePreview.title || ""}
                  onChange={(e) =>
                    setEditablePreview({
                      ...editablePreview,
                      title: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Fecha límite</Label>
                <Input
                  type="date"
                  value={editablePreview.dueDate || ""}
                  onChange={(e) =>
                    setEditablePreview({
                      ...editablePreview,
                      dueDate: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmPreview}
              className="gap-2"
              disabled={
                createInvoiceMutation.isPending ||
                createExpenseMutation.isPending ||
                createTaskMutation.isPending
              }
            >
              <Check className="w-4 h-4" /> Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
