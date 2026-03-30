import {
  pgTable,
  serial,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const userCompanyAccess = pgTable("user_company_access", {
  // Cambiamos a serial e integer para que coincida con tus otras tablas
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  allowedModules: jsonb("allowed_modules")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
