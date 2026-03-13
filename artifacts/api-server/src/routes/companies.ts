import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { CreateCompanyBody, GetCompanyParams, UpdateCompanyParams, UpdateCompanyBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/companies", async (_req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  res.json(companies);
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [company] = await db.insert(companiesTable).values(parsed.data).returning();
  res.status(201).json(company);
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.id));
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateCompanyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [company] = await db.update(companiesTable).set(body.data).where(eq(companiesTable.id, params.data.id)).returning();
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

export default router;
