import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { ListProjectsQueryParams, CreateProjectBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  if (query.data.companyId) {
    res.json(await db.select().from(projectsTable).where(eq(projectsTable.companyId, query.data.companyId)).orderBy(projectsTable.name));
    return;
  }
  res.json(await db.select().from(projectsTable).orderBy(projectsTable.name));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [project] = await db.insert(projectsTable).values(parsed.data).returning();
  res.status(201).json(project);
});

export default router;
