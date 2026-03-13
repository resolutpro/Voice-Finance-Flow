import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { suppliersTable } from "./suppliers";
import { vendorInvoicesTable } from "./vendor-invoices";

export const payablesTable = pgTable("payables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  vendorInvoiceId: integer("vendor_invoice_id").references(() => vendorInvoicesTable.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayableSchema = createInsertSchema(payablesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayable = z.infer<typeof insertPayableSchema>;
export type Payable = typeof payablesTable.$inferSelect;
