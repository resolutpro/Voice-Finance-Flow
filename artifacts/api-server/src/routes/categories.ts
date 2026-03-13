import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(await db.select().from(categoriesTable).orderBy(categoriesTable.name));
});

router.post("/categories", async (req, res): Promise<void> => {
  const [category] = await db.insert(categoriesTable).values(req.body).returning();
  res.status(201).json(category);
});

export default router;
