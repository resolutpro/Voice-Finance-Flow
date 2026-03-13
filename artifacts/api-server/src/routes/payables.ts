import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, payablesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ListPayablesQuery = z.object({
  companyId: z.coerce.number().optional(),
  status: z.string().optional(),
});

const CreatePayableBody = z.object({
  companyId: z.number(),
  supplierId: z.number().optional().nullable(),
  vendorInvoiceId: z.number().optional().nullable(),
  description: z.string().min(1),
  amount: z.string(),
  paidAmount: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  status: z.string().optional(),
});

router.get("/payables", async (req, res): Promise<void> => {
  const query = ListPayablesQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [];
  if (query.data.companyId) conditions.push(eq(payablesTable.companyId, query.data.companyId));
  if (query.data.status) conditions.push(eq(payablesTable.status, query.data.status));

  const result = await db.select().from(payablesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(result);
});

router.post("/payables", async (req, res): Promise<void> => {
  const parsed = CreatePayableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [payable] = await db.insert(payablesTable).values({
    companyId: parsed.data.companyId,
    supplierId: parsed.data.supplierId ?? null,
    vendorInvoiceId: parsed.data.vendorInvoiceId ?? null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    paidAmount: parsed.data.paidAmount || "0.00",
    dueDate: parsed.data.dueDate ?? null,
    status: parsed.data.status || "pending",
  }).returning();
  res.status(201).json(payable);
});

export default router;
