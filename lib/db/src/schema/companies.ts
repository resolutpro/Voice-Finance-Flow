// lib/db/src/schema/companies.ts
import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull(),
  address: text("address").notNull(), // Obligatorio
  city: text("city").notNull(), // Obligatorio
  province: text("province").notNull(), // NUEVO - Obligatorio
  postalCode: text("postal_code").notNull(), // Obligatorio
  country: text("country").default("ES"),
  phone: text("phone"), // Opcional
  fax: text("fax"), // NUEVO - Opcional
  email: text("email"),
  logo: text("logo"),
  isUte: boolean("is_ute").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  bankAccountNumber: text("bank_account_number"), // IBAN/Cuenta
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
