import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  clientId: integer("client_id"),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pendiente"), // pendiente, en_curso, bloqueada, hecha...
  active: boolean("active").notNull().default(true),

  // Nuevos campos operativos para Proyectos
  assignee: text("assignee"),
  dueDate: date("due_date"),
  observations: text("observations"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
