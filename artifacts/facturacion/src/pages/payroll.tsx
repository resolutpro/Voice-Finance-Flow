import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/use-company";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PayrollUpload {
  id: number;
  payrollDate: string;
  totalIrpf: string;
  totalSeguridadSocialEmpresa: string;
  processingStatus: string;
  sourceFileName: string;
}

export default function PayrollPage() {
  const { activeCompanyId } = useCompany();
  const [items, setItems] = useState<PayrollUpload[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!activeCompanyId) return;
    const res = await fetch(`/api/payroll/uploads?companyId=${activeCompanyId}`);
    if (!res.ok) return;
    setItems(await res.json());
  };

  useEffect(() => {
    loadData();
  }, [activeCompanyId]);

  const onUpload = async (file: File) => {
    if (!activeCompanyId) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", String(activeCompanyId));
    await fetch("/api/payroll/uploads", { method: "POST", body: formData });
    await loadData();
    setLoading(false);
  };

  const totalIrpf = useMemo(() => items.reduce((acc, it) => acc + Number(it.totalIrpf || 0), 0), [items]);

  return (
    <div className="space-y-6 pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Nóminas y Costes Laborales</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void onUpload(file);
            }}
          >
            <p className="font-medium">Arrastra y suelta tu PDF de nómina aquí</p>
            <p className="text-sm text-muted-foreground mt-1">Procesado seguro en memoria + extracción con OpenAI. El PDF no se almacena.</p>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              id="payroll-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
            <Button asChild className="mt-4"><label htmlFor="payroll-upload">Seleccionar PDF</label></Button>
            {loading && <p className="mt-3 text-sm">Procesando nómina...</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Nóminas (IRPF acumulado: {formatCurrency(totalIrpf)})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Fecha de la Nómina</th>
                  <th>Importe IRPF Extracted</th>
                  <th>Importe Seguridad Social Empresa Extracted</th>
                  <th>Estado de Procesamiento</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{formatDate(item.payrollDate)}</td>
                    <td>{formatCurrency(Number(item.totalIrpf))}</td>
                    <td>{formatCurrency(Number(item.totalSeguridadSocialEmpresa))}</td>
                    <td><Badge>{item.processingStatus}</Badge></td>
                    <td className="text-muted-foreground">{item.sourceFileName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
