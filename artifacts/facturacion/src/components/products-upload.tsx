import React, { useState } from "react";
import { Input } from "./ui/input";
import { useToast } from "../hooks/use-toast";

export function ProductsUpload({
  companyId,
  onUploadSuccess,
}: {
  companyId: number;
  onUploadSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n");

      const productsToCreate = [];
      let startParsing = false;

      for (const line of lines) {
        const columns = line.split("\t");

        // Detecta las cabeceras del archivo que enviaste
        if (
          columns[0]?.trim() === "ARTICULO" &&
          columns[1]?.trim() === "PRECIO"
        ) {
          startParsing = true;
          continue;
        }

        if (startParsing && columns[0]?.trim()) {
          const articulo = columns[0].trim();

          // Limpieza de precio: de "1.404,96" a "1404.96"
          const precioLimpio = columns[1]
            ?.trim()
            .replace(/\./g, "")
            .replace(",", ".");

          // Limpieza de IGIC: de "21%" a "21.00"
          const igicLimpio = columns[2]?.trim().replace("%", "");

          productsToCreate.push({
            companyId,
            name: articulo,
            price: precioLimpio || "0",
            taxRate: igicLimpio || "0",
            active: true,
          });
        }
      }

      try {
        // Asumiendo que usas fetch nativo o la función generada por orval
        const response = await fetch("/api/products/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productsToCreate),
        });

        if (response.ok) {
          toast({
            title: "Éxito",
            description: `${productsToCreate.length} artículos importados correctamente.`,
          });
          if (onUploadSuccess) onUploadSuccess();
        } else {
          throw new Error("Fallo en la API");
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "Error",
          description: "Hubo un error importando los artículos.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="p-4 border border-dashed rounded-lg bg-slate-50">
      <h3 className="text-sm font-semibold mb-2">Importar Artículos (TSV)</h3>
      <Input
        type="file"
        accept=".tsv,.csv,.txt"
        onChange={handleFileUpload}
        disabled={loading}
      />
      {loading && (
        <p className="text-xs text-muted-foreground mt-2">
          Procesando archivo...
        </p>
      )}
    </div>
  );
}
