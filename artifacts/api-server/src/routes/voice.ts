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
    // 1. Obtener la lista de clientes (código que ya tienes)
    const companyClients = await db
      .select({ name: clientsTable.name })
      .from(clientsTable)
      .where(eq(clientsTable.companyId, activeCompanyId));

    const clientNamesStr = companyClients.map((c) => c.name).join(", ");

    // NUEVO: Obtener el catálogo de productos y sus tarifas
    const { productsTable } = await import("@workspace/db/schema");
    const companyProducts = await db
      .select({
        name: productsTable.name,
        price: productsTable.price,
        priceTiers: productsTable.priceTiers,
      })
      .from(productsTable)
      .where(eq(productsTable.companyId, activeCompanyId));

    // Formateamos el catálogo para que la IA lo entienda fácil:
    // Ejemplo: "- Tomate Frito (Base: 1.50, Variantes: Caja 12: 15.00)"
    const productsContext = companyProducts
      .map((p) => {
        const tiersStr = (p.priceTiers || [])
          .map((t: any) => `${t.name}: ${t.price}`)
          .join(", ");
        return `- ${p.name} (Base: ${p.price}${tiersStr ? `, Variantes: ${tiersStr}` : ""})`;
      })
      .join("\n");

    // 2. Prompt mejorado (Actualiza tu systemPrompt con esto)
    const systemPrompt = `
      Eres el asistente de voz de una aplicación de facturación.
      Hoy es ${new Date().toISOString().split("T")[0]}.
      Analiza la transcripción y extrae la intención y los datos relevantes.

      Clientes registrados en esta empresa: [${clientNamesStr || "Ninguno"}].
      Si el usuario menciona a un cliente, intenta emparejarlo usando EXACTAMENTE el nombre de esta lista.

      Catálogo de productos y precios:
      ${productsContext || "Ninguno"}

      INSTRUCCIÓN DE PRECIOS: Si el usuario pide añadir un producto que está en el catálogo, extrae el concepto con su nombre exacto. 
      Si menciona una variante (por ejemplo "caja de...", "pack de..."), mira si existe en las "Variantes" y asigna el precio correspondiente de esa variante al campo "amount". Si no especifica variante, asigna el precio "Base" al campo "amount". 
      Si el usuario dicta un precio explícito, prioriza el que dice el usuario.

      Identifica si el usuario quiere crear una FACTURA ("invoice") o un PRESUPUESTO ("quote"). Si no lo especifica, asume "invoice".
      IMPORTANTE: Si el usuario menciona varios conceptos, extráelos TODOS en el array "items". Si no especifica una cantidad, asume 1.

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
          "invoiceNumber": string | null,
          "items": [
            {
              "concept": "string",
              "amount": number,
              "quantity": number
            }
          ]
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
        items,
      } = entities;

      const docType = documentType === "quote" ? "quote" : "invoice";

      // 3. Procesar el array de líneas (items) dinámicamente
      let invoiceItems = [];
      let totalAmount = 0;

      if (Array.isArray(items) && items.length > 0) {
        invoiceItems = items.map((i: any) => {
          const q = i.quantity || 1;
          const p = i.amount || 0;
          totalAmount += q * p; // Vamos sumando el importe total
          return {
            description: i.concept || "Servicios",
            quantity: q.toString(),
            unitPrice: p.toString(),
          };
        });
      } else {
        // Fallback en caso de que la IA detecte solo 1 ítem a la manera antigua
        const numAmount = amount || 0;
        totalAmount = numAmount;
        invoiceItems = [
          {
            description: concept || "Servicios generales",
            quantity: "1",
            unitPrice: numAmount.toString(),
          },
        ];
      }

      let clientId: number | null = null;
      let finalClientName = clientName || "";

      // Buscamos o creamos el cliente
      // Buscamos o creamos el cliente
      if (finalClientName) {
        const client = await findClientByName(finalClientName, activeCompanyId);
        if (client) {
          clientId = client.id;
          finalClientName = client.name;
        } else {
          // Cliente nuevo: lo creamos guardando solo el nombre y dejando lo demás vacío
          const [newClient] = await db
            .insert(clientsTable)
            .values({
              companyId: activeCompanyId,
              name: finalClientName,
              taxId: "", // Vacío para que lo edite después
              address: "",
              city: "",
              province: "",
              postalCode: "",
            })
            .returning();
          clientId = newClient.id;
        }
      }

      res.json({
        intent: "create_invoice",
        confidence: 0.95,
        entities: {
          clientId,
          clientName: finalClientName,
          amount: totalAmount, // Ahora envía el sumatorio total correcto
          hasIva,
          concept:
            invoiceItems.length > 1
              ? "Varios conceptos"
              : invoiceItems[0].description,
        },
        preview: {
          type: docType,
          clientId,
          clientName: finalClientName,
          companyId: activeCompanyId,
          items: invoiceItems, // Inyectamos todas las líneas procesadas
          taxRate: hasIva !== false ? "21" : "0",
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
