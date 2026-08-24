# Vestra — working notes

Multi-vendor fashion marketplace. Storefront, seller console and admin console
on one Next.js 16 App Router codebase.

## Before you write any Next.js code

**Read `node_modules/next/AGENTS.md` and the relevant guide in
`node_modules/next/dist/docs/`.** This is Next 16 and several APIs changed in
ways that predate most training data:

| Thing | Current shape |
|---|---|
| Edge routing | `src/proxy.ts` — `middleware.ts` is deprecated |
| `cookies()`, `headers()`, `params`, `searchParams` | all **async**, must be awaited |
| Caching | Cache Components (`cacheComponents: true`) + `"use cache"` |
| Invalidation | `updateTag` (Server Actions, read-your-writes), `revalidateTag(tag, 'max')` (stale-while-revalidate), `refresh()` |
| Cached scopes | cannot read `cookies()`/`headers()`/`searchParams` — read outside, pass as arguments |

## Environment

- **Node 24 is required** (`.nvmrc` pins 24.11.0). The shell here defaults to
  Node 16, which Next 16 refuses to run on. Either `nvm use 24.11.0` or prefix
  commands with the absolute path to the v24 binary.
- **MongoDB** must be running. Default `mongodb://127.0.0.1:27017`, database
  `vestra`. Configure via `MONGODB_URI` / `MONGODB_DB` in `.env.local`.
- Package manager is **npm** (the brief suggested pnpm; the lockfile is npm's
  and switching mid-project buys nothing).

```bash
npm run seed         # rebuild the demo dataset (destructive)
npm run dev
npm run verify       # typecheck + lint + build, in one go

# With a server running (npm run start):
npm run smoke        # drives the purchase funnel in a real browser
npm run smoke:rbac   # checks every role reaches only what it should
npm run screenshot   # captures key routes, for reviewing visual changes
```

**Verify visually, not just structurally.** A storefront cannot be reviewed from
a diff. `npm run screenshot` exists because the first pass of this UI shipped
flat vector clipart on a cramped type scale and it took a screenshot to notice.

**Free the port before restarting.** `next start` fails with EADDRINUSE and the
old build keeps serving, which silently invalidates any smoke run against it:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## The one thing that shapes the data layer

**The target MongoDB is standalone, so multi-document transactions do not
exist.** Nothing in `src/server/` may assume a session or `withTransaction`.
Correctness is obtained three ways instead, and new code must follow the same
pattern:

1. **Single-document atomicity.** Inventory lives inside the variant
   subdocument of a product, so every stock movement is one conditional
   `updateOne` — the check and the decrement are the same operation. See
   `src/server/repositories/inventory.ts`. This is what prevents overselling.
2. **Unique indexes as constraints.** Duplicate slugs, SKUs, order numbers and
   coupon redemptions are rejected by the database, not by an application check
   that races. See `src/server/db/indexes.ts`.
3. **Compensating actions.** Anything spanning documents or systems runs
   through `runSaga` in `src/server/db/saga.ts`, which unwinds completed steps
   in reverse and journals whatever it could not undo.

If the deployment ever moves to a replica set, the seam is the repository
layer; nothing above it changes.

## Cache Components rules that bite

- **A layout that reads cookies makes its whole subtree dynamic.** Both console
  layouts therefore read nothing in the layout body — the nav is static and the
  per-user pieces (store name, queue badges, current user) are `<Suspense>`
  islands. Each page enforces its own permission inside its own boundary.
- **Never `await params` or `searchParams` in a page body.** Pass the promise
  into the suspended child. Awaiting it in the shell stops the route
  prerendering and fails the build.
- **`export const dynamic` is rejected.** Use `<Suspense>` boundaries, or
  `connection()` when rendering genuinely must wait for a request.
- **`authInterrupts: true` is required** for `forbidden()` and `unauthorized()`
  to render their boundaries. Without it both are inert and every
  `requirePermission` call silently passes — which is exactly the hole
  `npm run smoke:rbac` was written to catch.
- **Reading the clock during render is impure** and the React compiler lint will
  fail the build. Derive time-dependent values in the service layer (see
  `returnWindowOpen` in `services/orders.ts`).

## Conventions

- **Money is always integer paise.** Never store, sum or transport float
  rupees. Convert only at the input boundary (`toPaise`) and the render
  boundary (`formatMoney`). See `src/lib/money.ts`.
- **Documents are domain entities.** `_id` mirrors the entity's own `id`; there
  is no mapper. Read via `toEntity`/`toEntities`, write via `toDoc`.
- **The server asserts, the UI only hides.** Every data-access function calls
  `requirePermission`. A hidden button is a courtesy, never a control —
  `proxy.ts` is a redirect layer, not a security boundary.
- **Seller queries are scoped from the session**, never from a request
  parameter. Use `requireSeller()` and take `sellerId` from its return value.
- **Order items freeze their own price snapshot.** Later catalogue edits must
  never alter historical orders.
- **No business logic in JSX.** Services in `src/server/`, presentation in
  components.
- **No inline mock data in components.** Everything comes through the service
  layer.

## Deliberate deviations from the brief

- **Public store pages live at `/store/[slug]`, not `/seller/[slug]`.** The
  brief lists both `/seller/[slug]` (public storefront) and `/seller/products`
  (console) — these collide, and a seller whose slug is "orders" would shadow a
  console route. `/store/[slug]` is unambiguous and matches the `SellerStore`
  concept in the domain model.
- **Auth is a jose-based session rather than NextAuth v5.** The brief allows
  "or equivalent". NextAuth v5 is still beta against Next 16, and sessions here
  need role-switching plus seller scoping that is simpler to own outright.
- **Product photography is representative stock, not the real product.** Images
  come from a pool of verified Unsplash photographs matched by product family
  (`server/seed/photos.ts`). They stand in for seller uploads and must be
  replaced before launch. `MEDIA_SOURCE=generated` falls back to the
  first-party SVG renderer in `app/api/media`, which needs no network — use it
  offline or in CI.
- **Media URLs carry a renderer version** (`MEDIA_VERSION`). They are served
  immutable for a year, so changing the renderer without changing the URL would
  leave caches serving the old art forever. Bump it on any visual change.

## Layout

```
src/
  app/(storefront|seller|admin|auth)/   route groups per application
  components/{ui,commerce,skeletons,layout}/
  config/          business constants and site metadata
  domain/          types, enums, state machines, attribute vocabulary
  lib/             money, pricing, coupons, slugs, formatting, ids
  server/
    auth/          rbac, jwt, session, password
    db/            client, collections, indexes, sequences, saga
    repositories/  data access
    seed/          deterministic dataset generator
  stores/          zustand
```

## Demo accounts

All use password `vestra123`.

| Role | Email |
|---|---|
| Super admin | `superadmin@vestra.test` |
| Admin | `admin@vestra.test` |
| Operations / Finance / Support | `ops@` / `finance@` / `support@vestra.test` |
| Catalogue / Marketing | `catalog@` / `marketing@vestra.test` |
| Seller | `mora01@seller.vestra.test` |
| Customer | `ananya.iyer@example.com` |

## Working rhythm

After each phase: `npm run build`, `npm run typecheck`, `npm run lint`, fix
everything, commit, and update `PROGRESS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
