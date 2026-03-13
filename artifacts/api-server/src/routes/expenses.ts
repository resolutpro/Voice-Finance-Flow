import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, expensesTable, suppliersTable, categoriesTable } from "@workspace/db";
import { ListExpensesQueryParams, CreateExpenseBody, UpdateExpenseParams, UpdateExpenseBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/expenses", async (req, res): Promise<void> => {
  const query = ListExpensesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(query.data.companyId ? eq(expensesTable.companyId, query.data.companyId) : undefined)
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
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const amount = parseFloat(data.amount || "0");
  const taxRate = parseFloat(data.taxRate || "21");
  const taxAmount = amount * (taxRate / 100);
  const total = amount + taxAmount;

  const [expense] = await db.insert(expensesTable).values({
    companyId: data.companyId,
    supplierId: data.supplierId ?? null,
    categoryId: data.categoryId ?? null,
    description: data.description,
    amount: amount.toString(),
    taxRate: taxRate.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
    expenseDate: data.expenseDate,
    status: data.status || "pending",
    notes: data.notes ?? null,
  }).returning();

  res.status(201).json({ ...expense, supplierName: null, categoryName: null });
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateExpenseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const data = body.data;
  const updateData: Record<string, unknown> = { ...data };

  if (data.amount) {
    const amount = parseFloat(data.amount);
    const taxRate = parseFloat(data.taxRate || "21");
    const taxAmount = amount * (taxRate / 100);
    updateData.taxAmount = taxAmount.toString();
    updateData.total = (amount + taxAmount).toString();
  }

  const [expense] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, params.data.id)).returning();
  if (!expense) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...expense, supplierName: null, categoryName: null });
});

export default router;
