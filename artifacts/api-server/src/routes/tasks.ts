import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  const status = req.query.status as string | undefined;

  const conditions = [];
  if (companyId) conditions.push(eq(tasksTable.companyId, companyId));
  if (status) conditions.push(eq(tasksTable.status, status));

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasksTable.createdAt));

  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const [task] = await db.insert(tasksTable).values(req.body).returning();
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [task] = await db.update(tasksTable).set(req.body).where(eq(tasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ success: true });
});

export default router;
