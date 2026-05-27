import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, TrendingUp } from "lucide-react";

export interface PayrollUpload {
  id?: number;
  payrollDate: string; // "YYYY-MM-DD"
  totalIrpf: string | number;
  totalSeguridadSocialEmpresa: string | number;
}

interface PayrollSummaryCardsProps {
  uploads: PayrollUpload[];
}

export function PayrollSummaryCards({ uploads }: PayrollSummaryCardsProps) {
  const summary = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    // Prefijo del mes actual (ej: "2026-06") para no ocultar el pago si ya estamos en el mes de pago
    const currentMonthPrefix = todayStr.substring(0, 7);

    const ssMap: Record<string, number> = {};
    const irpfMap: Record<string, number> = {};

    // 1. Agrupamos y sumamos todos los pagos según su fecha de vencimiento real
    uploads.forEach((upload) => {
      if (!upload.payrollDate) return;

      const pDate = new Date(`${upload.payrollDate}T00:00:00Z`);
      const pYear = pDate.getUTCFullYear();
      const pMonth = pDate.getUTCMonth(); // Enero es 0, Diciembre es 11

      // --- CÁLCULO SEGURIDAD SOCIAL ---
      // Se paga el último día del mes siguiente.
      // Date.UTC(año, mes + 2, 0) nos da exactamente el último día del mes siguiente.
      const ssDueDate = new Date(Date.UTC(pYear, pMonth + 2, 0));
      const ssKey = ssDueDate.toISOString().split("T")[0];

      ssMap[ssKey] =
        (ssMap[ssKey] || 0) + Number(upload.totalSeguridadSocialEmpresa || 0);

      // --- CÁLCULO IRPF (TRIMESTRAL) ---
      // Se paga el día 20 del mes posterior al cierre de trimestre.
      const quarter = Math.floor(pMonth / 3); // 0 (Q1), 1 (Q2), 2 (Q3), 3 (Q4)
      const irpfMonth = [3, 6, 9, 0][quarter]; // Meses de pago: Abril, Julio, Octubre, Enero
      const irpfYear = quarter === 3 ? pYear + 1 : pYear; // Si es Q4, se paga el año que viene

      const irpfDueDate = new Date(Date.UTC(irpfYear, irpfMonth, 20));
      const irpfKey = irpfDueDate.toISOString().split("T")[0];

      irpfMap[irpfKey] =
        (irpfMap[irpfKey] || 0) + Number(upload.totalIrpf || 0);
    });

    // 2. Filtramos para mostrar solo el PRÓXIMO pago pendiente (futuro o del mes actual)
    const futureSsKeys = Object.keys(ssMap)
      .filter((k) => k >= todayStr || k.startsWith(currentMonthPrefix))
      .sort();
    const nextSsDate = futureSsKeys[0] || null;
    const nextSsAmount = nextSsDate ? ssMap[nextSsDate] : 0;

    const futureIrpfKeys = Object.keys(irpfMap)
      .filter((k) => k >= todayStr || k.startsWith(currentMonthPrefix))
      .sort();
    const nextIrpfDate = futureIrpfKeys[0] || null;
    const nextIrpfAmount = nextIrpfDate ? irpfMap[nextIrpfDate] : 0;

    return { nextSsDate, nextSsAmount, nextIrpfDate, nextIrpfAmount };
  }, [uploads]);

  // Formateador para Euros
  const formatEUR = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  // Formateador de Fechas (DD/MM/YYYY)
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No hay nóminas / pagos calculados";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
      {/* Tarjeta: Seguridad Social */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Seguridad Social a Pagar
          </CardTitle>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatEUR(summary.nextSsAmount)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Vencimiento: {formatDate(summary.nextSsDate)}
          </p>
        </CardContent>
      </Card>

      {/* Tarjeta: IRPF Trimestral */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            IRPF a Pagar (Trimestre)
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatEUR(summary.nextIrpfAmount)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Vencimiento: {formatDate(summary.nextIrpfDate)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
