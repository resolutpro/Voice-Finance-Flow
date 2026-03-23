import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  date,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { suppliersTable } from "./suppliers";
import { categoriesTable } from "./categories";

// Definición estricta de estados para Facturas Recibidas (Compras)
export const vendorInvoiceStatusEnum = pgEnum("vendor_invoice_status", [
  "borrador",
  "pendiente_pago",
  "parcialmente_pagada",
  "pagada",
  "vencida",
  "anulada",
]);

export const vendorInvoicesTable = pgTable("vendor_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  invoiceNumber: text("invoice_number"),
  status: vendorInvoiceStatusEnum("status").notNull().default("pendiente_pago"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("21"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  description: text("description"), // Actúa como el concepto general
  fileUrl: text("file_url"), // PDF original de la factura del proveedor
  extractedData: jsonb("extracted_data"), // NUEVO: La "bolsa" donde se guardará TODO lo que Google lea extra
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// NUEVO: Tabla para las líneas de la factura (productos/servicios individuales)
export const vendorInvoiceItemsTable = pgTable("vendor_invoice_items", {
  id: serial("id").primaryKey(),
  vendorInvoiceId: integer("vendor_invoice_id")
    .notNull()
    .references(() => vendorInvoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
});

// Tabla para gastos rápidos (tickets, recibos sin factura formal)
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("21"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  expenseDate: date("expense_date").notNull(),
  status: text("status").notNull().default("pending"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertVendorInvoiceSchema = createInsertSchema(
  vendorInvoicesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendorInvoice = z.infer<typeof insertVendorInvoiceSchema>;
export type VendorInvoice = typeof vendorInvoicesTable.$inferSelect;

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
