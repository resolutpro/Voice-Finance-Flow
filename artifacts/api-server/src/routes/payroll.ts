import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import multer from "multer";
import {
  db,
  invoicesTable,
  payablesTable,
  payrollUploadsTable,
} from "@workspace/db";

const router: IRouter = Router();
const openai = new OpenAI();
const upload = multer({ storage: multer.memoryStorage() });

// 1. Modificamos el esquema para recibir un array de números en la SS
const parserSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fecha_nomina", "total_irpf", "cuotas_seguridad_social_empresa"],
  properties: {
    fecha_nomina: { type: "string", description: "Fecha YYYY-MM-DD" },
    total_irpf: { type: "number" },
    cuotas_seguridad_social_empresa: {
      type: "array",
      items: { type: "number" },
      description:
        "Lista de todos los importes individuales de las cuotas empresariales",
    },
  },
} as const;

function lastDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function quarterPaymentDate(payrollDateStr: string) {
  const d = new Date(`${payrollDateStr}T00:00:00.000Z`);
  const q = Math.floor(d.getUTCMonth() / 3);
  const year = d.getUTCFullYear();
  const nextMonth = [3, 6, 9, 0][q];
  const payYear = q === 3 ? year + 1 : year;
  return `${payYear}-${String(nextMonth + 1).padStart(2, "0")}-20`;
}

async function getQuarterlyIva(companyId: number, payrollDateStr: string) {
  const d = new Date(`${payrollDateStr}T00:00:00.000Z`);
  const startMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(d.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), startMonth + 3, 1));

  const rows = await db
    .select({
      iva: sql<string>`COALESCE(SUM(((${invoicesTable.total})::numeric - (${invoicesTable.subtotal})::numeric)), 0)`,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        gte(invoicesTable.issueDate, formatDate(start)),
        lt(invoicesTable.issueDate, formatDate(end)),
        eq(invoicesTable.type, "invoice"),
      ),
    );

  return Number(rows[0]?.iva ?? 0);
}

router.get("/payroll/uploads", async (req, res): Promise<void> => {
  const companyId = Number(req.query.companyId);
  if (!companyId) {
    res.status(400).json({ error: "companyId es obligatorio" });
    return;
  }

  const items = await db
    .select()
    .from(payrollUploadsTable)
    .where(eq(payrollUploadsTable.companyId, companyId));

  res.json(items);
});

router.post(
  "/payroll/uploads",
  upload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      const companyId = Number(req.body.companyId);

      if (!companyId) {
        res.status(400).json({ error: "companyId es obligatorio" });
        return;
      }

      if (!file || file.mimetype !== "application/pdf") {
        res.status(400).json({ error: "Debes subir un PDF de nómina" });
        return;
      }

      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                // 2. Ajustamos el prompt para pedir un array de números sin sumar
                text: "Extrae de la nómina SOLO JSON válido con: fecha_nomina YYYY-MM-DD, total_irpf (número) y cuotas_seguridad_social_empresa como un array de números. En el array cuotas_seguridad_social_empresa incluye TODOS los importes individuales de las cuotas empresariales de Seguridad Social (Contingencias comunes, MEI, AT y EP, Desempleo, Formación Profesional, FOGASA, horas extra, solidaridad, etc.). NO los sumes, extrae cada importe individual. Usa el importe final de cada línea, no base ni porcentaje. No incluyas cuotas del trabajador. Convierte coma decimal a punto.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: file.originalname,
                file_data: `data:application/pdf;base64,${file.buffer.toString("base64")}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "payroll_extract",
            schema: parserSchema,
            strict: true,
          },
        },
      });

      const parsed = JSON.parse(response.output_text);
      const payrollDate = parsed.fecha_nomina;
      const totalIrpf = Number(parsed.total_irpf);

      // 3. Sumamos nosotros el total de las cuotas extraídas
      const cuotasSs = parsed.cuotas_seguridad_social_empresa || [];
      const totalSs = cuotasSs.reduce(
        (acc: number, curr: number) => acc + Number(curr),
        0,
      );

      const ssDueDate = formatDate(
        lastDayOfMonth(new Date(`${payrollDate}T00:00:00.000Z`)),
      );
      const taxDueDate = quarterPaymentDate(payrollDate);

      const [upload] = await db
        .insert(payrollUploadsTable)
        .values({
          companyId,
          payrollDate,
          totalIrpf: totalIrpf.toFixed(2),
          totalSeguridadSocialEmpresa: totalSs.toFixed(2),
          processingStatus: "processed",
          sourceFileName: file.originalname,
        })
        .returning();

      if (totalSs > 0) {
        await db.insert(payablesTable).values({
          companyId,
          description: `Seguridad Social Empresa nómina ${payrollDate}`,
          amount: totalSs.toFixed(2),
          dueDate: ssDueDate,
          status: "pending",
        });
      }

      if (totalIrpf > 0) {
        await db.insert(payablesTable).values({
          companyId,
          description: `IRPF trimestral nómina ${payrollDate}`,
          amount: totalIrpf.toFixed(2),
          dueDate: taxDueDate,
          status: "pending",
        });
      }

      const ivaAmount = await getQuarterlyIva(companyId, payrollDate);
      if (ivaAmount > 0) {
        await db.insert(payablesTable).values({
          companyId,
          description: `IVA trimestral emitidas (${payrollDate})`,
          amount: ivaAmount.toFixed(2),
          dueDate: taxDueDate,
          status: "pending",
        });
      }

      res.status(201).json(upload);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message || "Error procesando nómina" });
    }
  },
);

export default router;
