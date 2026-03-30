import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
// 1. Importamos de TU librería autogenerada
import {
  CreateAuthorizedUserBody, // O createAuthorizedUserBody según genere tu Zod
  UpdateAuthorizedUserBody,
} from "@workspace/api-zod";

// 2. Importaciones correctas de tu base de datos
import { db, usersTable, companiesTable } from "@workspace/db";
// IMPORTANTE: Asegúrate de que exportas esta tabla en lib/db/src/index.ts
import { userCompanyAccess } from "@workspace/db";

// Si necesitas bcrypt para ponerle una contraseña por defecto a los invitados
import bcrypt from "bcryptjs";

const router = Router();

// GET: Obtener todos los usuarios autorizados
router.get("/authorized-users", async (req: Request, res: Response) => {
  try {
    // Usamos select() y leftJoin para mantener tu sintaxis
    const accessList = await db
      .select({
        id: userCompanyAccess.id,
        userId: userCompanyAccess.userId,
        companyId: userCompanyAccess.companyId,
        allowedModules: userCompanyAccess.allowedModules,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
        },
        company: {
          id: companiesTable.id,
          name: companiesTable.name,
        },
      })
      .from(userCompanyAccess)
      .leftJoin(usersTable, eq(userCompanyAccess.userId, usersTable.id))
      .leftJoin(
        companiesTable,
        eq(userCompanyAccess.companyId, companiesTable.id),
      );

    // Agrupamos los resultados por usuario para que el Frontend lo reciba como espera
    const groupedUsers = accessList.reduce((acc: any, row) => {
      const { user, companyId, allowedModules } = row;
      if (!user) return acc;

      if (!acc[user.id]) {
        acc[user.id] = {
          id: user.id,
          name: user.name,
          email: user.email,
          companyAccess: [],
        };
      }

      acc[user.id].companyAccess.push({
        companyId,
        modules: allowedModules,
      });

      return acc;
    }, {});

    res.json(Object.values(groupedUsers));
  } catch (error) {
    console.error("Error GET authorized-users:", error);
    res.status(500).json({ error: "Error al obtener usuarios autorizados" });
  }
});

// POST: Crear/Invitar un nuevo usuario
router.post("/authorized-users", async (req: Request, res: Response) => {
  try {
    const parsedData = req.body; // O usar parsedData = createAuthorizedUserBody.parse(req.body); si la exportación Zod es estricta

    // 1. Buscamos si el usuario ya existe usando select() como en auth.ts
    let [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parsedData.email));

    // 2. Si no existe, lo creamos
    if (!targetUser) {
      // Le generamos una contraseña aleatoria ya que es un invitado
      // (Luego podrías hacer que se le envíe un email para cambiarla)
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const [newUser] = await db
        .insert(usersTable)
        .values({
          email: parsedData.email,
          name: parsedData.name,
          passwordHash: hashedPassword,
          role: "user", // Rol por defecto
        })
        .returning();

      targetUser = newUser;
    }

    // 3. Preparamos los registros de acceso
    const accessRecords = parsedData.companyAccess.map((access: any) => ({
      userId: targetUser.id,
      companyId: access.companyId,
      allowedModules: access.modules,
    }));

    // 4. Guardamos los accesos en una transacción
    await db.transaction(async (tx) => {
      // Por seguridad, limpiamos accesos previos si lo estamos re-invitando
      await tx
        .delete(userCompanyAccess)
        .where(eq(userCompanyAccess.userId, targetUser.id));

      if (accessRecords.length > 0) {
        await tx.insert(userCompanyAccess).values(accessRecords);
      }
    });

    res.status(201).json({ id: targetUser.id, ...parsedData });
  } catch (error: any) {
    if (error.name === "ZodError")
      return res.status(400).json({ error: error.errors });
    console.error("Error POST authorized-users:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT: Actualizar permisos
router.put("/authorized-users/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parsedData = req.body; // O updateAuthorizedUserBody.parse(req.body);

    await db.transaction(async (tx) => {
      // Borramos los permisos actuales
      await tx
        .delete(userCompanyAccess)
        .where(eq(userCompanyAccess.userId, userId));

      // Insertamos los nuevos
      if (parsedData.companyAccess && parsedData.companyAccess.length > 0) {
        const accessRecords = parsedData.companyAccess.map((access: any) => ({
          userId: userId,
          companyId: access.companyId,
          allowedModules: access.modules,
        }));
        await tx.insert(userCompanyAccess).values(accessRecords);
      }
    });

    res.json({ message: "Permisos actualizados con éxito" });
  } catch (error: any) {
    if (error.name === "ZodError")
      return res.status(400).json({ error: error.errors });
    console.error("Error PUT authorized-users:", error);
    res.status(500).json({ error: "Error al actualizar permisos" });
  }
});

// DELETE: Revocar acceso
router.delete(
  "/authorized-users/:userId",
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      await db
        .delete(userCompanyAccess)
        .where(eq(userCompanyAccess.userId, userId));

      res.json({ message: "Acceso revocado" });
    } catch (error) {
      console.error("Error DELETE authorized-users:", error);
      res.status(500).json({ error: "Error al revocar acceso" });
    }
  },
);

export default router;
