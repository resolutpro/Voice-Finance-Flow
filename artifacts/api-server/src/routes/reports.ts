import { Router } from "express";
import ExcelJS from "exceljs";
import { and, eq, gte, lte } from "drizzle-orm";

import {
  db,
  invoicesTable,
  vendorInvoicesTable,
  clientsTable,
  suppliersTable,
} from "@workspace/db";

const router = Router();

router.get("/export", async (req, res) => {
  try {
    const { type, companyId, dateFrom, dateTo, status, entityId } = req.query;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Voice Finance Flow";
    workbook.created = new Date();

    // ==========================================
    // INFORME: FACTURAS EMITIDAS (VENTAS)
    // ==========================================
    if (type === "emitidas") {
      const worksheet = workbook.addWorksheet("Facturas Emitidas");

      // 1. Columnas actualizadas
      worksheet.columns = [
        { header: "Nº Factura", key: "invoiceNumber", width: 15 },
        { header: "Fecha Emisión", key: "issueDate", width: 15 },
        { header: "Fecha Vto.", key: "dueDate", width: 15 },
        { header: "Nombre Cliente", key: "clientName", width: 35 }, // <-- Cambiado a Nombre
        { header: "Subtotal", key: "subtotal", width: 15 },
        { header: "Impuestos", key: "taxAmount", width: 15 },
        { header: "Total", key: "total", width: 15 }, // <-- Clave corregida
        { header: "Estado", key: "status", width: 20 },
      ];

      // Estilo Cabecera
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      }; // Azul

      // 2. Filtros Drizzle (Parseando a Number los IDs para evitar errores)
      const conditions = [];
      if (companyId)
        conditions.push(eq(invoicesTable.companyId, Number(companyId)));
      if (dateFrom)
        conditions.push(gte(invoicesTable.issueDate, String(dateFrom)));
      if (dateTo) conditions.push(lte(invoicesTable.issueDate, String(dateTo)));
      if (status && status !== "todos")
        conditions.push(eq(invoicesTable.status, String(status) as any));
      if (entityId)
        conditions.push(eq(invoicesTable.clientId, Number(entityId)));

      // 3. Consulta a Base de Datos con JOIN a Clientes
      const data = await db
        .select({
          invoice: invoicesTable,
          clientName: clientsTable.name,
        })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(and(...conditions));

      // 4. Volcado al Excel usando los nombres correctos de tu base de datos
      data.forEach((row) => {
        worksheet.addRow({
          invoiceNumber: row.invoice.invoiceNumber, // Corregido: invoiceNumber
          issueDate: row.invoice.issueDate
            ? new Date(row.invoice.issueDate).toLocaleDateString()
            : "",
          dueDate: row.invoice.dueDate
            ? new Date(row.invoice.dueDate).toLocaleDateString()
            : "",
          clientName: row.clientName || "Cliente Desconocido", // Nombre del cliente desde el JOIN
          subtotal: Number(row.invoice.subtotal || 0),
          taxAmount: Number(row.invoice.taxAmount || 0),
          total: Number(row.invoice.total || 0), // Corregido: total en lugar de totalAmount
          status: row.invoice.status?.toUpperCase().replace(/_/g, " "), // Quita barras bajas del estado
        });
      });

      // Formato numérico para el dinero
      worksheet.getColumn("subtotal").numFmt = "#,##0.00€";
      worksheet.getColumn("taxAmount").numFmt = "#,##0.00€";
      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // INFORME: FACTURAS RECIBIDAS (COMPRAS)
    // ==========================================
    else if (type === "recibidas") {
      const worksheet = workbook.addWorksheet("Facturas Recibidas");

      worksheet.columns = [
        { header: "Nº Factura", key: "invoiceNumber", width: 15 },
        { header: "Fecha Emisión", key: "issueDate", width: 15 },
        { header: "Nombre Proveedor", key: "supplierName", width: 35 }, // <-- Cambiado a Nombre
        { header: "Total", key: "total", width: 15 }, // <-- Clave corregida
        { header: "Estado", key: "status", width: 20 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF16A34A" },
      }; // Verde

      const conditions = [];
      if (companyId)
        conditions.push(eq(vendorInvoicesTable.companyId, Number(companyId)));
      if (dateFrom)
        conditions.push(gte(vendorInvoicesTable.issueDate, String(dateFrom)));
      if (dateTo)
        conditions.push(lte(vendorInvoicesTable.issueDate, String(dateTo)));
      if (status && status !== "todos")
        conditions.push(eq(vendorInvoicesTable.status, String(status) as any));
      if (entityId)
        conditions.push(eq(vendorInvoicesTable.supplierId, Number(entityId)));

      // 3. Consulta a BD con JOIN a Proveedores
      const data = await db
        .select({
          invoice: vendorInvoicesTable,
          supplierName: suppliersTable.name,
        })
        .from(vendorInvoicesTable)
        .leftJoin(
          suppliersTable,
          eq(vendorInvoicesTable.supplierId, suppliersTable.id),
        )
        .where(and(...conditions));

      data.forEach((row) => {
        worksheet.addRow({
          invoiceNumber: row.invoice.invoiceNumber, // Corregido: invoiceNumber
          issueDate: row.invoice.issueDate
            ? new Date(row.invoice.issueDate).toLocaleDateString()
            : "",
          supplierName: row.supplierName || "Proveedor Desconocido", // Nombre del proveedor desde el JOIN
          total: Number(row.invoice.total || 0), // Corregido: total en lugar de totalAmount
          status: row.invoice.status?.toUpperCase().replace(/_/g, " "),
        });
      });

      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // FALLBACK
    // ==========================================
    else {
      const worksheet = workbook.addWorksheet("Datos no disponibles");
      worksheet.addRow([
        "El informe de tipo '" + type + "' está en desarrollo.",
      ]);
    }

    // Configuración de respuesta HTTP
    const fileName = `Exportacion_${type || "General"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar el Excel:", error);
    res
      .status(500)
      .json({ error: "Ocurrió un error al generar el documento Excel." });
  }
});

export default router;
