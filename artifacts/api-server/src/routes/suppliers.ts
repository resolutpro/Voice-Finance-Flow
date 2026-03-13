import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { ListSuppliersQueryParams, CreateSupplierBody, UpdateSupplierParams, UpdateSupplierBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const query = ListSuppliersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  if (query.data.companyId) {
    const results = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, query.data.companyId)).orderBy(suppliersTable.name);
    res.json(results);
    return;
  }
  res.json(await db.select().from(suppliersTable).orderBy(suppliersTable.name));
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateSupplierBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [supplier] = await db.update(suppliersTable).set(body.data).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) { res.status(404).json({ error: "Not found" }); return; }
  res.json(supplier);
});

export default router;
