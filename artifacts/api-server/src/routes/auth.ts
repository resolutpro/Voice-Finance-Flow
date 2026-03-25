import { Router } from "express";
import { db, usersTable, invitationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const foundUser = user[0];

    if (!foundUser.isActive) {
      return res.status(401).json({ error: "User account is inactive" });
    }

    if (!verifyPassword(password, foundUser.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken();
    res.json({
      token,
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role,
        defaultCompanyId: foundUser.defaultCompanyId,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Error during login" });
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name, token: inviteToken } = req.body;

    if (!email || !password || !name || !inviteToken) {
      return res
        .status(400)
        .json({
          error: "Email, password, name, and invite token are required",
        });
    }

    // Verify the invitation token is valid
    const invitation = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, inviteToken))
      .limit(1);

    if (!invitation || invitation.length === 0) {
      return res.status(400).json({ error: "Invalid or expired invitation" });
    }

    const invite = invitation[0];

    // Check if invitation has expired
    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Invitation has expired" });
    }

    // Check if email matches the invitation
    if (invite.email !== email) {
      return res.status(400).json({
        error: "Email must match the invitation email address",
      });
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser && existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create the user
    const passwordHash = hashPassword(password);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        name,
        role: "user",
        defaultCompanyId: invite.companyId,
      })
      .returning();

    const token = generateToken();
    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        defaultCompanyId: newUser.defaultCompanyId,
      },
    });
  } catch (error) {
    console.error("Error registering:", error);
    res.status(500).json({ error: "Error during registration" });
  }
});

export default router;
