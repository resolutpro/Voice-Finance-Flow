import { Router, type IRouter } from "express";
import { db, clientsTable, suppliersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function parseAmount(text: string): number | null {
  const patterns = [
    /(\d+[\.,]\d+)\s*(?:euros?|€)/i,
    /(\d+)\s*(?:euros?|€)/i,
    /por\s+(\d+[\.,]\d+)/i,
    /por\s+(\d+)/i,
    /de\s+(\d+[\.,]\d+)\s*(?:euros?|€)/i,
    /de\s+(\d+)\s*(?:euros?|€)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(",", "."));
    }
  }
  return null;
}

function parseDate(text: string): string | null {
  const today = new Date();
  if (/hoy/i.test(text)) return today.toISOString().split("T")[0];
  if (/mañana/i.test(text)) {
    today.setDate(today.getDate() + 1);
    return today.toISOString().split("T")[0];
  }
  if (/lunes/i.test(text)) return getNextDayOfWeek(1);
  if (/martes/i.test(text)) return getNextDayOfWeek(2);
  if (/miércoles|miercoles/i.test(text)) return getNextDayOfWeek(3);
  if (/jueves/i.test(text)) return getNextDayOfWeek(4);
  if (/viernes/i.test(text)) return getNextDayOfWeek(5);
  if (/sábado|sabado/i.test(text)) return getNextDayOfWeek(6);
  if (/domingo/i.test(text)) return getNextDayOfWeek(0);
  return null;
}

function getNextDayOfWeek(day: number): string {
  const today = new Date();
  const diff = (day - today.getDay() + 7) % 7 || 7;
  today.setDate(today.getDate() + diff);
  return today.toISOString().split("T")[0];
}

function extractConcept(text: string): string | null {
  const patterns = [
    /(?:concepto|por concepto de|con concepto)\s+(.+?)(?:\s+(?:por|de|para|más|mas|€|euros?)|\s*$)/i,
    /(?:concepto|por concepto de|con concepto)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[1].trim();
  }
  return null;
}

async function findClientByName(name: string, companyId?: number) {
  const clients = companyId
    ? await db.select().from(clientsTable).where(eq(clientsTable.companyId, companyId))
    : await db.select().from(clientsTable);
  const lower = name.toLowerCase();
  return clients.find(c => c.name.toLowerCase().includes(lower));
}

async function findSupplierByName(name: string, companyId?: number) {
  const suppliers = companyId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId))
    : await db.select().from(suppliersTable);
  const lower = name.toLowerCase();
  return suppliers.find(s => s.name.toLowerCase().includes(lower));
}

router.post("/voice/parse", async (req, res): Promise<void> => {
  const { text, companyId } = req.body;
  const lowerText = text.toLowerCase();

  if (/crear\s+factura|nueva\s+factura|factura\s+para/i.test(lowerText)) {
    const amount = parseAmount(text);
    const hasIva = /más\s+iva|mas\s+iva|\+\s*iva|con\s+iva/i.test(lowerText);
    const concept = extractConcept(text);

    const clientMatch = lowerText.match(/(?:para|cliente)\s+([a-záéíóúñü\s]+?)(?:\s+(?:por|de|con|más|mas|€|euros?)|\s*$)/i);
    let clientId: number | null = null;
    let clientName: string | null = null;
    if (clientMatch) {
      const client = await findClientByName(clientMatch[1].trim(), companyId);
      if (client) { clientId = client.id; clientName = client.name; }
      else { clientName = clientMatch[1].trim(); }
    }

    res.json({
      intent: "create_invoice",
      confidence: amount ? 0.9 : 0.6,
      entities: { clientId, clientName, amount, hasIva, concept },
      preview: {
        type: "invoice",
        clientId,
        clientName,
        items: concept ? [{ description: concept, quantity: "1", unitPrice: amount?.toString() || "" }] : [],
        taxRate: hasIva ? "21" : "0",
        issueDate: new Date().toISOString().split("T")[0],
      },
      message: `Crear factura${clientName ? ` para ${clientName}` : ""}${amount ? ` por ${amount}€` : ""}${hasIva ? " + IVA" : ""}${concept ? ` - ${concept}` : ""}`,
    });
    return;
  }

  if (/(?:añadir|crear|registrar|nuevo)\s+gasto|gasto\s+de/i.test(lowerText)) {
    const amount = parseAmount(text);
    const descMatch = lowerText.match(/gasto\s+(?:de\s+)?(?:\d+[\.,]?\d*\s*(?:euros?|€)\s+)?(?:de\s+)?(.+?)(?:\s+(?:para|de|por)\s+|$)/i);
    const description = descMatch ? descMatch[1].trim() : extractConcept(text);

    const companyMatch = lowerText.match(/(?:para|empresa)\s+([a-záéíóúñü\s]+?)$/i);

    res.json({
      intent: "create_expense",
      confidence: amount ? 0.85 : 0.6,
      entities: { amount, description, companyName: companyMatch?.[1]?.trim() },
      preview: {
        type: "expense",
        description: description || "",
        amount: amount?.toString() || "",
        taxRate: "21",
        expenseDate: new Date().toISOString().split("T")[0],
      },
      message: `Registrar gasto${description ? `: ${description}` : ""}${amount ? ` por ${amount}€` : ""}`,
    });
    return;
  }

  if (/crear\s+tarea|nueva\s+tarea|tarea:/i.test(lowerText)) {
    const titleMatch = text.match(/(?:tarea[:\s]+)(.+?)(?:\s+(?:el|para el|antes del)\s+|$)/i);
    const title = titleMatch ? titleMatch[1].trim() : text.replace(/crear\s+tarea\s*/i, "").trim();
    const dueDate = parseDate(text);

    res.json({
      intent: "create_task",
      confidence: 0.85,
      entities: { title, dueDate },
      preview: {
        type: "task",
        title,
        dueDate,
        status: "pending",
        priority: "normal",
      },
      message: `Crear tarea: ${title}${dueDate ? ` para el ${dueDate}` : ""}`,
    });
    return;
  }

  if (/registrar\s+cobro|cobro\s+de\s+factura|cobrar\s+factura/i.test(lowerText)) {
    const invoiceMatch = text.match(/factura\s+([\w-]+)/i);
    const amount = parseAmount(text);

    res.json({
      intent: "register_payment",
      confidence: invoiceMatch ? 0.85 : 0.5,
      entities: { invoiceNumber: invoiceMatch?.[1], amount },
      preview: {
        type: "payment",
        invoiceNumber: invoiceMatch?.[1] || "",
        amount: amount?.toString() || "",
      },
      message: `Registrar cobro${invoiceMatch ? ` de factura ${invoiceMatch[1]}` : ""}${amount ? ` por ${amount}€` : ""}`,
    });
    return;
  }

  if (/(?:mostrar|ver|consultar)\s+(?:próximos\s+)?pagos|pagos\s+(?:de\s+)?(?:la\s+)?semana/i.test(lowerText)) {
    res.json({
      intent: "show_payments",
      confidence: 0.8,
      entities: {},
      preview: { type: "navigation", path: "/treasury" },
      message: "Mostrar próximos pagos",
    });
    return;
  }

  if (/(?:previsión|prevision)\s+(?:de\s+)?caja|cómo\s+está\s+la\s+caja/i.test(lowerText)) {
    res.json({
      intent: "show_forecast",
      confidence: 0.8,
      entities: {},
      preview: { type: "navigation", path: "/forecast" },
      message: "Ver previsión de caja",
    });
    return;
  }

  res.json({
    intent: "unknown",
    confidence: 0.0,
    entities: {},
    message: `No he podido interpretar: "${text}"`,
  });
});

export default router;
