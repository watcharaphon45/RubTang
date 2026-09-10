# RubTang POS

Multi-tenant POS foundation built with React, NestJS and PostgreSQL.

## Current functionality

- Register a shop, its first branch and owner account.
- Log in/out using server-side sessions.
- View assigned branches and search tenant-scoped products.
- Add/edit products and enable/disable them as owner, with before/after audit records.
- Receive stock and adjust quantities in an authorized branch (owner or assigned manager).
- View current stock and paginated movement history with quantities, reasons and actors.
- Retry a stock request safely: the same request ID cannot credit inventory twice.

Checkout, stock transfers, purchase orders, refunds, CRM and subscriptions are not implemented yet.
See [architecture and remaining work](docs/architecture.md).
Original requirements: [project scope](docs/project-scope.md).

## Local setup

Requires Node.js 22.12+ (24 LTS recommended). Use bundled PostgreSQL for local development,
an existing PostgreSQL 17 instance, or Docker Desktop for the supplied database.
On PowerShell use `npm.cmd` if script policy blocks `npm.ps1`.

```powershell
npm.cmd install
Copy-Item apps/api/.env.example apps/api/.env
docker compose up -d
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

If PostgreSQL is already installed, skip Docker and set `DATABASE_URL` in `apps/api/.env`
to a development database. The Docker credentials are for local use only.

### Without Docker or a PostgreSQL installation

After `npm.cmd install`, run `npm.cmd run db:local` in a separate terminal and keep it open.
This runs PostgreSQL 17 bound to `127.0.0.1:5432`, using the credentials in `.env.example`.
Data stays in `.local/postgres` when stopped with Ctrl+C. It does not install a system service.
If port 5432 is occupied, stop the other local database or use that database instead.

In another terminal, copy `.env.example` only if you do not already have an `.env`, then run:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

After updating an existing checkout, run `db:generate` and `db:migrate` to apply the new
inventory migration before starting the app. The migration preserves existing products.

Open **http://localhost:5173** and choose **สร้างร้านใหม่**. No default account is created.
Use at least 12 characters for the password. API: `127.0.0.1:3001`.
Use `localhost` in the browser URL to match `WEB_ORIGIN`.

## Checks

```powershell
npm.cmd run db:generate
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

Unit tests cover tenant scoping, branch permissions, sessions, input validation and
stock arithmetic. Integration tests start an isolated real PostgreSQL database and API,
apply all migrations, and test concurrent receipts, duplicate requests, rollback on audit
failure, cross-tenant foreign keys, permissions, product edits, history cursors and sessions.
The test database is independent of `.env` and is retained under `.local/integration-*`
for inspection. Test processes stop on completion. Tests need permission to spawn processes.
Browser automation and checkout tests are not implemented yet.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Process health |
| POST | `/api/auth/register` | Create owner, tenant and first branch |
| POST | `/api/auth/login` | Create session |
| GET | `/api/auth/me` | User, tenant and permitted branches |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/products?branchId=...&search=...` | Up to 100 matching products |
| POST | `/api/products` | Create product; owner only |
| POST | `/api/products/:id` | Edit product including `active`; owner only |
| POST | `/api/inventory/movements` | Receive or adjust stock; owner/assigned manager |
| GET | `/api/inventory/movements?branchId=...` | Movement history; 50 per page |

Local mutation requests require `Origin: http://localhost:5173`.
Product prices are decimal strings such as `"25.00"`. Tenant identity comes from
the session and must not be included in product payloads.

Stock request example:

```json
{
  "requestId": "<new UUID, reused when retrying the same request>",
  "branchId": "<branch UUID>",
  "productId": "<product UUID>",
  "type": "RECEIVE",
  "quantity": "10.125",
  "note": "Delivery DN-001"
}
```

For `ADJUSTMENT`, quantity is a **delta**, not the target balance: `"-2"` removes two units.
Zero, insufficient stock, inactive products and changed payloads with reused request IDs
are rejected. Stock quantities support three decimal places. To reverse an incorrect
receipt, create a compensating adjustment with a reason; existing history is retained.
History supports optional `productId` and an opaque `cursor` returned as `nextCursor`.
