import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, cashMovementsTable, bankAccountsTable } from "@workspace/db";
import { ListCashMovementsQueryParams, CreateCashMovementBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cash-movements", async (req, res): Promise<void> => {
  const query = ListCashMovementsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  let movements;
  if (query.data.bankAccountId) {
    movements = await db.select().from(cashMovementsTable).where(eq(cashMovementsTable.bankAccountId, query.data.bankAccountId)).orderBy(desc(cashMovementsTable.movementDate));
  } else if (query.data.companyId) {
    const accounts = await db.select({ id: bankAccountsTable.id }).from(bankAccountsTable).where(eq(bankAccountsTable.companyId, query.data.companyId));
    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) {
      res.json([]);
      return;
    }
    const allMovements = await db.select().from(cashMovementsTable).orderBy(desc(cashMovementsTable.movementDate));
    movements = allMovements.filter(m => accountIds.includes(m.bankAccountId));
  } else {
    movements = await db.select().from(cashMovementsTable).orderBy(desc(cashMovementsTable.movementDate));
  }

  const result = await Promise.all(movements.map(async (mov) => {
    const [account] = await db.select({ name: bankAccountsTable.name }).from(bankAccountsTable).where(eq(bankAccountsTable.id, mov.bankAccountId));
    return { ...mov, bankAccountName: account?.name ?? null };
  }));

  res.json(result);
});

router.post("/cash-movements", async (req, res): Promise<void> => {
  const parsed = CreateCashMovementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;
  const [movement] = await db.insert(cashMovementsTable).values(data).returning();

  const amount = parseFloat(data.amount);
  const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, data.bankAccountId));
  if (account) {
    const newBalance = parseFloat(account.currentBalance) + amount;
    await db.update(bankAccountsTable).set({ currentBalance: newBalance.toString() }).where(eq(bankAccountsTable.id, data.bankAccountId));
  }

  res.status(201).json({ ...movement, bankAccountName: null });
});

export default router;
