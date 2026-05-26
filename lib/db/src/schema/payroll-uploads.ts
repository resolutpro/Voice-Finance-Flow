import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const payrollUploadsTable = pgTable("payroll_uploads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  payrollDate: text("payroll_date").notNull(),
  totalIrpf: numeric("total_irpf", { precision: 12, scale: 2 }).notNull().default("0.00"),
  totalSeguridadSocialEmpresa: numeric("total_seguridad_social_empresa", { precision: 12, scale: 2 }).notNull().default("0.00"),
  processingStatus: text("processing_status").notNull().default("processed"),
  sourceFileName: text("source_file_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayrollUploadSchema = createInsertSchema(payrollUploadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollUpload = z.infer<typeof insertPayrollUploadSchema>;
export type PayrollUpload = typeof payrollUploadsTable.$inferSelect;
