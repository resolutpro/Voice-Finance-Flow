import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { ListTasksQueryParams, CreateTaskBody, UpdateTaskParams, UpdateTaskBody, DeleteTaskParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const query = ListTasksQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [];
  if (query.data.companyId) conditions.push(eq(tasksTable.companyId, query.data.companyId));
  if (query.data.status) conditions.push(eq(tasksTable.status, query.data.status));

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasksTable.createdAt));

  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTaskBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [task] = await db.update(tasksTable).set(body.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  res.json({ success: true });
});

export default router;
