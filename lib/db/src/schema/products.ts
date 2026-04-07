import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb, // AÑADIR jsonb AQUÍ
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(), // PRECIO BASE (Unidad)

  // NUEVO CAMPO: Guardará [{ name: "Caja 12 uds", price: 15.50 }, { name: "Pallet", price: 150.00 }]
  priceTiers: jsonb("price_tiers")
    .$type<{ name: string; price: number }[]>()
    .default([]),

  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
