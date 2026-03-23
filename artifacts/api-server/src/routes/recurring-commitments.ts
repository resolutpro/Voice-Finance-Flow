import { Router } from "express";
import { db } from "@workspace/db";
import { recurringCommitmentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/recurring-commitments -> Obtiene los registros de la empresa activa
router.get("/", async (req, res) => {
  try {
    const companyId = Number(req.headers["x-company-id"]);

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    const commitments = await db
      .select()
      .from(recurringCommitmentsTable)
      .where(eq(recurringCommitmentsTable.companyId, companyId))
      .orderBy(recurringCommitmentsTable.nextDueDate);

    res.json(commitments);
  } catch (error) {
    console.error("Error fetching recurring commitments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/recurring-commitments -> Crea un nuevo compromiso
router.post("/", async (req, res) => {
  try {
    const companyId = Number(req.headers["x-company-id"]);
    if (!companyId)
      return res.status(400).json({ error: "Company ID is required" });

    const { type, title, amount, frequency, startDate } = req.body;

    if (!title || !amount || !frequency || !startDate) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Insertamos en la Base de Datos
    // Como simplificación inicial, asignamos el primer "nextDueDate" igual a la fecha de inicio
    const newCommitment = await db
      .insert(recurringCommitmentsTable)
      .values({
        companyId,
        type,
        title,
        amount: amount.toString(), // Drizzle requiere que los 'numeric' vayan en string para evitar pérdida de precisión
        frequency,
        startDate: new Date(startDate).toISOString().split("T")[0],
        nextDueDate: new Date(startDate).toISOString().split("T")[0],
        active: true,
      })
      .returning();

    res.status(201).json(newCommitment[0]);
  } catch (error) {
    console.error("Error al crear el compromiso recurrente:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
