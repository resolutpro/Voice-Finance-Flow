import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DownloadCloud, FileSpreadsheet } from "lucide-react";
import { useCompany } from "@/hooks/use-company";

export default function ReportsPage() {
  const { currentCompany } = useCompany();

  // Estados para los filtros globales
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("todos");
  const [entityId, setEntityId] = useState(""); // ID del Cliente o Proveedor

  // Función genérica para manejar la descarga (la conectaremos al backend más adelante)
  const handleDownload = async (reportType: string) => {
    try {
      // 1. Construimos la URL
      const params = new URLSearchParams();
      params.append("type", reportType);

      if (currentCompany?.id) params.append("companyId", currentCompany.id);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (status && status !== "todos") params.append("status", status);
      if (entityId) params.append("entityId", entityId);

      const baseUrl = import.meta.env.VITE_API_URL || "/api";
      const url = `${baseUrl}/reports/export?${params.toString()}`;

      // Opcional: Si usas tokens en localStorage, puedes añadirlo aquí
      // const token = localStorage.getItem('token');
      // const headers = { 'Authorization': `Bearer ${token}` };

      console.log("Solicitando informe a:", url);

      // 2. Hacemos la petición con fetch
      const response = await fetch(url, {
        method: "GET",
        // headers: headers // Descomenta esto si tu API requiere token
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      // 3. Convertimos la respuesta en un archivo (Blob)
      const blob = await response.blob();

      // 4. Forzamos la descarga en el navegador de forma invisible
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Exportacion_${reportType}_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();

      // 5. Limpiamos
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error en la descarga:", error);
      alert("Hubo un problema al generar el Excel. Revisa la consola.");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Informes y Exportaciones
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Genera y descarga listados en formato Excel para control interno o
          para tu asesoría.
        </p>
      </div>

      {/* SECCIÓN DE FILTROS GLOBALES */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filtros de Exportación</CardTitle>
          <CardDescription>
            Estos filtros se aplicarán a los informes que descargues a
            continuación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFrom">Desde</Label>
              <Input
                type="date"
                id="dateFrom"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateTo">Hasta</Label>
              <Input
                type="date"
                id="dateTo"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="pagado">Pagado / Cobrado</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity">Cliente / Proveedor</Label>
              <Input
                type="text"
                id="entity"
                placeholder="Nombre o ID..."
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BLOQUE 1: FACTURACIÓN */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-xl">Excels de Facturación</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReportItem
              title="Listado de facturas emitidas"
              onClick={() => handleDownload("emitidas")}
            />
            <ReportItem
              title="Listado de facturas recibidas"
              onClick={() => handleDownload("recibidas")}
            />
            <Separator className="my-1" />
            <ReportItem
              title="Facturas pendientes de cobro"
              onClick={() => handleDownload("pendientes_cobro")}
            />
            <ReportItem
              title="Facturas pendientes de pago"
              onClick={() => handleDownload("pendientes_pago")}
            />
            <ReportItem
              title="Vencimientos por periodo"
              onClick={() => handleDownload("vencimientos")}
            />
            <Separator className="my-1" />
            <ReportItem
              title="Facturación por cliente"
              onClick={() => handleDownload("por_cliente")}
            />
            <ReportItem
              title="Compras por proveedor"
              onClick={() => handleDownload("por_proveedor")}
            />
            <ReportItem
              title="Facturación global por empresa/marca"
              onClick={() => handleDownload("global_empresa")}
            />
          </CardContent>
        </Card>

        {/* BLOQUE 2: CONTABILIDAD Y CONTROL */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <CardTitle className="text-xl">Contabilidad y Control</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReportItem
              title="Resumen mensual de ingresos y gastos"
              onClick={() => handleDownload("resumen_mensual")}
            />
            <ReportItem
              title="Previsión de tesorería"
              onClick={() => handleDownload("tesoreria")}
            />
            <ReportItem
              title="Flujo de caja futuro"
              onClick={() => handleDownload("flujo_caja")}
            />
            <ReportItem
              title="Compromisos recurrentes"
              onClick={() => handleDownload("compromisos")}
            />
            <Separator className="my-1" />
            <ReportItem
              title="Estado de saldos por cuenta bancaria"
              onClick={() => handleDownload("saldos_cuenta")}
            />
            <ReportItem
              title="Cuadro consolidado por empresa"
              onClick={() => handleDownload("consolidado")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Componente auxiliar para los botones de descarga
function ReportItem({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors">
      <span className="text-sm font-medium">{title}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        className="h-8 gap-2"
      >
        <DownloadCloud className="h-4 w-4" />
        <span className="hidden sm:inline">Exportar</span>
      </Button>
    </div>
  );
}
