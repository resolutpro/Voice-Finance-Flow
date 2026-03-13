import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bankAccountsTable, companiesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/bank-accounts", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;

  const accounts = await db
    .select()
    .from(bankAccountsTable)
    .where(companyId ? eq(bankAccountsTable.companyId, companyId) : undefined)
    .orderBy(bankAccountsTable.name);

  const result = await Promise.all(accounts.map(async (acc) => {
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, acc.companyId));
    return { ...acc, companyName: company?.name ?? null };
  }));

  res.json(result);
});

router.post("/bank-accounts", async (req, res): Promise<void> => {
  const [account] = await db.insert(bankAccountsTable).values(req.body).returning();
  res.status(201).json({ ...account, companyName: null });
});

router.patch("/bank-accounts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [account] = await db.update(bankAccountsTable).set(req.body).where(eq(bankAccountsTable.id, id)).returning();
  if (!account) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...account, companyName: null });
});

export default router;
