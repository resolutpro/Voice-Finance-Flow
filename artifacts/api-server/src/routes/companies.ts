import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/companies", async (_req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  res.json(companies);
});

router.post("/companies", async (req, res): Promise<void> => {
  const [company] = await db.insert(companiesTable).values(req.body).returning();
  res.status(201).json(company);
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [company] = await db.update(companiesTable).set(req.body).where(eq(companiesTable.id, id)).returning();
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

export default router;
