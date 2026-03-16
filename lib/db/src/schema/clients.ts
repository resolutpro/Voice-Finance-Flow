import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .references(() => companiesTable.id)
    .notNull(),
  name: text("name").notNull(), // EMPRESA
  taxId: text("tax_id").notNull(), // CIF
  address: text("address").notNull(), // DOMICILIO
  city: text("city").notNull(), // LOCALIDAD
  province: text("province").notNull(), // PROVINCIA (NUEVO)
  postalCode: text("postal_code").notNull(), // C.P.
  country: text("country").default("ES"),
  phone: text("phone"), // TLF (Opcional)
  fax: text("fax"), // FAX (Opcional - NUEVO)
  email: text("email"),
  contactPerson: text("contact_person"),
  notes: text("notes"),
  paymentTermsDays: integer("payment_terms_days"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
