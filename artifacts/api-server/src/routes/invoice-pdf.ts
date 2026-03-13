import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db, invoicesTable, invoiceItemsTable, clientsTable, companiesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/invoices/:id/pdf", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));

  let clientName = "";
  let clientTaxId = "";
  let clientAddress = "";
  if (invoice.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, invoice.clientId));
    if (client) {
      clientName = client.name;
      clientTaxId = client.taxId || "";
      clientAddress = client.address || "";
    }
  }

  let companyName = "";
  let companyTaxId = "";
  let companyAddress = "";
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, invoice.companyId));
  if (company) {
    companyName = company.name;
    companyTaxId = company.taxId || "";
    companyAddress = company.address || "";
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="factura-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  doc.fontSize(24).font("Helvetica-Bold").text("FACTURA", 50, 50);
  doc.fontSize(12).font("Helvetica").text(`Nº: ${invoice.invoiceNumber}`, 400, 50);
  doc.text(`Fecha: ${invoice.issueDate}`, 400, 65);
  if (invoice.dueDate) doc.text(`Vencimiento: ${invoice.dueDate}`, 400, 80);

  doc.moveDown(2);

  const yEmitter = 120;
  doc.fontSize(10).font("Helvetica-Bold").text("EMISOR", 50, yEmitter);
  doc.font("Helvetica").text(companyName, 50, yEmitter + 15);
  if (companyTaxId) doc.text(`CIF/NIF: ${companyTaxId}`, 50, yEmitter + 30);
  if (companyAddress) doc.text(companyAddress, 50, yEmitter + 45);

  doc.font("Helvetica-Bold").text("CLIENTE", 320, yEmitter);
  doc.font("Helvetica").text(clientName, 320, yEmitter + 15);
  if (clientTaxId) doc.text(`CIF/NIF: ${clientTaxId}`, 320, yEmitter + 30);
  if (clientAddress) doc.text(clientAddress, 320, yEmitter + 45);

  const tableTop = 210;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("CONCEPTO", 50, tableTop);
  doc.text("CANTIDAD", 280, tableTop, { width: 60, align: "right" });
  doc.text("PRECIO", 350, tableTop, { width: 70, align: "right" });
  doc.text("IVA %", 430, tableTop, { width: 40, align: "right" });
  doc.text("TOTAL", 480, tableTop, { width: 70, align: "right" });

  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  const subtotal = parseFloat(invoice.subtotal || "0");
  const taxAmount = parseFloat(invoice.taxAmount || "0");
  const total = parseFloat(invoice.total);
  const invoiceTaxRate = subtotal > 0 ? (taxAmount / subtotal * 100) : 21;

  let yRow = tableTop + 22;
  doc.font("Helvetica").fontSize(9);
  for (const item of items) {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);
    const lineTotal = qty * price * (1 + invoiceTaxRate / 100);
    doc.text(item.description, 50, yRow, { width: 220 });
    doc.text(qty.toString(), 280, yRow, { width: 60, align: "right" });
    doc.text(price.toFixed(2) + " €", 350, yRow, { width: 70, align: "right" });
    doc.text(invoiceTaxRate.toFixed(0) + "%", 430, yRow, { width: 40, align: "right" });
    doc.text(lineTotal.toFixed(2) + " €", 480, yRow, { width: 70, align: "right" });
    yRow += 18;
  }

  doc.moveTo(50, yRow + 5).lineTo(550, yRow + 5).stroke();

  yRow += 15;
  doc.font("Helvetica").fontSize(10);
  doc.text("Base Imponible:", 380, yRow);
  doc.text(subtotal.toFixed(2) + " €", 480, yRow, { width: 70, align: "right" });
  yRow += 18;
  doc.text("IVA:", 380, yRow);
  doc.text(taxAmount.toFixed(2) + " €", 480, yRow, { width: 70, align: "right" });
  yRow += 18;
  doc.font("Helvetica-Bold").fontSize(12);
  doc.text("TOTAL:", 380, yRow);
  doc.text(total.toFixed(2) + " €", 480, yRow, { width: 70, align: "right" });

  const statusLabel = invoice.status === "paid" ? "PAGADA" :
    invoice.status === "overdue" ? "VENCIDA" :
    invoice.status === "draft" ? "BORRADOR" :
    invoice.status === "issued" ? "EMITIDA" : invoice.status.toUpperCase();

  yRow += 35;
  doc.font("Helvetica-Bold").fontSize(11).text(`Estado: ${statusLabel}`, 50, yRow);

  doc.end();
});

export default router;
