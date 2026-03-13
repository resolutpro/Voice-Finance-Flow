import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/clients", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;
  let query = db.select().from(clientsTable).orderBy(clientsTable.name);
  if (companyId) {
    const results = await db.select().from(clientsTable).where(eq(clientsTable.companyId, companyId)).orderBy(clientsTable.name);
    res.json(results);
    return;
  }
  res.json(await query);
});

router.post("/clients", async (req, res): Promise<void> => {
  const [client] = await db.insert(clientsTable).values(req.body).returning();
  res.status(201).json(client);
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [client] = await db.update(clientsTable).set(req.body).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Not found" }); return; }
  res.json(client);
});

export default router;
