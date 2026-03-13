import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, receivablesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/receivables", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  const conditions = [];
  if (companyId) conditions.push(eq(receivablesTable.companyId, companyId));
  if (status) conditions.push(eq(receivablesTable.status, status));

  const result = await db.select().from(receivablesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(result);
});

router.post("/receivables", async (req, res): Promise<void> => {
  const { companyId, clientId, invoiceId, description, amount, paidAmount, dueDate, status } = req.body;
  if (!companyId || !description) {
    res.status(400).json({ error: "companyId and description are required" });
    return;
  }
  const [receivable] = await db.insert(receivablesTable).values({
    companyId,
    clientId: clientId ?? null,
    invoiceId: invoiceId ?? null,
    description,
    amount: amount || "0.00",
    paidAmount: paidAmount || "0.00",
    dueDate: dueDate ?? null,
    status: status || "pending",
  }).returning();
  res.status(201).json(receivable);
});

export default router;
