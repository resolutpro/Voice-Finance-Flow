// artifacts/api-server/src/routes/invoice-pdf.ts
import { Router } from "express";
import { db } from "../../../../lib/db/src";
import {
  invoicesTable,
  invoiceItemsTable,
} from "../../../../lib/db/src/schema/invoices";
import { companiesTable } from "../../../../lib/db/src/schema/companies";
import { clientsTable } from "../../../../lib/db/src/schema/clients";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/invoice-pdf/:id", async (req, res) => {
  try {
    const idParam = req.params.id;

    if (
      !idParam ||
      idParam === "undefined" ||
      idParam === "NaN" ||
      idParam === "null"
    ) {
      return res.status(400).send("ID de factura no válido");
    }

    const invoiceId = parseInt(idParam, 10);
    if (Number.isNaN(invoiceId)) {
      return res.status(400).send("El ID de la factura debe ser numérico");
    }

    // 1. Obtener Factura
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId))
      .limit(1);

    if (!invoice) return res.status(404).send("Factura no encontrada");

    // 2. Obtener Líneas (Items)
    const items = await db
      .select()
      .from(invoiceItemsTable)
      .where(eq(invoiceItemsTable.invoiceId, invoiceId));

    // 3. Obtener Empresa
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, invoice.companyId))
      .limit(1);

    // 4. Obtener Cliente
    let client = null;
    if (invoice.clientId) {
      const [foundClient] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, invoice.clientId))
        .limit(1);
      client = foundClient;
    }

    // Generar Plantilla HTML A4
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
          .a4-container { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
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
            ${company?.logo ? `<img src="${company.logo}" alt="Logo" class="h-16 mb-2 object-contain" />` : ``}
            <h2 class="text-2xl font-bold text-gray-900">${company?.name || "Mi Empresa"}</h2>
            <p class="text-sm text-gray-500 mt-1">${company?.address || "Dirección no configurada"}</p>
            <p class="text-sm text-gray-500">${company?.city || ""}, ${company?.province || ""} ${company?.postalCode || ""}</p>
            <p class="text-sm text-gray-500 mt-1"><strong>CIF/NIF:</strong> ${company?.taxId || ""}</p>
          </div>
          <div class="text-right">
            <h1 class="text-4xl font-light text-gray-300 uppercase tracking-widest mb-4">Factura</h1>
            <p class="font-bold text-gray-800 text-lg">Nº: ${invoice.invoiceNumber}</p>
            <p class="text-sm text-gray-500 mt-1">Fecha Emisión: <span class="text-gray-800">${new Date(invoice.issueDate).toLocaleDateString("es-ES")}</span></p>
            ${invoice.dueDate ? `<p class="text-sm text-gray-500 mt-1">Fecha Vencimiento: <span class="text-gray-800">${new Date(invoice.dueDate).toLocaleDateString("es-ES")}</span></p>` : ""}
          </div>
        </div>

        <div class="mb-8">
          <p class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Facturar a:</p>
          <h3 class="text-lg font-bold text-gray-900">${client?.name || "Cliente Final"}</h3>
          <p class="text-sm text-gray-600">${client?.address || ""}</p>
          <p class="text-sm text-gray-600">${client?.city || ""}, ${client?.province || ""} ${client?.postalCode || ""}</p>
          <p class="text-sm text-gray-600 mt-1"><strong>CIF/NIF:</strong> ${client?.taxId || "---"}</p>
        </div>

        <table class="w-full text-left border-collapse mb-8">
          <thead>
            <tr class="bg-gray-100 text-gray-600 text-sm uppercase">
              <th class="p-3 rounded-tl border-b">Descripción</th>
              <th class="p-3 border-b text-right">Precio Ud.</th>
              <th class="p-3 border-b text-right">Cant.</th>
              <th class="p-3 rounded-tr border-b text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              items.length > 0
                ? items
                    .map(
                      (item) => `
            <tr class="border-b border-gray-100">
              <td class="p-3 text-gray-800">${item.description}</td>
              <td class="p-3 text-right text-gray-600">${parseFloat(item.unitPrice).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
              <td class="p-3 text-right text-gray-600">${parseFloat(item.quantity).toString()}</td>
              <td class="p-3 text-right text-gray-800 font-medium">${(parseFloat(item.unitPrice) * parseFloat(item.quantity)).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
            </tr>
            `,
                    )
                    .join("")
                : `
            <tr><td colspan="4" class="p-3 text-center text-gray-500 italic">No hay conceptos registrados.</td></tr>
            `
            }
          </tbody>

          <tfoot class="border-t-2 border-gray-900">
            <tr>
              <td colspan="2" class="p-3 border-0"></td>
              <td class="p-3 text-right text-gray-600 border-b border-gray-100 bg-gray-50/50">Base Imponible</td>
              <td class="p-3 text-right font-medium border-b border-gray-100 bg-gray-50/50">${parseFloat(invoice.subtotal).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td colspan="2" class="p-3 border-0"></td>
              <td class="p-3 text-right text-gray-600 border-b border-gray-100 bg-gray-50/50">IVA (${invoice.taxRate}%)</td>
              <td class="p-3 text-right font-medium border-b border-gray-100 bg-gray-50/50">${parseFloat(invoice.taxAmount).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td colspan="2" class="p-3 border-0"></td>
              <td class="p-3 text-right text-gray-600 border-b border-gray-200 bg-gray-50/50">Retención (0%)</td>
              <td class="p-3 text-right font-medium border-b border-gray-200 bg-gray-50/50">0,00 €</td>
            </tr>
            <tr>
              <td colspan="2" class="p-3 border-0"></td>
              <td class="p-3 text-right text-gray-900 font-bold text-lg bg-gray-50 rounded-bl">Total Factura</td>
              <td class="p-3 text-right text-gray-900 font-bold text-lg bg-gray-50 rounded-br">${parseFloat(invoice.total).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
            </tr>
          </tfoot>
        </table>

        <div class="mt-auto pt-8 border-t border-gray-200">
          <div class="text-gray-500 text-sm">
            <p class="font-bold text-gray-700 mb-2">Forma de Pago:</p>
            <p>Transferencia Bancaria</p>
            ${company?.bankAccountNumber ? `<p class="mt-1">Cuenta IBAN: <strong class="text-gray-800">${company.bankAccountNumber}</strong></p>` : `<p class="mt-1 italic">Cuenta bancaria no configurada</p>`}
          </div>
        </div>

      </div>
    </body>
    </html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlTemplate);
  } catch (error) {
    console.error("Error generando la vista previa de la factura:", error);
    res.status(500).send("Error generando el documento");
  }
});

export default router;
