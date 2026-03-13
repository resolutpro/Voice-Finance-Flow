import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  if (companyId) {
    res.json(await db.select().from(projectsTable).where(eq(projectsTable.companyId, companyId)).orderBy(projectsTable.name));
    return;
  }
  res.json(await db.select().from(projectsTable).orderBy(projectsTable.name));
});

router.post("/projects", async (req, res): Promise<void> => {
  const [project] = await db.insert(projectsTable).values(req.body).returning();
  res.status(201).json(project);
});

export default router;
