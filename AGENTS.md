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

## Shipping

**The courier owns the parcel's status, and the parcel's status owns the
items'.** Nothing marks an order item delivered directly. A scan moves the
shipment through `applyEvent` in `services/shipments.ts`, and that carries the
state onto the lines inside it. It is the single write path for parcel status —
webhook, polling reconciler and seller actions all route through it. Bypassing
it is how the order page and the tracking panel end up telling two stories.

- **Eshopbox is behind `ShippingProvider`.** Nothing above `server/shipping/`
  knows which courier is in use. Adding a second one is a new implementation of
  that interface, not a change to fulfilment.
- **`ESHOPBOX_MODE=simulation` is the default everywhere but production.** The
  simulated courier is not an always-succeeds stub: it refuses some pincodes,
  makes others prepaid-only, fails one delivery in sixteen and sends one parcel
  in fifty back RTO. Those are the branches with the most fragile UI, so a stub
  that never produced them would mean they shipped untested.
- **Courier scans are OBSERVATIONS, not decisions.** They may skip forward along
  the flow (`allowForwardSkip`), because a same-city parcel really does go from
  picked up to out for delivery with nothing between. Sellers, admins and
  customers still go through the strict adjacency rule.
- **Late and duplicate scans are normal.** `shouldAdvance` refuses to move a
  parcel backwards or past a terminal state; the webhook's unique index makes
  redelivery a no-op.
- **The webhook is never trusted unsigned.** It can mark an order DELIVERED,
  which starts the return clock and releases the seller's money.
- **AWBs encode their own issue time and zone**, which is what lets tracking be
  a pure function of the number — no server-side map, correct after a restart.
  If you change that layout, `decodeAwb` and the seeder both move with it.

## Exchanges

**An exchange is a variant swap, not a return plus a re-order.** The order item
stays; only the variant it will be fulfilled with changes. That is what keeps
the customer's original price, coupon share and tax snapshot intact.

- **The replacement is reserved at request time and released the moment the
  exchange dies.** Every exit path — reject, quality-check failure — must call
  `inventory.release`, or that unit stays invisible to shoppers forever.
- **Only equal-priced variants.** A different price means collecting or
  refunding money mid-flow; the customer is told to return and re-order.
- **Nothing ships before the quality check passes.** Otherwise a customer can
  hold both items.
- **Reverse legs read a different vocabulary.** On a RETURN shipment
  "delivered" means it reached the SELLER. `applyEvent` branches on
  `shipment.direction`; do not add a fourth direction without extending it.

## Money out: invoices and settlements

- **The SELLER is the supplier of record.** Invoices carry their GSTIN and run
  on a per-seller, per-financial-year series. Never introduce a shared series.
- **Invoice numbers are consumed exactly once.** `issueInvoice` is idempotent
  and returns the existing document; gaps in a series are a compliance problem.
- **An invoice is never edited.** A return raises a CREDIT NOTE against it.
- **Every figure comes from the order item's frozen snapshot**, so a reprint a
  year later is identical to the original.
- **A settlement claims what it settles** (`settlementId` on the seller order
  and on the return). That claim, not a flag, is what makes a run idempotent.
- **Only delivered money past the hold is paid.** Revenue is at risk of a
  return until the window closes, and clawing money back from sellers is where
  marketplace relationships end.

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
  `requireSeller()` also asserts the store was APPROVED — an applicant holds the
  SELLER role from the moment they apply, so the role alone does not mean they
  may trade. Only the onboarding screen itself may drop to the weaker
  `requireSellerAccount()`.
- **Granting a role means reissuing the session.** `proxy.ts` routes on the
  roles baked into the cookie and cannot reach the database, so any action that
  changes a user's own roles must call `refreshSession()` before redirecting, or
  the user keeps being routed as who they were.
- **A mutation that changes what a shopper sees must invalidate.** Every
  `"use cache"` scope has a `cacheLife` measured in hours, so without a call to
  `invalidate()` from `services/cache-invalidation.ts` the change is invisible
  until it expires on its own clock. Spend the tags from `cache-tags.ts`; do not
  invent strings. Stock is the exception that proves it: movements invalidate
  only when the change is VISIBLE (crossing zero, or inside the urgency band),
  because expiring every listing on every add-to-bag is not worth a number
  nobody renders.
- **A promotion's `value` means what `valueKind` says**, never what its `type`
  implies. Most promotion types name a scope or a campaign — SELLER_OFFER,
  FLASH_SALE, BANK_OFFER — and say nothing about whether the number is a
  percentage or paise. Guessing gave whole orders away for free.
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
