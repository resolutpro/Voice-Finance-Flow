import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, X, Check } from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useParseVoiceCommand } from "@workspace/api-client-react";
import { Button, Modal, Input, Label } from "@/components/shared-ui";
import { useToast } from "@/hooks/use-toast";

export function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [editablePreview, setEditablePreview] = useState<any>({});
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  
  const parseMutation = useParseVoiceCommand();
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
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

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        toast({ title: "Error de voz", description: "No se pudo reconocer la voz.", variant: "destructive" });
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);

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

  const processCommand = (text: string) => {
    if (!text.trim()) return;
    
    parseMutation.mutate({
      data: { text, companyId: activeCompanyId || undefined }
    }, {
      onSuccess: (res) => {
        if (res.preview) {
          setEditablePreview(res.preview);
          setShowPreview(true);
        } else {
          toast({ title: "Comando entendido", description: res.message });
        }
      },
      onError: () => {
        toast({ title: "Error", description: "No se pudo procesar el comando.", variant: "destructive" });
      }
    });
  };

  const handleConfirmPreview = () => {
    // In a real app, we would map the intent to the correct API call
    // e.g. if intent === 'create_invoice' call useCreateInvoice
    toast({ title: "Guardado", description: "Acción confirmada desde voz." });
    setShowPreview(false);
  };

  return (
    <>
      {/* Transcription overlay */}
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

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleListen}
        className={`fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-50 text-white transition-colors duration-300 ${
          isListening ? 'bg-destructive animate-pulse' : 'bg-primary hover:bg-primary/90'
        }`}
      >
        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </motion.button>

      {/* Preview Dialog */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Confirmar Acción">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">Revisa los datos extraídos de tu comando de voz antes de guardar.</p>
          
          <div className="space-y-4">
            {Object.entries(editablePreview).map(([key, value]) => (
              <div key={key}>
                <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                <Input 
                  value={String(value || '')} 
                  onChange={(e) => setEditablePreview({ ...editablePreview, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancelar</Button>
            <Button onClick={handleConfirmPreview} className="gap-2">
              <Check className="w-4 h-4" /> Confirmar y Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
