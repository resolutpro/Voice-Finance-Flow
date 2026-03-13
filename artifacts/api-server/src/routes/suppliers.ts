import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  if (companyId) {
    const results = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId)).orderBy(suppliersTable.name);
    res.json(results);
    return;
  }
  res.json(await db.select().from(suppliersTable).orderBy(suppliersTable.name));
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const [supplier] = await db.insert(suppliersTable).values(req.body).returning();
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [supplier] = await db.update(suppliersTable).set(req.body).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) { res.status(404).json({ error: "Not found" }); return; }
  res.json(supplier);
});

export default router;
