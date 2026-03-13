import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, expensesTable, suppliersTable, categoriesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/expenses", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(companyId ? eq(expensesTable.companyId, companyId) : undefined)
    .orderBy(desc(expensesTable.expenseDate));

  const result = await Promise.all(expenses.map(async (exp) => {
    let supplierName: string | null = null;
    if (exp.supplierId) {
      const [supplier] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, exp.supplierId));
      supplierName = supplier?.name ?? null;
    }
    let categoryName: string | null = null;
    if (exp.categoryId) {
      const [cat] = await db.select({ name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, exp.categoryId));
      categoryName = cat?.name ?? null;
    }
    return { ...exp, supplierName, categoryName };
  }));

  res.json(result);
});

router.post("/expenses", async (req, res): Promise<void> => {
  const data = req.body;
  const amount = parseFloat(data.amount || "0");
  const taxRate = parseFloat(data.taxRate || "21");
  const taxAmount = amount * (taxRate / 100);
  const total = amount + taxAmount;

  const [expense] = await db.insert(expensesTable).values({
    ...data,
    amount: amount.toString(),
    taxRate: taxRate.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
    status: data.status || "pending",
  }).returning();

  res.status(201).json({ ...expense, supplierName: null, categoryName: null });
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const data = req.body;

  if (data.amount) {
    const amount = parseFloat(data.amount);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = amount * (taxRate / 100);
    data.taxAmount = taxAmount.toString();
    data.total = (amount + taxAmount).toString();
  }

  const [expense] = await db.update(expensesTable).set(data).where(eq(expensesTable.id, id)).returning();
  if (!expense) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...expense, supplierName: null, categoryName: null });
});

export default router;
