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

// ... [mantén las interfaces de SpeechRecognition exactamente igual] ...
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
  const registerPaymentMutation = useRegisterInvoicePayment();
  const { data: allInvoices } = useListInvoices(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );
  const { data: bankAccounts } = useListBankAccounts(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const manualStopRef = useRef(false);
  const transcriptRef = useRef("");
  const processCommandRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
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
            setTranscript((prev) => {
              const updated = prev + transcriptPiece;
              transcriptRef.current = updated;
              return updated;
            });
          } else {
            interimTranscript += transcriptPiece;
            transcriptRef.current = interimTranscript;
            setTranscript(interimTranscript);
          }
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        toast({
          title: "Error de voz",
          description: "No se pudo reconocer la voz.",
          variant: "destructive",
        });
      };

      recognition.onend = () => {
        setIsListening(false);
        if (!manualStopRef.current && transcriptRef.current.trim()) {
          processCommandRef.current(transcriptRef.current);
        }
        manualStopRef.current = false;
      };

      recognitionRef.current = recognition;
    }
    return () => recognitionRef.current?.stop();
  }, [toast]);

  const processCommand = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      parseMutation.mutate(
        {
          data: { text, companyId: activeCompanyId || undefined },
        },
        {
          onSuccess: (res) => {
            // Aseguramos que el intent que guardamos siempre sea en minúsculas
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
      manualStopRef.current = true;
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
            status: "draft",
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Factura guardada",
              description: "Se ha creado como borrador.",
            });
            setShowPreview(false);
            queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
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

  // Renderizados dinámicos según el comando para que no salga "vacío"
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
              {transcript || "Di 'Factura para Acme por 500 euros'"}
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

          {/* Formulario FACTURA */}
          {voiceIntent === "create_invoice" && (
            <div className="space-y-4">
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
