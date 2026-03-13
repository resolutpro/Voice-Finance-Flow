import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bankAccountsTable } from "./bank-accounts";
import { invoicesTable } from "./invoices";
import { vendorInvoicesTable } from "./vendor-invoices";

export const cashMovementsTable = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull().references(() => bankAccountsTable.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  description: text("description"),
  movementDate: date("movement_date").notNull(),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id),
  vendorInvoiceId: integer("vendor_invoice_id").references(() => vendorInvoicesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCashMovementSchema = createInsertSchema(cashMovementsTable).omit({ id: true, createdAt: true });
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovementsTable.$inferSelect;
