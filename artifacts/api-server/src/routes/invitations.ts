import { Router } from "express";
import { db } from "@workspace/db";
import { invitationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// Crear una nueva invitación
router.post("/invitations", async (req, res) => {
  try {
    const { email, companyId } = req.body;

    // Generar un token único (UUID)
    const token = crypto.randomUUID();

    // Caduca en 7 días
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await db
      .insert(invitationsTable)
      .values({
        email,
        token,
        companyId: Number(companyId),
        expiresAt,
      })
      .returning();

    res.status(201).json(invitation);
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ error: "Error al crear la invitación" });
  }
});

// Listar invitaciones por empresa
router.get("/invitations", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    const data = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.companyId, Number(companyId)))
      .orderBy(desc(invitationsTable.createdAt));

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener invitaciones" });
  }
});

export default router;
