import { Router } from "express";
import ExcelJS from "exceljs"; // <-- Importación corregida
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";

import {
  db,
  invoicesTable,
  vendorInvoicesTable,
  clientsTable,
  suppliersTable,
  bankAccountsTable,
  cashMovementsTable,
  recurringCommitmentsTable,
  companiesTable,
} from "@workspace/db";

const router = Router();

router.get("/export", async (req, res) => {
  try {
    const { type, companyId, dateFrom, dateTo, status, entityId } = req.query;

    const workbook = new ExcelJS.Workbook(); // <-- Llamada corregida
    workbook.creator = "Voice Finance Flow";
    workbook.created = new Date();

    // Función auxiliar para color y estilo de cabecera
    const styleHeader = (worksheet: ExcelJS.Worksheet, hexColor: string) => {
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: hexColor },
      };
    };

    // ==========================================
    // 1 & 3. EMITIDAS y PENDIENTES DE COBRO
    // ==========================================
    if (type === "emitidas" || type === "pendientes_cobro") {
      const worksheet = workbook.addWorksheet(
        type === "emitidas" ? "Facturas Emitidas" : "Pendientes de Cobro",
      );

      worksheet.columns = [
        { header: "Nº Factura", key: "invoiceNumber", width: 15 },
        { header: "Fecha Emisión", key: "issueDate", width: 15 },
        { header: "Fecha Vto.", key: "dueDate", width: 15 },
        { header: "Cliente", key: "clientName", width: 35 },
        { header: "Total", key: "total", width: 15 },
        { header: "Estado", key: "status", width: 20 },
      ];
      styleHeader(worksheet, type === "emitidas" ? "FF2563EB" : "FFDC2626");

      const conditions = [];
      if (companyId)
        conditions.push(eq(invoicesTable.companyId, Number(companyId)));
      if (dateFrom)
        conditions.push(gte(invoicesTable.issueDate, String(dateFrom)));
      if (dateTo) conditions.push(lte(invoicesTable.issueDate, String(dateTo)));
      if (entityId)
        conditions.push(eq(invoicesTable.clientId, Number(entityId)));

      if (type === "pendientes_cobro") {
        conditions.push(
          inArray(invoicesTable.status, ["pendiente_cobro", "vencida"] as any),
        );
      } else if (status && status !== "todos") {
        conditions.push(eq(invoicesTable.status, String(status) as any));
      }

      const data = await db
        .select({ invoice: invoicesTable, clientName: clientsTable.name })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(and(...conditions));

      data.forEach((row) => {
        worksheet.addRow({
          invoiceNumber: row.invoice.invoiceNumber,
          issueDate: row.invoice.issueDate
            ? new Date(row.invoice.issueDate).toLocaleDateString()
            : "",
          dueDate: row.invoice.dueDate
            ? new Date(row.invoice.dueDate).toLocaleDateString()
            : "",
          clientName: row.clientName || "Cliente Desconocido",
          total: Number(row.invoice.total || 0),
          status: row.invoice.status?.toUpperCase().replace(/_/g, " "),
        });
      });
      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 2 & 4. RECIBIDAS y PENDIENTES DE PAGO
    // ==========================================
    else if (type === "recibidas" || type === "pendientes_pago") {
      const worksheet = workbook.addWorksheet(
        type === "recibidas" ? "Facturas Recibidas" : "Pendientes de Pago",
      );

      worksheet.columns = [
        { header: "Nº Factura", key: "invoiceNumber", width: 15 },
        { header: "Fecha Emisión", key: "issueDate", width: 15 },
        { header: "Fecha Vto.", key: "dueDate", width: 15 },
        { header: "Proveedor", key: "supplierName", width: 35 },
        { header: "Total", key: "total", width: 15 },
        { header: "Estado", key: "status", width: 20 },
      ];
      styleHeader(worksheet, type === "recibidas" ? "FF16A34A" : "FFEA580C");

      const conditions = [];
      if (companyId)
        conditions.push(eq(vendorInvoicesTable.companyId, Number(companyId)));
      if (dateFrom)
        conditions.push(gte(vendorInvoicesTable.issueDate, String(dateFrom)));
      if (dateTo)
        conditions.push(lte(vendorInvoicesTable.issueDate, String(dateTo)));
      if (entityId)
        conditions.push(eq(vendorInvoicesTable.supplierId, Number(entityId)));

      if (type === "pendientes_pago") {
        conditions.push(
          inArray(vendorInvoicesTable.status, [
            "pendiente_pago",
            "vencida",
          ] as any),
        );
      } else if (status && status !== "todos") {
        conditions.push(eq(vendorInvoicesTable.status, String(status) as any));
      }

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
          invoiceNumber: row.invoice.invoiceNumber,
          issueDate: row.invoice.issueDate
            ? new Date(row.invoice.issueDate).toLocaleDateString()
            : "",
          dueDate: row.invoice.dueDate
            ? new Date(row.invoice.dueDate).toLocaleDateString()
            : "",
          supplierName: row.supplierName || "Proveedor Desconocido",
          total: Number(row.invoice.total || 0),
          status: row.invoice.status?.toUpperCase().replace(/_/g, " "),
        });
      });
      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 5. VENCIMIENTOS POR PERIODO (MIXTO)
    // ==========================================
    else if (type === "vencimientos") {
      const worksheet = workbook.addWorksheet("Vencimientos");
      worksheet.columns = [
        { header: "Fecha Vto.", key: "dueDate", width: 15 },
        { header: "Tipo", key: "docType", width: 15 },
        { header: "Nº Documento", key: "document", width: 20 },
        { header: "Entidad", key: "entity", width: 35 },
        { header: "Importe", key: "amount", width: 15 },
      ];
      styleHeader(worksheet, "FF8B5CF6");

      const invoices = await db
        .select({
          dueDate: invoicesTable.dueDate,
          docType: sql<string>`'COBRO'`,
          document: invoicesTable.invoiceNumber,
          entity: clientsTable.name,
          amount: invoicesTable.total,
        })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(
          inArray(invoicesTable.status, ["pendiente_cobro", "vencida"] as any),
        );

      const vendorInvoices = await db
        .select({
          dueDate: vendorInvoicesTable.dueDate,
          docType: sql<string>`'PAGO'`,
          document: vendorInvoicesTable.invoiceNumber,
          entity: suppliersTable.name,
          amount: vendorInvoicesTable.total,
        })
        .from(vendorInvoicesTable)
        .leftJoin(
          suppliersTable,
          eq(vendorInvoicesTable.supplierId, suppliersTable.id),
        )
        .where(
          inArray(vendorInvoicesTable.status, [
            "pendiente_pago",
            "vencida",
          ] as any),
        );

      const combined = [...invoices, ...vendorInvoices]
        .filter((item) => item.dueDate)
        .sort(
          (a, b) =>
            new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
        );

      combined.forEach((item) => {
        worksheet.addRow({
          dueDate: new Date(item.dueDate!).toLocaleDateString(),
          docType: item.docType,
          document: item.document,
          entity: item.entity || "Desconocido",
          amount: Number(item.amount || 0),
        });
      });
      worksheet.getColumn("amount").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 6 & 7. FACTURACIÓN POR CLIENTE / COMPRAS POR PROVEEDOR
    // ==========================================
    else if (type === "por_cliente" || type === "por_proveedor") {
      const isClient = type === "por_cliente";
      const worksheet = workbook.addWorksheet(
        isClient ? "Por Cliente" : "Por Proveedor",
      );

      worksheet.columns = [
        {
          header: isClient ? "Cliente" : "Proveedor",
          key: "entityName",
          width: 40,
        },
        { header: "Nº Facturas", key: "count", width: 15 },
        { header: "Total Facturado", key: "total", width: 20 },
      ];
      styleHeader(worksheet, isClient ? "FF3B82F6" : "FF10B981");

      if (isClient) {
        const data = await db
          .select({
            entityName: clientsTable.name,
            count: sql<number>`COUNT(${invoicesTable.id})`,
            total: sql<number>`SUM(${invoicesTable.total})`,
          })
          .from(invoicesTable)
          .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
          .where(
            companyId
              ? eq(invoicesTable.companyId, Number(companyId))
              : undefined,
          )
          .groupBy(clientsTable.name);

        data.forEach((row) =>
          worksheet.addRow({
            entityName: row.entityName,
            count: Number(row.count),
            total: Number(row.total),
          }),
        );
      } else {
        const data = await db
          .select({
            entityName: suppliersTable.name,
            count: sql<number>`COUNT(${vendorInvoicesTable.id})`,
            total: sql<number>`SUM(${vendorInvoicesTable.total})`,
          })
          .from(vendorInvoicesTable)
          .leftJoin(
            suppliersTable,
            eq(vendorInvoicesTable.supplierId, suppliersTable.id),
          )
          .where(
            companyId
              ? eq(vendorInvoicesTable.companyId, Number(companyId))
              : undefined,
          )
          .groupBy(suppliersTable.name);

        data.forEach((row) =>
          worksheet.addRow({
            entityName: row.entityName,
            count: Number(row.count),
            total: Number(row.total),
          }),
        );
      }
      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 8. FACTURACIÓN GLOBAL POR EMPRESA / MARCA
    // ==========================================
    else if (type === "global_empresa") {
      const worksheet = workbook.addWorksheet("Global por Empresa");
      worksheet.columns = [
        { header: "Empresa / Marca", key: "companyName", width: 40 },
        { header: "Nº Facturas Emitidas", key: "count", width: 25 },
        { header: "Total Facturado", key: "total", width: 25 },
      ];
      styleHeader(worksheet, "FF8B5CF6");

      const data = await db
        .select({
          companyName: companiesTable.name,
          count: sql<number>`COUNT(${invoicesTable.id})`,
          total: sql<number>`SUM(${invoicesTable.total})`,
        })
        .from(invoicesTable)
        .leftJoin(
          companiesTable,
          eq(invoicesTable.companyId, companiesTable.id),
        )
        .groupBy(companiesTable.name);

      data.forEach((row) => {
        worksheet.addRow({
          companyName: row.companyName || "Empresa Principal",
          count: Number(row.count),
          total: Number(row.total),
        });
      });
      worksheet.getColumn("total").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 9. RESUMEN MENSUAL DE INGRESOS Y GASTOS
    // ==========================================
    else if (type === "resumen_mensual") {
      const worksheet = workbook.addWorksheet("Resumen Mensual");
      worksheet.columns = [
        { header: "Mes", key: "month", width: 20 },
        { header: "Ingresos (Facturado)", key: "income", width: 25 },
        { header: "Gastos (Compras)", key: "expense", width: 25 },
        { header: "Balance Neto", key: "balance", width: 25 },
      ];
      styleHeader(worksheet, "FF0284C7");

      const invoices = await db
        .select()
        .from(invoicesTable)
        .where(
          companyId
            ? eq(invoicesTable.companyId, Number(companyId))
            : undefined,
        );
      const vendorInvoices = await db
        .select()
        .from(vendorInvoicesTable)
        .where(
          companyId
            ? eq(vendorInvoicesTable.companyId, Number(companyId))
            : undefined,
        );

      const monthlyData: Record<string, { income: number; expense: number }> =
        {};

      invoices.forEach((inv) => {
        const month = inv.issueDate
          ? String(inv.issueDate).substring(0, 7)
          : "Sin fecha";
        if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
        monthlyData[month].income += Number(inv.total || 0);
      });

      vendorInvoices.forEach((inv) => {
        const month = inv.issueDate
          ? String(inv.issueDate).substring(0, 7)
          : "Sin fecha";
        if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
        monthlyData[month].expense += Number(inv.total || 0);
      });

      Object.keys(monthlyData)
        .sort()
        .forEach((month) => {
          const inc = monthlyData[month].income;
          const exp = monthlyData[month].expense;
          worksheet.addRow({
            month: month,
            income: inc,
            expense: exp,
            balance: inc - exp,
          });
        });

      worksheet.getColumn("income").numFmt = "#,##0.00€";
      worksheet.getColumn("expense").numFmt = "#,##0.00€";
      worksheet.getColumn("balance").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 10. PREVISIÓN DE TESORERÍA (FOTO FIJA)
    // ==========================================
    else if (type === "tesoreria") {
      const worksheet = workbook.addWorksheet("Previsión Tesorería");
      worksheet.columns = [
        { header: "Concepto", key: "concept", width: 45 },
        { header: "Importe", key: "amount", width: 25 },
      ];
      styleHeader(worksheet, "FF059669");

      const banks = await db
        .select()
        .from(bankAccountsTable)
        .where(
          companyId
            ? eq(bankAccountsTable.companyId, Number(companyId))
            : undefined,
        );
      const currentBalance = banks.reduce(
        (acc, curr) => acc + Number(curr.balance || 0),
        0,
      );

      const pendingInvoices = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            companyId
              ? eq(invoicesTable.companyId, Number(companyId))
              : undefined,
            inArray(invoicesTable.status, [
              "pendiente_cobro",
              "vencida",
            ] as any),
          ),
        );
      const expectedIncome = pendingInvoices.reduce(
        (acc, curr) => acc + Number(curr.total || 0),
        0,
      );

      const pendingVendor = await db
        .select()
        .from(vendorInvoicesTable)
        .where(
          and(
            companyId
              ? eq(vendorInvoicesTable.companyId, Number(companyId))
              : undefined,
            inArray(vendorInvoicesTable.status, [
              "pendiente_pago",
              "vencida",
            ] as any),
          ),
        );
      const expectedExpense = pendingVendor.reduce(
        (acc, curr) => acc + Number(curr.total || 0),
        0,
      );

      worksheet.addRow({
        concept: "1. Saldo Actual (Bancos)",
        amount: currentBalance,
      });
      worksheet.addRow({
        concept: "2. Cobros Pendientes (Facturas Emitidas)",
        amount: expectedIncome,
      });
      worksheet.addRow({
        concept: "3. Pagos Pendientes (Compras a Proveedores)",
        amount: -expectedExpense,
      });
      worksheet.addRow({
        concept: "=> TESORERÍA NETA PREVISTA",
        amount: currentBalance + expectedIncome - expectedExpense,
      });

      worksheet.getColumn("amount").numFmt = "#,##0.00€";
      worksheet.getRow(5).font = { bold: true };
    }

    // ==========================================
    // 11. FLUJO DE CAJA FUTURO (LÍNEA DE TIEMPO)
    // ==========================================
    else if (type === "flujo_caja") {
      const worksheet = workbook.addWorksheet("Flujo de Caja Futuro");
      worksheet.columns = [
        { header: "Fecha Esperada", key: "date", width: 18 },
        { header: "Concepto", key: "concept", width: 45 },
        { header: "Entrada (+)", key: "in", width: 20 },
        { header: "Salida (-)", key: "out", width: 20 },
        { header: "Saldo Resultante", key: "balance", width: 20 },
      ];
      styleHeader(worksheet, "FFD97706");

      const banks = await db
        .select()
        .from(bankAccountsTable)
        .where(
          companyId
            ? eq(bankAccountsTable.companyId, Number(companyId))
            : undefined,
        );
      let runningBalance = banks.reduce(
        (acc, curr) => acc + Number(curr.balance || 0),
        0,
      );

      worksheet.addRow({
        date: new Date().toLocaleDateString(),
        concept: "SALDO INICIAL (Todos los bancos)",
        in: "",
        out: "",
        balance: runningBalance,
      });

      const events: Array<{
        date: Date;
        concept: string;
        in: number;
        out: number;
      }> = [];

      const pendingInvoices = await db
        .select()
        .from(invoicesTable)
        .where(
          inArray(invoicesTable.status, ["pendiente_cobro", "vencida"] as any),
        );
      pendingInvoices.forEach((inv) => {
        if (inv.dueDate)
          events.push({
            date: new Date(inv.dueDate),
            concept: `Cobro Fra. ${inv.invoiceNumber}`,
            in: Number(inv.total || 0),
            out: 0,
          });
      });

      const pendingVendor = await db
        .select()
        .from(vendorInvoicesTable)
        .where(
          inArray(vendorInvoicesTable.status, [
            "pendiente_pago",
            "vencida",
          ] as any),
        );
      pendingVendor.forEach((inv) => {
        if (inv.dueDate)
          events.push({
            date: new Date(inv.dueDate),
            concept: `Pago Fra. ${inv.invoiceNumber}`,
            in: 0,
            out: Number(inv.total || 0),
          });
      });

      const commitments = await db.select().from(recurringCommitmentsTable);
      commitments.forEach((com) => {
        if (com.nextDueDate) {
          const isIncome = com.type === "IN";
          events.push({
            date: new Date(com.nextDueDate),
            concept: `Compromiso: ${com.name}`,
            in: isIncome ? Number(com.amount || 0) : 0,
            out: !isIncome ? Number(com.amount || 0) : 0,
          });
        }
      });

      events.sort((a, b) => a.date.getTime() - b.date.getTime());

      events.forEach((ev) => {
        runningBalance += ev.in;
        runningBalance -= ev.out;
        worksheet.addRow({
          date: ev.date.toLocaleDateString(),
          concept: ev.concept,
          in: ev.in || "",
          out: ev.out || "",
          balance: runningBalance,
        });
      });

      worksheet.getColumn("in").numFmt = "#,##0.00€";
      worksheet.getColumn("out").numFmt = "#,##0.00€";
      worksheet.getColumn("balance").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 12. CONTABILIDAD: COMPROMISOS RECURRENTES
    // ==========================================
    else if (type === "compromisos") {
      const worksheet = workbook.addWorksheet("Compromisos");
      worksheet.columns = [
        { header: "Concepto", key: "name", width: 35 },
        { header: "Tipo", key: "type", width: 15 },
        { header: "Frecuencia", key: "frequency", width: 15 },
        { header: "Próx. Vencimiento", key: "nextDue", width: 20 },
        { header: "Importe", key: "amount", width: 15 },
      ];
      styleHeader(worksheet, "FFBE123C");

      const data = await db
        .select()
        .from(recurringCommitmentsTable)
        .where(
          companyId
            ? eq(recurringCommitmentsTable.companyId, Number(companyId))
            : undefined,
        );

      data.forEach((item) =>
        worksheet.addRow({
          name: item.name,
          type: item.type === "IN" ? "INGRESO" : "GASTO",
          frequency: item.frequency,
          nextDue: item.nextDueDate
            ? new Date(item.nextDueDate).toLocaleDateString()
            : "",
          amount: Number(item.amount || 0),
        }),
      );
      worksheet.getColumn("amount").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 13. CONTABILIDAD: ESTADO DE SALDOS BANCARIOS
    // ==========================================
    else if (type === "saldos_cuenta") {
      const worksheet = workbook.addWorksheet("Saldos Bancarios");
      worksheet.columns = [
        { header: "Banco", key: "bankName", width: 25 },
        { header: "Nombre Cuenta", key: "accountName", width: 30 },
        { header: "IBAN", key: "accountNumber", width: 35 },
        { header: "Saldo Actual", key: "balance", width: 20 },
      ];
      styleHeader(worksheet, "FF0F766E");

      const data = await db
        .select()
        .from(bankAccountsTable)
        .where(
          companyId
            ? eq(bankAccountsTable.companyId, Number(companyId))
            : undefined,
        );

      data.forEach((acc) =>
        worksheet.addRow({
          bankName: acc.bankName || "N/A",
          accountName: acc.name,
          accountNumber: acc.accountNumber || "N/A",
          balance: Number(acc.balance || 0),
        }),
      );
      worksheet.getColumn("balance").numFmt = "#,##0.00€";
    }

    // ==========================================
    // 14. CUADRO CONSOLIDADO POR EMPRESA
    // ==========================================
    else if (type === "consolidado") {
      const worksheet = workbook.addWorksheet("Consolidado Empresas");
      worksheet.columns = [
        { header: "Empresa / Marca", key: "company", width: 35 },
        { header: "Liquidez (Cuentas)", key: "banks", width: 25 },
        { header: "Pendiente de Cobro", key: "receivables", width: 25 },
        { header: "Pendiente de Pago", key: "payables", width: 25 },
        { header: "Posición Neta Global", key: "net", width: 25 },
      ];
      styleHeader(worksheet, "FF4338CA");

      const allCompanies = await db.select().from(companiesTable);
      const banks = await db.select().from(bankAccountsTable);
      const invs = await db
        .select()
        .from(invoicesTable)
        .where(
          inArray(invoicesTable.status, ["pendiente_cobro", "vencida"] as any),
        );
      const vendors = await db
        .select()
        .from(vendorInvoicesTable)
        .where(
          inArray(vendorInvoicesTable.status, [
            "pendiente_pago",
            "vencida",
          ] as any),
        );

      const compMap: Record<
        number,
        { name: string; b: number; r: number; p: number }
      > = {};

      allCompanies.forEach((c) => {
        compMap[c.id] = { name: c.name, b: 0, r: 0, p: 0 };
      });

      banks.forEach((b) => {
        if (b.companyId && compMap[b.companyId])
          compMap[b.companyId].b += Number(b.balance || 0);
      });
      invs.forEach((i) => {
        if (i.companyId && compMap[i.companyId])
          compMap[i.companyId].r += Number(i.total || 0);
      });
      vendors.forEach((v) => {
        if (v.companyId && compMap[v.companyId])
          compMap[v.companyId].p += Number(v.total || 0);
      });

      Object.values(compMap).forEach((data) => {
        worksheet.addRow({
          company: data.name,
          banks: data.b,
          receivables: data.r,
          payables: data.p,
          net: data.b + data.r - data.p,
        });
      });

      worksheet.getColumn("banks").numFmt = "#,##0.00€";
      worksheet.getColumn("receivables").numFmt = "#,##0.00€";
      worksheet.getColumn("payables").numFmt = "#,##0.00€";
      worksheet.getColumn("net").numFmt = "#,##0.00€";
    }

    const fileName = `Exportacion_${type}_${new Date().toISOString().split("T")[0]}.xlsx`;
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
