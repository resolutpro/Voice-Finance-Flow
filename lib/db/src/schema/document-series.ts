import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const documentSeriesTable = pgTable("document_series", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  type: text("type").notNull(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSeriesSchema = createInsertSchema(documentSeriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentSeries = z.infer<typeof insertDocumentSeriesSchema>;
export type DocumentSeries = typeof documentSeriesTable.$inferSelect;
