import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { CreateCategoryBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
  if (companyId) {
    res.json(await db.select().from(categoriesTable).where(eq(categoriesTable.companyId, companyId)).orderBy(categoriesTable.name));
  } else {
    res.json(await db.select().from(categoriesTable).orderBy(categoriesTable.name));
  }
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [category] = await db.insert(categoriesTable).values(parsed.data).returning();
  res.status(201).json(category);
});

export default router;
