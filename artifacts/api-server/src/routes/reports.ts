import { Router } from "express";
import ExcelJS from "exceljs";

const router = Router();

// Endpoint genérico para exportar informes
router.get("/export", async (req, res) => {
  try {
    // Recibimos los filtros desde el frontend
    const { type, companyId, dateFrom, dateTo, status, entityId } = req.query;

    // 1. Inicializamos un nuevo libro de Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Voice Finance Flow";
    workbook.created = new Date();

    // 2. Creamos una hoja
    const worksheet = workbook.addWorksheet("Datos");

    // --- AQUÍ IRA LA LÓGICA DE BASE DE DATOS MÁS ADELANTE ---
    // Por ahora, creamos columnas y filas de prueba para verificar la conexión

    worksheet.columns = [
      { header: "Parámetro", key: "param", width: 25 },
      { header: "Valor Recibido", key: "value", width: 30 },
    ];

    // Estilo para la cabecera
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" } // Color oscuro tipo Tailwind slate-900
    };

    worksheet.addRows([
      { param: "Tipo de Informe", value: type || "No especificado" },
      { param: "ID Empresa", value: companyId || "Todas" },
      { param: "Fecha Desde", value: dateFrom || "No especificada" },
      { param: "Fecha Hasta", value: dateTo || "No especificada" },
      { param: "Estado", value: status || "todos" },
    ]);

    // 3. Configuramos las cabeceras HTTP para forzar la descarga del archivo
    const fileName = `Exportacion_${type || "General"}_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${fileName}`
    );

    // 4. Escribimos el Excel en un buffer y lo enviamos
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (error) {
    console.error("Error al generar el Excel:", error);
    res.status(500).json({ error: "Ocurrió un error al generar el documento Excel." });
  }
});

export default router;