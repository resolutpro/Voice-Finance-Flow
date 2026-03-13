import { Router, type IRouter } from "express";
import { db, companiesTable, clientsTable, suppliersTable, projectsTable, categoriesTable, invoicesTable, invoiceItemsTable, vendorInvoicesTable, expensesTable, bankAccountsTable, cashMovementsTable, tasksTable, documentSeriesTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/seed", async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Seed endpoint is disabled in production" });
    return;
  }

  await db.delete(cashMovementsTable);
  await db.delete(invoiceItemsTable);
  await db.delete(invoicesTable);
  await db.delete(vendorInvoicesTable);
  await db.delete(expensesTable);
  await db.delete(tasksTable);
  await db.delete(documentSeriesTable);
  await db.delete(projectsTable);
  await db.delete(categoriesTable);
  await db.delete(clientsTable);
  await db.delete(suppliersTable);
  await db.delete(bankAccountsTable);
  await db.delete(companiesTable);

  const companies = await db.insert(companiesTable).values([
    { name: "Construcciones Rodríguez S.L.", taxId: "B12345678", address: "Calle Mayor 10", city: "Madrid", postalCode: "28001", email: "info@crodriguez.es" },
    { name: "Inmobiliaria Grupo Sur S.A.", taxId: "A87654321", address: "Av. de la Constitución 5", city: "Sevilla", postalCode: "41001", email: "admin@gruposur.es" },
    { name: "Servicios Técnicos Levante S.L.", taxId: "B11223344", address: "Calle Colón 15", city: "Valencia", postalCode: "46001", email: "info@stlevante.es" },
    { name: "UTE Proyecto Norte", taxId: "U99887766", address: "Paseo de la Castellana 100", city: "Madrid", postalCode: "28046", email: "ute@proyectonorte.es", isUte: true },
  ]).returning();

  const clients = await db.insert(clientsTable).values([
    { companyId: companies[0].id, name: "Ayuntamiento de Madrid", taxId: "P2807900B", email: "obras@madrid.es", paymentTermsDays: 60 },
    { companyId: companies[0].id, name: "Promotora Villas del Sol", taxId: "B55667788", email: "compras@villassol.es", paymentTermsDays: 30 },
    { companyId: companies[1].id, name: "Banco Nacional Inmobiliario", taxId: "A99001122", email: "inmuebles@bni.es", paymentTermsDays: 45 },
    { companyId: companies[2].id, name: "Hotel Gran Mediterráneo", taxId: "B44556677", email: "mantenimiento@granmed.es", paymentTermsDays: 30 },
    { companyId: companies[3].id, name: "Ministerio de Fomento", taxId: "S2800001G", email: "licitaciones@fomento.gob.es", paymentTermsDays: 90 },
  ]).returning();

  const suppliers = await db.insert(suppliersTable).values([
    { companyId: companies[0].id, name: "Cementos del Norte S.A.", taxId: "A11112222", email: "ventas@cementosnorte.es", paymentTermsDays: 30 },
    { companyId: companies[0].id, name: "Ferreterías Industriales S.L.", taxId: "B33334444", email: "pedidos@ferrind.es", paymentTermsDays: 15 },
    { companyId: companies[1].id, name: "Pinturas Mediterráneo", taxId: "B55556666", email: "info@pintmed.es", paymentTermsDays: 30 },
    { companyId: companies[2].id, name: "Electrodomésticos Pro S.L.", taxId: "B77778888", email: "ventas@electropro.es", paymentTermsDays: 30 },
  ]).returning();

  await db.insert(categoriesTable).values([
    { companyId: companies[0].id, name: "Material de obra", type: "expense" },
    { companyId: companies[0].id, name: "Subcontratas", type: "expense" },
    { companyId: companies[0].id, name: "Combustible", type: "expense" },
    { companyId: companies[0].id, name: "Seguros", type: "expense" },
    { companyId: companies[0].id, name: "Alquiler maquinaria", type: "expense" },
    { companyId: companies[1].id, name: "Suministros", type: "expense" },
    { companyId: companies[1].id, name: "Servicios profesionales", type: "expense" },
    { companyId: companies[2].id, name: "Mantenimiento", type: "income" },
    { companyId: companies[0].id, name: "Obra nueva", type: "income" },
    { companyId: companies[0].id, name: "Reforma", type: "income" },
  ]);

  const projects = await db.insert(projectsTable).values([
    { companyId: companies[0].id, clientId: clients[0].id, name: "Reforma Plaza Central", description: "Reforma integral de la plaza central" },
    { companyId: companies[0].id, clientId: clients[1].id, name: "Urbanización Las Encinas", description: "Construcción de 20 viviendas unifamiliares" },
    { companyId: companies[1].id, clientId: clients[2].id, name: "Edificio Oficinas Torre Sur", description: "Venta y gestión del edificio" },
    { companyId: companies[2].id, clientId: clients[3].id, name: "Mantenimiento Hotel 2026", description: "Contrato anual de mantenimiento" },
    { companyId: companies[3].id, clientId: clients[4].id, name: "Autovía Norte Tramo 3", description: "Construcción tramo 3 de la autovía norte" },
  ]).returning();

  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; };
  const daysFromNow = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };

  const invoices = await db.insert(invoicesTable).values([
    { companyId: companies[0].id, clientId: clients[0].id, projectId: projects[0].id, invoiceNumber: "2026-001", status: "issued", issueDate: daysAgo(30), dueDate: daysFromNow(30), subtotal: "15000.00", taxRate: "21.00", taxAmount: "3150.00", total: "18150.00", paidAmount: "0.00" },
    { companyId: companies[0].id, clientId: clients[1].id, projectId: projects[1].id, invoiceNumber: "2026-002", status: "paid", issueDate: daysAgo(60), dueDate: daysAgo(30), subtotal: "45000.00", taxRate: "21.00", taxAmount: "9450.00", total: "54450.00", paidAmount: "54450.00" },
    { companyId: companies[0].id, clientId: clients[0].id, projectId: projects[0].id, invoiceNumber: "2026-003", status: "issued", issueDate: daysAgo(10), dueDate: daysFromNow(5), subtotal: "8500.00", taxRate: "21.00", taxAmount: "1785.00", total: "10285.00", paidAmount: "0.00" },
    { companyId: companies[1].id, clientId: clients[2].id, projectId: projects[2].id, invoiceNumber: "2026-001", status: "partially_paid", issueDate: daysAgo(45), dueDate: daysAgo(5), subtotal: "120000.00", taxRate: "21.00", taxAmount: "25200.00", total: "145200.00", paidAmount: "72600.00" },
    { companyId: companies[2].id, clientId: clients[3].id, projectId: projects[3].id, invoiceNumber: "2026-001", status: "issued", issueDate: daysAgo(15), dueDate: daysFromNow(15), subtotal: "3200.00", taxRate: "21.00", taxAmount: "672.00", total: "3872.00", paidAmount: "0.00" },
    { companyId: companies[3].id, clientId: clients[4].id, projectId: projects[4].id, invoiceNumber: "2026-001", status: "issued", issueDate: daysAgo(20), dueDate: daysFromNow(70), subtotal: "250000.00", taxRate: "21.00", taxAmount: "52500.00", total: "302500.00", paidAmount: "0.00" },
    { companyId: companies[0].id, clientId: clients[1].id, projectId: projects[1].id, invoiceNumber: "2026-004", status: "draft", issueDate: today.toISOString().split("T")[0], subtotal: "12000.00", taxRate: "21.00", taxAmount: "2520.00", total: "14520.00", paidAmount: "0.00" },
  ]).returning();

  await db.insert(invoiceItemsTable).values([
    { invoiceId: invoices[0].id, description: "Demolición y preparación terreno", quantity: "1", unitPrice: "8000.00", amount: "8000.00", sortOrder: 0 },
    { invoiceId: invoices[0].id, description: "Cimentación fase 1", quantity: "1", unitPrice: "7000.00", amount: "7000.00", sortOrder: 1 },
    { invoiceId: invoices[1].id, description: "Estructura completa lote 1-5", quantity: "5", unitPrice: "9000.00", amount: "45000.00", sortOrder: 0 },
    { invoiceId: invoices[2].id, description: "Pavimentación zona norte", quantity: "1", unitPrice: "8500.00", amount: "8500.00", sortOrder: 0 },
    { invoiceId: invoices[3].id, description: "Venta local comercial planta baja", quantity: "1", unitPrice: "120000.00", amount: "120000.00", sortOrder: 0 },
    { invoiceId: invoices[4].id, description: "Mantenimiento preventivo marzo", quantity: "1", unitPrice: "3200.00", amount: "3200.00", sortOrder: 0 },
    { invoiceId: invoices[5].id, description: "Certificación obra tramo 3 - fase 1", quantity: "1", unitPrice: "250000.00", amount: "250000.00", sortOrder: 0 },
    { invoiceId: invoices[6].id, description: "Acabados interiores lote 6", quantity: "1", unitPrice: "12000.00", amount: "12000.00", sortOrder: 0 },
  ]);

  await db.insert(documentSeriesTable).values([
    { companyId: companies[0].id, type: "invoice", prefix: "2026-", nextNumber: 5, year: 2026 },
    { companyId: companies[1].id, type: "invoice", prefix: "2026-", nextNumber: 2, year: 2026 },
    { companyId: companies[2].id, type: "invoice", prefix: "2026-", nextNumber: 2, year: 2026 },
    { companyId: companies[3].id, type: "invoice", prefix: "2026-", nextNumber: 2, year: 2026 },
  ]);

  await db.insert(vendorInvoicesTable).values([
    { companyId: companies[0].id, supplierId: suppliers[0].id, invoiceNumber: "CN-2026-112", status: "pending", issueDate: daysAgo(20), dueDate: daysFromNow(10), subtotal: "4500.00", taxRate: "21.00", taxAmount: "945.00", total: "5445.00", paidAmount: "0.00", description: "Cemento Portland 200 sacos" },
    { companyId: companies[0].id, supplierId: suppliers[1].id, invoiceNumber: "FI-0456", status: "paid", issueDate: daysAgo(45), dueDate: daysAgo(15), subtotal: "1200.00", taxRate: "21.00", taxAmount: "252.00", total: "1452.00", paidAmount: "1452.00", description: "Herramientas varias" },
    { companyId: companies[1].id, supplierId: suppliers[2].id, invoiceNumber: "PM-2026-089", status: "pending", issueDate: daysAgo(10), dueDate: daysFromNow(20), subtotal: "2800.00", taxRate: "21.00", taxAmount: "588.00", total: "3388.00", paidAmount: "0.00", description: "Pintura exterior edificio" },
    { companyId: companies[2].id, supplierId: suppliers[3].id, invoiceNumber: "EP-7821", status: "pending", issueDate: daysAgo(5), dueDate: daysFromNow(25), subtotal: "1800.00", taxRate: "21.00", taxAmount: "378.00", total: "2178.00", paidAmount: "0.00", description: "Recambios climatización" },
  ]);

  await db.insert(expensesTable).values([
    { companyId: companies[0].id, description: "Gasolina camiones obra", amount: "350.00", taxRate: "21.00", taxAmount: "73.50", total: "423.50", expenseDate: daysAgo(3), status: "paid", paidAmount: "423.50" },
    { companyId: companies[0].id, description: "Seguro RC anual", amount: "1200.00", taxRate: "21.00", taxAmount: "252.00", total: "1452.00", expenseDate: daysAgo(15), status: "paid", paidAmount: "1452.00" },
    { companyId: companies[2].id, description: "Gasolina furgoneta servicio", amount: "85.00", taxRate: "21.00", taxAmount: "17.85", total: "102.85", expenseDate: daysAgo(1), status: "pending", paidAmount: "0.00" },
    { companyId: companies[3].id, description: "Alquiler grúa torre mes marzo", amount: "4500.00", taxRate: "21.00", taxAmount: "945.00", total: "5445.00", expenseDate: daysAgo(5), status: "pending", paidAmount: "0.00" },
  ]);

  const bankAccounts = await db.insert(bankAccountsTable).values([
    { companyId: companies[0].id, name: "Cuenta principal CaixaBank", bankName: "CaixaBank", iban: "ES91 2100 0418 4502 0005 1332", currentBalance: "45230.50" },
    { companyId: companies[0].id, name: "Cuenta nóminas BBVA", bankName: "BBVA", iban: "ES80 0182 2370 4200 1234 5678", currentBalance: "12500.00" },
    { companyId: companies[1].id, name: "Cuenta operativa Santander", bankName: "Santander", iban: "ES68 0049 2352 0821 0000 1234", currentBalance: "78900.00" },
    { companyId: companies[2].id, name: "Cuenta Sabadell", bankName: "Sabadell", iban: "ES12 0081 7432 2800 0123 4567", currentBalance: "15600.00" },
    { companyId: companies[3].id, name: "Cuenta UTE Bankinter", bankName: "Bankinter", iban: "ES55 0128 0001 2300 0000 1234", currentBalance: "125000.00" },
  ]).returning();

  await db.insert(tasksTable).values([
    { companyId: companies[0].id, title: "Enviar certificación obra fase 2", status: "pending", priority: "high", dueDate: daysFromNow(3) },
    { companyId: companies[0].id, title: "Revisar presupuesto lote 7-10", status: "pending", priority: "normal", dueDate: daysFromNow(7) },
    { companyId: companies[1].id, title: "Reunión con notario venta local", status: "pending", priority: "high", dueDate: daysFromNow(2) },
    { companyId: companies[2].id, title: "Llamar a proveedor climatización", status: "pending", priority: "normal", dueDate: daysFromNow(1) },
    { companyId: companies[3].id, title: "Preparar informe mensual UTE", status: "pending", priority: "high", dueDate: daysFromNow(5) },
    { companyId: companies[0].id, title: "Solicitar permiso obra zona sur", status: "completed", priority: "normal", dueDate: daysAgo(5) },
  ]);

  res.json({ success: true });
});

export default router;
