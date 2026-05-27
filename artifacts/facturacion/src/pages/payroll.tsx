import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/use-company";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/shared-ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PayrollSummaryCards } from "@/components/payroll-summary-cards";

export interface PayrollUpload {
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
    const res = await fetch(
      `/api/payroll/uploads?companyId=${activeCompanyId}`,
    );
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

  const totalIrpf = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.totalIrpf || 0), 0),
    [items],
  );

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Gestión de Nóminas
        </h1>
        <p className="text-muted-foreground">
          Sube tus nóminas y controla los próximos pagos de Seguridad Social e
          IRPF.
        </p>
      </div>

      {/* AQUÍ INCLUIMOS LAS TARJETAS RESUMEN */}
      {items.length > 0 && <PayrollSummaryCards uploads={items} />}

      <Card>
        <CardHeader>
          <CardTitle>Subir nueva nómina</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void onUpload(file);
            }}
          >
            <p className="font-medium">
              Arrastra y suelta tu PDF de nómina aquí
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Procesado seguro en memoria + extracción inteligente. El PDF no se
              almacena.
            </p>
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
            <Button asChild className="mt-4">
              <label htmlFor="payroll-upload">Seleccionar PDF</label>
            </Button>
            {loading && (
              <p className="mt-3 text-sm text-primary font-medium animate-pulse">
                Procesando nómina y extrayendo datos...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Nóminas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b">
                  <th className="py-3 font-semibold">Fecha</th>
                  <th className="py-3 font-semibold">IRPF Extracted</th>
                  <th className="py-3 font-semibold">SS Empresa Extracted</th>
                  <th className="py-3 font-semibold">Estado</th>
                  <th className="py-3 font-semibold text-right">Archivo</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No hay nóminas subidas aún.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3">{formatDate(item.payrollDate)}</td>
                      <td className="py-3">
                        {formatCurrency(Number(item.totalIrpf))}
                      </td>
                      <td className="py-3">
                        {formatCurrency(
                          Number(item.totalSeguridadSocialEmpresa),
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">{item.processingStatus}</Badge>
                      </td>
                      <td
                        className="py-3 text-right text-muted-foreground truncate max-w-[200px]"
                        title={item.sourceFileName}
                      >
                        {item.sourceFileName}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
