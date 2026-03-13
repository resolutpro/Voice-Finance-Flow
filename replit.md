# FinanzasPro - App Multiempresa de Facturación, Tesorería y Previsión de Caja

## Overview

Multi-company invoicing, treasury and cash forecast web application. Supports 4+ entities including UTEs (joint ventures). Voice-first input for creating invoices, expenses, tasks and registering payments. Built with React + TypeScript frontend and Express + PostgreSQL backend in a pnpm monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Voice**: Web Speech API (browser-native speech-to-text)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (all backend routes)
│   └── facturacion/        # React frontend (main web app at /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

All tables in `lib/db/src/schema/`:

- **companies** - Multi-company core (name, taxId, address, isUte flag)
- **clients** - Clients per company (name, taxId, contact, payment terms)
- **suppliers** - Suppliers per company
- **projects** - Projects linked to company + client
- **categories** - Expense/income categories
- **invoices** - Issued invoices (auto-numbering, status, tax calc)
- **invoice_items** - Line items per invoice
- **vendor_invoices** - Received invoices from suppliers
- **expenses** - Quick expenses
- **bank_accounts** - Bank accounts per company with balance
- **cash_movements** - All cash movements (income/expense) linked to documents
- **tasks** - Operational tasks with priority and due dates
- **document_series** - Auto invoice numbering per company/year
- **users** - User accounts (email, name, role, defaultCompanyId)
- **receivables** - Client receivables tracking (linked to invoices)
- **payables** - Supplier payables tracking (linked to vendor invoices)

## API Routes

All routes in `artifacts/api-server/src/routes/`:

- `GET/POST /api/companies` - Company CRUD
- `GET/POST /api/clients` - Client CRUD (filterable by companyId)
- `GET/POST /api/suppliers` - Supplier CRUD
- `GET/POST /api/projects` - Project CRUD
- `GET/POST /api/categories` - Category CRUD
- `GET/POST /api/invoices` - Invoice CRUD with line items, auto tax calc
- `GET /api/invoices/next-number` - Auto invoice numbering
- `PATCH /api/invoices/:id/status` - Status updates
- `POST /api/invoices/:id/payment` - Register payment (updates balance)
- `GET/POST /api/vendor-invoices` - Vendor invoice CRUD
- `POST /api/vendor-invoices/:id/payment` - Register vendor payment
- `GET/POST /api/expenses` - Expense CRUD
- `GET/POST /api/bank-accounts` - Bank account CRUD
- `GET/POST /api/cash-movements` - Cash movement CRUD (updates balance)
- `GET /api/dashboard` - Dashboard KPIs (balance, receivables, payables, alerts)
- `GET /api/cash-forecast` - Cash forecast by weeks
- `GET/POST /api/tasks` - Task CRUD
- `POST /api/voice/parse` - Voice command NLP parsing
- `GET /api/invoices/:id/pdf` - Download invoice PDF
- `GET/POST /api/receivables` - Receivables CRUD
- `GET/POST /api/payables` - Payables CRUD
- `POST /api/seed` - Seed demo data (blocked in production)

## Frontend Pages

- `/` - Dashboard with KPIs, balance by company, weekly due items, recent invoices
- `/invoices` - Invoice list with create modal, PDF download, status management (draft→issued→paid/overdue/cancelled)
- `/purchases` - Vendor invoices and quick expenses (tabbed view)
- `/treasury` - Bank accounts with balances, cash movements
- `/forecast` - Cash forecast chart (Recharts) with weekly projections
- `/tasks` - Kanban-style task board (pending/in-progress/completed)

## Key Features

- **Multi-company**: Every record belongs to a company. Company selector in header filters all views. Consolidated group view available.
- **Voice input**: Floating microphone button uses Web Speech API. Parsed by backend NLP into structured actions. Shows editable preview before saving.
- **Auto-calculation**: Tax amounts, totals, invoice numbering all automatic (read-only preview; number reserved atomically at creation)
- **Invoice PDF**: Generate and download professional PDF invoices with company/client details, line items, and totals
- **Invoice lifecycle**: Status transitions (draft→issued→paid) with automatic overdue detection for past-due invoices
- **Treasury tracking**: Payments on invoices automatically update bank balances and create cash movements
- **Cash forecast**: Projects balance based on pending receivables/payables due dates

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` with `composite: true`. Root `tsconfig.json` lists libs as project references. Run `pnpm run typecheck` from root.

## Commands

- `pnpm run typecheck` - Full typecheck
- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API types
- `pnpm --filter @workspace/db run push` - Push DB schema
- `pnpm --filter @workspace/api-server run dev` - Run API server
- `pnpm --filter @workspace/facturacion run dev` - Run frontend
