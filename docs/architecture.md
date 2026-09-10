# RubTang foundation

Current slices: registration, sessions, tenant/branch boundaries, catalog editing and
inventory receiving/adjustments. This is a development foundation, not a production-ready POS.

## Implemented

- npm workspaces: React/Vite and NestJS; Node.js 22.12+ (CI uses 24).
- PostgreSQL through pinned Prisma 6 baseline.
- Root overrides pin patched Multer 2.3+ and DeepmergeTS 8+. Recheck these when upgrading
  NestJS or Prisma, and validate Prisma commands after dependency changes.
- Global user identity and tenant-scoped membership/branch assignments. Registration
  creates one owner, one tenant and one branch. Login selects the first membership;
  invitations and switching tenants are pending.
- Argon2id passwords, random session tokens stored as SHA-256 hashes, 12-hour expiry,
  HttpOnly/SameSite cookie, Secure in production, logout revocation.
- Same-origin API proxy. Every mutation requires an exact allowed Origin.
- Product queries scoped using authenticated session; caller tenant IDs rejected.
- Composite foreign keys reject cross-tenant branch assignments and inventory references.
- Product creation/editing and audit entry share a transaction. Editing captures old/new values.
- InventoryBalance and StockMovement share composite tenant/branch/product references.
  Movement actor membership also belongs to the same tenant.
- Receiving and delta adjustments use Serializable transactions, bounded conflict retries,
  exact Decimal arithmetic, nonnegative balance checks and atomic audit writes.
- `(tenantId, requestId)` is unique. Replay compares branch, product, type, quantity,
  note and actor. Only the original payload returns the existing movement.
- Owners can write stock in their tenant's branches; managers only in assigned branches;
  cashiers can read assigned branches but cannot write stock.
- Stock history uses a `(createdAt, id)` keyset cursor, 50 rows per page. Displayed product
  names and actor names reflect their current values; IDs and stock values are retained.
- Embedded PostgreSQL 17 is a development/test dependency, never the production database.
- Search returns at most the newest 100 matching products; pagination is pending.

## Next slices

1. PostgreSQL RLS using a non-owner runtime role, transaction-local tenant context and
   RLS-specific integration tests. Current isolation uses API scope and FK constraints;
   RLS is **not enabled yet**. Scope future queues, storage and cache as well.
2. Category, cost, branch management, staff invitations and permissions.
3. Supplier, purchase orders, goods receiving documents and inter-branch transfers.
4. Checkout: server pricing, sale snapshots, decimal arithmetic, idempotency, atomic
   stock movements, shift/cash drawer, refunds and receipt printing.
5. Transactional outbox, worker/Redis, LINE and exports.

No checkout writes are exposed yet. Manual receiving does not create a purchase order,
supplier bill or cost valuation. The UI currently
uses plain CSS; Tailwind/shadcn, Router and form libraries can be added as screens grow.
Zustand is reserved for the future checkout cart.

## Before production

- Add RLS and concurrent checkout tests. API role must not
  own tables or have BYPASSRLS. Never leave tenant context attached to a pooled connection.
- Configure HTTPS and a same-origin proxy for `/api`; set WEB_ORIGIN exactly.
  Change API bind address for container deployment.
- Replace local database credentials; configure and verify backup/restore.
- Add shared rate limiting for multiple instances, trusted proxy configuration,
  per-account login controls, session cleanup and monitoring.
- Add email verification, password recovery, trial/billing enforcement.
- Verify keyboard and assistive technology behavior across target devices.
- Offline checkout requires conflict and reconciliation rules first.
