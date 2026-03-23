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

// Obtener un compromiso por ID
router.get("/recurring-commitments/:id", async (req, res) => {
  try {
    const companyIdHeader = req.headers["x-company-id"];
    const companyId = companyIdHeader
      ? parseInt(companyIdHeader as string)
      : undefined;
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const commitment = await db.query.recurringCommitmentsTable.findFirst({
      where: (table) => eq(table.id, parseInt(req.params.id)),
    });

    if (!commitment) {
      return res.status(404).json({ message: "Commitment not found" });
    }

    if (commitment.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(commitment);
  } catch (error) {
    console.error("Error al obtener compromiso:", error);
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

// Actualizar un compromiso
router.put("/recurring-commitments/:id", async (req, res) => {
  try {
    const companyIdHeader = req.headers["x-company-id"];
    const companyId = companyIdHeader
      ? parseInt(companyIdHeader as string)
      : undefined;
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const existingCommitment = await db.query.recurringCommitmentsTable.findFirst({
      where: (table) => eq(table.id, parseInt(req.params.id)),
    });

    if (!existingCommitment) {
      return res.status(404).json({ message: "Commitment not found" });
    }

    if (existingCommitment.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updateData: any = { ...req.body };
    if (req.body.startDate) {
      updateData.startDate = new Date(req.body.startDate);
    }
    if (req.body.nextDueDate) {
      updateData.nextDueDate = new Date(req.body.nextDueDate);
    }

    const [updatedCommitment] = await db
      .update(recurringCommitmentsTable)
      .set(updateData)
      .where(eq(recurringCommitmentsTable.id, parseInt(req.params.id)))
      .returning();

    res.json(updatedCommitment);
  } catch (error) {
    console.error("Error al actualizar compromiso:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Pausar/Activar un compromiso
router.patch("/recurring-commitments/:id/toggle", async (req, res) => {
  try {
    const companyIdHeader = req.headers["x-company-id"];
    const companyId = companyIdHeader
      ? parseInt(companyIdHeader as string)
      : undefined;
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const existingCommitment = await db.query.recurringCommitmentsTable.findFirst({
      where: (table) => eq(table.id, parseInt(req.params.id)),
    });

    if (!existingCommitment) {
      return res.status(404).json({ message: "Commitment not found" });
    }

    if (existingCommitment.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [updatedCommitment] = await db
      .update(recurringCommitmentsTable)
      .set({ active: !existingCommitment.active })
      .where(eq(recurringCommitmentsTable.id, parseInt(req.params.id)))
      .returning();

    res.json(updatedCommitment);
  } catch (error) {
    console.error("Error al cambiar estado del compromiso:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Eliminar un compromiso
router.delete("/recurring-commitments/:id", async (req, res) => {
  try {
    const companyIdHeader = req.headers["x-company-id"];
    const companyId = companyIdHeader
      ? parseInt(companyIdHeader as string)
      : undefined;
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const existingCommitment = await db.query.recurringCommitmentsTable.findFirst({
      where: (table) => eq(table.id, parseInt(req.params.id)),
    });

    if (!existingCommitment) {
      return res.status(404).json({ message: "Commitment not found" });
    }

    if (existingCommitment.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await db
      .delete(recurringCommitmentsTable)
      .where(eq(recurringCommitmentsTable.id, parseInt(req.params.id)));

    res.json({ message: "Commitment deleted successfully" });
  } catch (error) {
    console.error("Error al eliminar compromiso:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
