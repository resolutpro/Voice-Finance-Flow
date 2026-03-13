import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, payablesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/payables", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  const conditions = [];
  if (companyId) conditions.push(eq(payablesTable.companyId, companyId));
  if (status) conditions.push(eq(payablesTable.status, status));

  const result = await db.select().from(payablesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(result);
});

router.post("/payables", async (req, res): Promise<void> => {
  const { companyId, supplierId, vendorInvoiceId, description, amount, paidAmount, dueDate, status } = req.body;
  if (!companyId || !description) {
    res.status(400).json({ error: "companyId and description are required" });
    return;
  }
  const [payable] = await db.insert(payablesTable).values({
    companyId,
    supplierId: supplierId ?? null,
    vendorInvoiceId: vendorInvoiceId ?? null,
    description,
    amount: amount || "0.00",
    paidAmount: paidAmount || "0.00",
    dueDate: dueDate ?? null,
    status: status || "pending",
  }).returning();
  res.status(201).json(payable);
});

export default router;
