// artifacts/api-server/src/routes/invoice-pdf.ts
import { Router } from "express";
import { db } from "../../../../lib/db/src";
import { invoicesTable } from "../../../../lib/db/src/schema/invoices";
import { companiesTable } from "../../../../lib/db/src/schema/companies";
import { clientsTable } from "../../../../lib/db/src/schema/clients";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);

    // 1. Obtener los datos completos de la factura, empresa y cliente
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId))
      .limit(1);

    if (!invoice) return res.status(404).send("Factura no encontrada");

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, invoice.companyId))
      .limit(1);

    let client = null;
    if (invoice.clientId) {
      const [foundClient] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, invoice.clientId))
        .limit(1);
      client = foundClient;
    }

    // 2. Generar la plantilla HTML optimizada para impresión (A4)
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Factura ${invoice.invoiceNumber}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; background: #f3f4f6; -webkit-print-color-adjust: exact; }
        .a4-container { width: 210mm; min-height: 297mm; padding: 20mm; margin: 10mm auto; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        @media print {
          body { background: white; }
          .a4-container { margin: 0; box-shadow: none; width: 100%; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body class="text-gray-800 font-sans">

      <div class="text-center py-4 no-print bg-zinc-800 text-white flex justify-between px-10 items-center">
        <p>Vista previa de factura</p>
        <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-semibold text-sm">🖨️ Imprimir / Guardar como PDF</button>
      </div>

      <div class="a4-container flex flex-col">
        <div class="flex justify-between items-start border-b pb-8 mb-8 border-gray-200">
          <div>
            ${company?.logo ? `<img src="${company.logo}" alt="Logo" class="h-16 mb-4 object-contain" />` : `<h2 class="text-2xl font-bold text-gray-900">${company?.name || "Mi Empresa"}</h2>`}
            <p class="text-sm text-gray-500 mt-1">${company?.address || ""}</p>
            <p class="text-sm text-gray-500">${company?.city || ""}, ${company?.province || ""} ${company?.postalCode || ""}</p>
            <p class="text-sm text-gray-500">NIF/CIF: ${company?.taxId || ""}</p>
          </div>
          <div class="text-right">
            <h1 class="text-4xl font-light text-gray-300 uppercase tracking-widest mb-4">Factura</h1>
            <p class="font-bold text-gray-800 text-lg">${invoice.invoiceNumber}</p>
            <p class="text-sm text-gray-500 mt-1">Fecha Emisión: <span class="text-gray-800">${new Date(invoice.issueDate).toLocaleDateString()}</span></p>
            ${invoice.dueDate ? `<p class="text-sm text-gray-500">Fecha Vencimiento: <span class="text-gray-800">${new Date(invoice.dueDate).toLocaleDateString()}</span></p>` : ""}
          </div>
        </div>

        <div class="mb-8">
          <p class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Facturar a:</p>
          <p class="text-lg font-bold text-gray-800">${client?.name || "Cliente sin registrar"}</p>
          <p class="text-sm text-gray-600 mt-1">${client?.address || ""}</p>
          <p class="text-sm text-gray-600">${client?.city || ""} ${client?.postalCode || ""}</p>
          <p class="text-sm text-gray-600">NIF/CIF: ${client?.taxId || "-"}</p>
        </div>

        <table class="w-full text-left border-collapse mb-8">
          <thead>
            <tr class="border-b-2 border-gray-800 text-sm uppercase text-gray-600">
              <th class="py-3 font-semibold">Descripción</th>
              <th class="py-3 font-semibold text-right">Cantidad</th>
              <th class="py-3 font-semibold text-right">Precio Unitario</th>
              <th class="py-3 font-semibold text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-gray-100">
              <td class="py-4 text-gray-800">${invoice.concept || "Servicios facturados"}</td>
              <td class="py-4 text-right text-gray-600">1</td>
              <td class="py-4 text-right text-gray-600">${Number(invoice.subtotal).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</td>
              <td class="py-4 text-right text-gray-800 font-medium">${Number(invoice.subtotal).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</td>
            </tr>
          </tbody>
        </table>

        <div class="flex justify-end mb-12">
          <div class="w-1/2">
            <div class="flex justify-between py-2 text-gray-600">
              <span>Base Imponible</span>
              <span>${Number(invoice.subtotal).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span>
            </div>
            <div class="flex justify-between py-2 text-gray-600 border-b border-gray-200">
              <span>Impuestos (${invoice.taxRate}%)</span>
              <span>${Number(invoice.taxAmount).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span>
            </div>
            <div class="flex justify-between py-3 text-2xl font-bold text-gray-900">
              <span>Total a Pagar</span>
              <span>${Number(invoice.total).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span>
            </div>
          </div>
        </div>

        <div class="mt-auto"></div> <div class="border-t pt-6 border-gray-200 text-sm text-gray-500 flex justify-between items-center">
          <div>
            ${company?.bankAccountNumber ? `<p class="font-semibold text-gray-800">Cuenta Bancaria para el pago (IBAN):</p><p class="tracking-widest">${company.bankAccountNumber}</p>` : ""}
          </div>
          <div class="text-right">
            <p>Gracias por su confianza.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    res.send(htmlTemplate);
  } catch (error) {
    console.error("Error generando PDF:", error);
    res.status(500).send("Error interno generando la factura.");
  }
});

export default router;
