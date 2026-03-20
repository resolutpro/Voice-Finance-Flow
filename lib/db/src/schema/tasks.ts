import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pendiente"), // pendiente, en_curso, bloqueada, hecha, revisada
  priority: text("priority").default("normal"),
  dueDate: date("due_date"),
  // Nuevos campos para control operativo
  assignee: text("assignee"),
  meetingReference: text("meeting_reference"),
  observations: text("observations"),
  relatedType: text("related_type"),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
