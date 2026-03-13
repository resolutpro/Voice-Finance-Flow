import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, receivablesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ListReceivablesQuery = z.object({
  companyId: z.coerce.number().optional(),
  status: z.string().optional(),
});

const CreateReceivableBody = z.object({
  companyId: z.number(),
  clientId: z.number().optional().nullable(),
  invoiceId: z.number().optional().nullable(),
  description: z.string().min(1),
  amount: z.string(),
  paidAmount: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  status: z.string().optional(),
});

router.get("/receivables", async (req, res): Promise<void> => {
  const query = ListReceivablesQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [];
  if (query.data.companyId) conditions.push(eq(receivablesTable.companyId, query.data.companyId));
  if (query.data.status) conditions.push(eq(receivablesTable.status, query.data.status));

  const result = await db.select().from(receivablesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(result);
});

router.post("/receivables", async (req, res): Promise<void> => {
  const parsed = CreateReceivableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [receivable] = await db.insert(receivablesTable).values({
    companyId: parsed.data.companyId,
    clientId: parsed.data.clientId ?? null,
    invoiceId: parsed.data.invoiceId ?? null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    paidAmount: parsed.data.paidAmount || "0.00",
    dueDate: parsed.data.dueDate ?? null,
    status: parsed.data.status || "pending",
  }).returning();
  res.status(201).json(receivable);
});

export default router;
