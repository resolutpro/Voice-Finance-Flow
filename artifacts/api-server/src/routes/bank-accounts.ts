import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bankAccountsTable, companiesTable } from "@workspace/db";
import { ListBankAccountsQueryParams, CreateBankAccountBody, UpdateBankAccountParams, UpdateBankAccountBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bank-accounts", async (req, res): Promise<void> => {
  const query = ListBankAccountsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const accounts = await db
    .select()
    .from(bankAccountsTable)
    .where(query.data.companyId ? eq(bankAccountsTable.companyId, query.data.companyId) : undefined)
    .orderBy(bankAccountsTable.name);

  const result = await Promise.all(accounts.map(async (acc) => {
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, acc.companyId));
    return { ...acc, companyName: company?.name ?? null };
  }));

  res.json(result);
});

router.post("/bank-accounts", async (req, res): Promise<void> => {
  const parsed = CreateBankAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.insert(bankAccountsTable).values(parsed.data).returning();
  res.status(201).json({ ...account, companyName: null });
});

router.patch("/bank-accounts/:id", async (req, res): Promise<void> => {
  const params = UpdateBankAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateBankAccountBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [account] = await db.update(bankAccountsTable).set(body.data).where(eq(bankAccountsTable.id, params.data.id)).returning();
  if (!account) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...account, companyName: null });
});

export default router;
