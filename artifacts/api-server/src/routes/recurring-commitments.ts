import { Router } from "express";
import { db } from "@workspace/db";
import { recurringCommitmentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/recurring-commitments", async (req, res) => {
  try {
    const companyIdHeader = req.headers["x-company-id"];
    const companyId = companyIdHeader
      ? parseInt(companyIdHeader as string)
      : undefined;
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const commitments = await db.query.recurringCommitmentsTable.findMany({
      where: eq(recurringCommitmentsTable.companyId, companyId),
      orderBy: (commitments, { desc }) => [desc(commitments.createdAt)],
    });

    res.json(commitments);
  } catch (error) {
    console.error("Error al obtener compromisos recurrentes:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Crear un nuevo compromiso recurrente
router.post("/recurring-commitments", async (req, res) => {
  try {
    const [commitment] = await db
      .insert(recurringCommitmentsTable)
      .values({
        ...req.body,
        // Convertimos los strings a fechas válidas para la base de datos
        startDate: new Date(req.body.startDate),
        nextDueDate: new Date(req.body.nextDueDate || req.body.startDate),
      })
      .returning();

    res.status(201).json(commitment);
  } catch (error) {
    console.error("Error al crear compromiso recurrente:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
