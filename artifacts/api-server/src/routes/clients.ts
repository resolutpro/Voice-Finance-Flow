import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  ListClientsQueryParams,
  CreateClientBody,
  UpdateClientParams,
  UpdateClientBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (req, res): Promise<void> => {
  const query = ListClientsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (query.data.companyId) {
    const results = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.companyId, query.data.companyId))
      .orderBy(clientsTable.name);
    res.json(results);
    return;
  }
  res.json(await db.select().from(clientsTable).orderBy(clientsTable.name));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [client] = await db
    .insert(clientsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(client);
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateClientBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [client] = await db
    .update(clientsTable)
    .set(body.data)
    .where(eq(clientsTable.id, params.data.id))
    .returning();
  if (!client) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(client);
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  // Aprovechamos UpdateClientParams porque lo único que hace es validar que el :id sea un número válido
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deletedClient] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, params.data.id))
    .returning();
  if (!deletedClient) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(deletedClient);
});

export default router;
