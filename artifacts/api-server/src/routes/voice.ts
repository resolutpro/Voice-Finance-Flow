import { Router, type IRouter } from "express";
import { db, clientsTable, suppliersTable, invoicesTable } from "@workspace/db";
import { ParseVoiceCommandBody } from "@workspace/api-zod";
import { ilike, and, eq } from "drizzle-orm";

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
  const dayMap: Record<string, number> = {
    lunes: 1,
    martes: 2,
    miércoles: 3,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sábado: 6,
    sabado: 6,
    domingo: 0,
  };
  for (const [name, day] of Object.entries(dayMap)) {
    if (new RegExp(name, "i").test(text)) {
      return getNextDayOfWeek(day);
    }
  }
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
    /(?:concepto|por concepto de|con concepto|por)\s+(.+?)(?:\s+(?:por|de|para|más|mas|€|euros?)|\s*$)/i,
    /(?:concepto|por concepto de|con concepto|por)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[1].trim();
  }
  return null;
}

async function findClientByName(name: string, companyId?: number) {
  const clients = companyId
    ? await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.companyId, companyId))
    : await db.select().from(clientsTable);
  const lower = name.toLowerCase();
  return clients.find((c) => c.name.toLowerCase().includes(lower));
}

router.post("/voice/parse", async (req, res): Promise<void> => {
  const parsed = ParseVoiceCommandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, companyId } = parsed.data;
  const lowerText = text.toLowerCase();
  const activeCompanyId = companyId || 1; // Fallback por seguridad

  // === 1. INTENCIÓN: CREAR FACTURA ===
  if (
    /crear\s+factura|nueva\s+factura|factura\s+para|emitir\s+factura|emite\s+una\s+factura/i.test(
      lowerText,
    )
  ) {
    const amount = parseAmount(text);
    const hasIva = /más\s+iva|mas\s+iva|\+\s*iva|con\s+iva/i.test(lowerText);
    const concept = extractConcept(text) || "Servicios generales";

    // Extraer el cliente (ej: "para Juan", "a Acme Corp")
    const clientMatch = lowerText.match(
      /(?:para|a|cliente)\s+([a-záéíóúñü\s]+?)(?:\s+(?:por|de|con|más|mas|€|euros?)|\s*$)/i,
    );
    let clientId: number | null = null;
    let clientName: string = "Cliente por defecto";

    if (clientMatch) {
      clientName = clientMatch[1].trim();
      const client = await findClientByName(clientName, activeCompanyId);

      if (client) {
        clientId = client.id;
        clientName = client.name;
      } else {
        // LÓGICA MÁGICA: Crear cliente si no existe
        const [newClient] = await db
          .insert(clientsTable)
          .values({
            companyId: activeCompanyId,
            name: clientName,
            taxId: "PENDIENTE",
            address: "Pendiente",
            city: "Pendiente",
            postalCode: "00000",
          })
          .returning();
        clientId = newClient.id;
      }
    }

    // Calcular montos
    const numAmount = amount || 0;
    const taxRate = hasIva ? 21 : 0;
    const taxAmount = (numAmount * taxRate) / 100;
    const total = numAmount + taxAmount;

    // Crear la factura como BORRADOR en la BD
    const invoiceNumber = `V-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
    const [newInvoice] = await db
      .insert(invoicesTable)
      .values({
        companyId: activeCompanyId,
        clientId,
        invoiceNumber,
        status: "borrador",
        issueDate: new Date().toISOString().split("T")[0],
        concept,
        subtotal: numAmount.toString(),
        taxRate: taxRate.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
      })
      .returning();

    res.json({
      intent: "CREATE_INVOICE", // Actualizado para coincidir con tu sistema
      confidence: amount ? 0.9 : 0.6,
      entities: { clientId, clientName, amount, hasIva, concept },
      // Texto de respuesta oral para que el asistente lo lea
      responseText: `He preparado la factura para ${clientName} por ${numAmount} euros${hasIva ? " más IVA" : ""}. Ha quedado guardada como borrador en tu panel.`,
      preview: {
        type: "invoice",
        clientId,
        clientName,
        companyId: activeCompanyId,
        items: concept
          ? [
              {
                description: concept,
                quantity: "1",
                unitPrice: amount?.toString() || "",
              },
            ]
          : [],
        taxRate: taxRate.toString(),
        issueDate: new Date().toISOString().split("T")[0],
      },
      message: `Crear factura${clientName ? ` para ${clientName}` : ""}${amount ? ` por ${amount}€` : ""}${hasIva ? " + IVA" : ""}${concept ? ` - ${concept}` : ""}`,
    });
    return;
  }

  // === 2. INTENCIÓN: CREAR GASTO ===
  if (/(?:añadir|crear|registrar|nuevo)\s+gasto|gasto\s+de/i.test(lowerText)) {
    const amount = parseAmount(text);
    const descMatch = lowerText.match(
      /gasto\s+(?:de\s+)?(?:\d+[\.,]?\d*\s*(?:euros?|€)\s+)?(?:de\s+)?(.+?)(?:\s+(?:para|de|por)\s+|$)/i,
    );
    const description = descMatch ? descMatch[1].trim() : extractConcept(text);

    res.json({
      intent: "create_expense",
      confidence: amount ? 0.85 : 0.6,
      entities: { amount, description, companyId },
      preview: {
        type: "expense",
        companyId,
        description: description || "",
        amount: amount?.toString() || "",
        taxRate: "21",
        expenseDate: new Date().toISOString().split("T")[0],
      },
      message: `Registrar gasto${description ? `: ${description}` : ""}${amount ? ` por ${amount}€` : ""}`,
    });
    return;
  }

  // === 3. INTENCIÓN: CREAR TAREA ===
  if (/crear\s+tarea|nueva\s+tarea|tarea:/i.test(lowerText)) {
    const titleMatch = text.match(
      /(?:tarea[:\s]+)(.+?)(?:\s+(?:el|para el|antes del)\s+|$)/i,
    );
    const title = titleMatch
      ? titleMatch[1].trim()
      : text.replace(/crear\s+tarea\s*/i, "").trim();
    const dueDate = parseDate(text);

    res.json({
      intent: "create_task",
      confidence: 0.85,
      entities: { title, dueDate, companyId },
      preview: {
        type: "task",
        companyId,
        title,
        dueDate,
        status: "pending",
        priority: "normal",
      },
      message: `Crear tarea: ${title}${dueDate ? ` para el ${dueDate}` : ""}`,
    });
    return;
  }

  // === 4. INTENCIÓN: REGISTRAR PAGO ===
  if (
    /registrar\s+cobro|cobro\s+de\s+factura|cobrar\s+factura/i.test(lowerText)
  ) {
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

  // === 5. NAVEGACIÓN: PAGOS ===
  if (
    /(?:mostrar|ver|consultar)\s+(?:próximos\s+)?pagos|pagos\s+(?:de\s+)?(?:la\s+)?semana/i.test(
      lowerText,
    )
  ) {
    res.json({
      intent: "show_payments",
      confidence: 0.8,
      entities: {},
      preview: { type: "navigation", path: "/treasury" },
      message: "Mostrar próximos pagos",
    });
    return;
  }

  // === 6. NAVEGACIÓN: PREVISIÓN CAJA ===
  if (
    /(?:previsión|prevision)\s+(?:de\s+)?caja|cómo\s+está\s+la\s+caja/i.test(
      lowerText,
    )
  ) {
    res.json({
      intent: "show_forecast",
      confidence: 0.8,
      entities: {},
      preview: { type: "navigation", path: "/forecast" },
      message: "Ver previsión de caja",
    });
    return;
  }

  // === DESCONOCIDO ===
  res.json({
    intent: "unknown",
    confidence: 0.0,
    entities: {},
    message: `No he podido interpretar: "${text}"`,
  });
});

export default router;
