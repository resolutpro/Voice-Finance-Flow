import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  companiesTable,
  invitationsTable,
} from "@workspace/db";

import { eq } from "drizzle-orm";
import { userCompanyAccess } from "@workspace/db";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email y contraseña son requeridos" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user) {
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
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

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Creamos tu usuario administrador asociado a esa empresa
      const [adminUser] = await db
        .insert(usersTable)
        .values({
          name,
          email,
          passwordHash: hashedPassword,
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

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear el usuario normal
    const [newUser] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash: hashedPassword,
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

router.get("/auth/me", async (req, res) => {
  try {
    // 1. En un sistema real extraerías el token del header Authorization.
    // Como tu frontend guarda 'token_1', vamos a sacar el ID de ahí.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer token_")) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const userIdStr = authHeader.replace("Bearer token_", "");
    const userId = parseInt(userIdStr, 10);

    if (isNaN(userId)) {
      return res.status(401).json({ error: "Token inválido" });
    }

    // 2. Buscamos al usuario en la BD
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // 3. Buscamos a qué empresas tiene acceso y qué módulos
    const accessRecords = await db
      .select()
      .from(userCompanyAccess)
      .where(eq(userCompanyAccess.userId, userId));

    // 4. Formateamos los permisos
    const companyAccess = accessRecords.map((record) => ({
      companyId: record.companyId,
      modules: record.allowedModules || [], // Usamos allowedModules como dictaba la DB
    }));

    // 5. Devolvemos el usuario SIN el passwordHash pero CON los permisos
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role, // ESTO ES CLAVE PARA EL ADMIN
      defaultCompanyId: user.defaultCompanyId,
      companyAccess: companyAccess,
    });
  } catch (error) {
    console.error("Error en /auth/me:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

export default router;
