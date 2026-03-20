import { Router, type IRouter } from "express";
import { db, clientsTable } from "@workspace/db";
import { ParseVoiceCommandBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const router: IRouter = Router();
const openai = new OpenAI();

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
  const activeCompanyId = companyId || 1;

  try {
    // 1. Obtener la lista de nombres de clientes de la empresa activa para darle contexto a la IA
    const companyClients = await db
      .select({ name: clientsTable.name })
      .from(clientsTable)
      .where(eq(clientsTable.companyId, activeCompanyId));

    const clientNamesStr = companyClients.map((c) => c.name).join(", ");

    // 2. Mejorar el Prompt para que diferencie facturas/presupuestos y conozca a tus clientes
    const systemPrompt = `
      Eres el asistente de voz de una aplicación de facturación.
      Hoy es ${new Date().toISOString().split("T")[0]}.
      Analiza la transcripción y extrae la intención y los datos relevantes.

      Clientes registrados en esta empresa: [${clientNamesStr || "Ninguno"}].
      Si el usuario menciona a un cliente, intenta emparejarlo usando EXACTAMENTE el nombre de esta lista si suena similar.

      Identifica si el usuario quiere crear una FACTURA ("invoice") o un PRESUPUESTO ("quote"). Si no lo especifica, asume "invoice".

      Responde ÚNICAMENTE con JSON válido:
      {
        "intent": "CREATE_DOCUMENT" | "CREATE_EXPENSE" | "CREATE_TASK" | "REGISTER_PAYMENT" | "SHOW_PAYMENTS" | "SHOW_FORECAST" | "UNKNOWN",
        "entities": {
          "documentType": "invoice" | "quote",
          "amount": number | null,
          "concept": string | null,
          "clientName": string | null,
          "hasIva": boolean | null,
          "date": string | null,
          "dueDate": string | null,
          "invoiceNumber": string | null
        }
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const aiResponse = JSON.parse(
      completion.choices[0].message.content || "{}",
    );
    const { intent, entities } = aiResponse;

    if (intent === "CREATE_DOCUMENT" || intent === "CREATE_INVOICE") {
      const {
        amount,
        concept,
        clientName,
        hasIva,
        date,
        dueDate,
        documentType,
      } = entities;
      const numAmount = amount || 0;
      const finalConcept = concept || "Servicios generales";
      const docType = documentType === "quote" ? "quote" : "invoice";

      let clientId: number | null = null;
      let finalClientName = clientName || "";

      // Buscamos o creamos el cliente
      if (finalClientName) {
        const client = await findClientByName(finalClientName, activeCompanyId);
        if (client) {
          clientId = client.id;
          finalClientName = client.name;
        } else {
          const [newClient] = await db
            .insert(clientsTable)
            .values({
              companyId: activeCompanyId,
              name: finalClientName,
              taxId: "PENDIENTE",
              address: "Pendiente",
              city: "Pendiente",
              province: "Pendiente",
              postalCode: "00000",
            })
            .returning();
          clientId = newClient.id;
        }
      }

      res.json({
        intent: "create_invoice", // Mantenemos esta clave para que el frontend abra el modal correcto
        confidence: 0.95,
        entities: {
          clientId,
          clientName: finalClientName,
          amount: numAmount,
          hasIva,
          concept: finalConcept,
        },
        preview: {
          type: docType, // Aquí viaja "invoice" o "quote"
          clientId,
          clientName: finalClientName,
          companyId: activeCompanyId,
          items: [
            {
              description: finalConcept,
              quantity: "1",
              unitPrice: numAmount.toString(),
            },
          ],
          taxRate: hasIva !== false ? "21" : "0", // Si dice explícitamente sin IVA es 0, si no 21
          issueDate: date || new Date().toISOString().split("T")[0],
          dueDate: dueDate || null,
        },
        message: text,
      });
      return;
    }

    if (intent === "CREATE_EXPENSE") {
      res.json({
        intent: "create_expense",
        confidence: 0.9,
        entities,
        preview: {
          type: "expense",
          companyId: activeCompanyId,
          description: entities.concept || "Gasto general",
          amount: entities.amount?.toString() || "0",
          taxRate: entities.hasIva ? "21" : "0",
          expenseDate: entities.date || new Date().toISOString().split("T")[0],
        },
        message: text,
      });
      return;
    }

    if (intent === "CREATE_TASK") {
      res.json({
        intent: "create_task",
        confidence: 0.9,
        entities,
        preview: {
          type: "task",
          companyId: activeCompanyId,
          title: entities.concept || "Nueva tarea",
          dueDate: entities.date,
          status: "pending",
          priority: "normal",
        },
        message: text,
      });
      return;
    }

    if (intent === "REGISTER_PAYMENT") {
      res.json({
        intent: "register_payment",
        confidence: 0.9,
        entities,
        preview: {
          type: "payment",
          invoiceNumber: entities.invoiceNumber || "",
          amount: entities.amount?.toString() || "",
        },
        message: text,
      });
      return;
    }

    // Navegación genérica (Show Payments, Forecast, etc)
    res.json({
      intent: intent.toLowerCase(),
      confidence: 0.9,
      entities: {},
      preview: {
        type: "navigation",
        path: intent === "SHOW_PAYMENTS" ? "/treasury" : "/forecast",
      },
      message: text,
    });
  } catch (error) {
    console.error("Error AI Parse:", error);
    res.status(500).json({ error: "Error interno procesando comando" });
  }
});

export default router;
