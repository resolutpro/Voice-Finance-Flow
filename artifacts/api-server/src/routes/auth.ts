import { Router } from "express";
import {
  db,
  usersTable,
  companiesTable,
  invitationsTable,
} from "@workspace/db";

import { eq } from "drizzle-orm";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son requeridos" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user || user.passwordHash !== password) {
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }

    res.json({ token: `token_${user.id}` });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, token } = req.body;

console.log("🔐 Token Maestro en el .env:", process.env.MASTER_TOKEN);

    // --- 1. COMPROBAR SI ES EL TOKEN MAESTRO ---
    // (Asegúrate de poner MASTER_TOKEN=tu-clave-secreta en tu archivo .env)
    if (token === process.env.MASTER_TOKEN) {
      // Creamos tu empresa principal ("Sede Central")
      const [adminCompany] = await db
        .insert(companiesTable)
        .values({
          name: "Sede Central (Admin)",
          taxId: "00000000A",
          address: "Sede",
          city: "Ciudad",
          province: "Provincia",
          postalCode: "00000",
        })
        .returning();

      // Creamos tu usuario administrador asociado a esa empresa
      const [adminUser] = await db
        .insert(usersTable)
        .values({
          name,
          email,
          passwordHash: password, // Nota: En el futuro deberíamos encriptar esto con bcrypt
          defaultCompanyId: adminCompany.id,
          role: "admin",
        })
        .returning();

      return res.status(200).json({
        message: "Usuario Padre creado con éxito",
        user: adminUser,
      });
    }

    // --- 2. FLUJO NORMAL DE INVITACIONES (Para tus clientes) ---
    const [invitation] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, token));

    if (!invitation) {
      return res.status(400).json({ error: "Token inválido." });
    }
    if (invitation.isUsed) {
      return res
        .status(400)
        .json({ error: "Esta invitación ya ha sido utilizada." });
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Esta invitación ha caducado." });
    }

    // Crear el usuario normal
    const [newUser] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash: password,
        defaultCompanyId: invitation.companyId,
        role: "user",
      })
      .returning();

    // Marcar la invitación como usada
    await db
      .update(invitationsTable)
      .set({ isUsed: true })
      .where(eq(invitationsTable.id, invitation.id));

    return res.status(200).json({ user: newUser });
  } catch (error) {
    console.error("Error en el registro:", error);
    res.status(500).json({ error: "Error en el servidor durante el registro" });
  }
});

export default router;
