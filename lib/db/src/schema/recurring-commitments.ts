import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  date,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { categoriesTable } from "./categories";
import { suppliersTable } from "./suppliers";

// Definimos si es dinero que entra o que sale
export const commitmentTypeEnum = pgEnum("commitment_type", [
  "ingreso", // Cuotas mensuales de clientes, igualas, etc.
  "gasto", // Nóminas, alquileres, software, etc.
]);

// Definimos las frecuencias, incluyendo los casos fiscales especiales de España
export const commitmentFrequencyEnum = pgEnum("commitment_frequency", [
  "semanal",
  "mensual",
  "bimensual",
  "trimestral",
  "semestral",
  "anual",
  "ultimo_dia_habil_mes", // Específico para Seguros Sociales y Nóminas
  "impuestos_trimestrales", // Específico para IVA/IRPF (20 de abril, 20 de julio, 20 de octubre, 20 de enero)
  "impuestos_anuales", // Ej: 25 de julio para el Impuesto de Sociedades
]);

export const recurringCommitmentsTable = pgTable("recurring_commitments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),

  // Opcional: Si el gasto recurrente está asociado a un proveedor o cliente específico
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  // clientId: integer("client_id").references(() => clientsTable.id), // Si añades clientes

  type: commitmentTypeEnum("type").notNull(),
  title: text("title").notNull(), // Ej: "Alquiler Oficina", "Seguros Sociales", "IVA 1T"
  description: text("description"),

  // Cantidad estimada. Para impuestos variables puede ser una media o 0 hasta que se calcule,
  // pero sirve para reservar el hueco en la previsión de tesorería.
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),

  frequency: commitmentFrequencyEnum("frequency").notNull(),

  // Control de fechas
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // Si es null, es indefinido
  nextDueDate: date("next_due_date").notNull(), // Próxima fecha en la que impactará la caja

  // Control de estado
  active: boolean("active").default(true).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRecurringCommitmentSchema = createInsertSchema(
  recurringCommitmentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertRecurringCommitment = z.infer<
  typeof insertRecurringCommitmentSchema
>;
export type RecurringCommitment = typeof recurringCommitmentsTable.$inferSelect;
