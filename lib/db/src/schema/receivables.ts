import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { clientsTable } from "./clients";
import { invoicesTable } from "./invoices";

export const receivablesTable = pgTable("receivables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  clientId: integer("client_id").references(() => clientsTable.id),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReceivableSchema = createInsertSchema(receivablesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReceivable = z.infer<typeof insertReceivableSchema>;
export type Receivable = typeof receivablesTable.$inferSelect;
