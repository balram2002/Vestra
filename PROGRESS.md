# Progress

Living checklist mirroring the build phases. Updated as features land.

**Status:** Phases 1–3 substantially complete. Storefront is navigable end to
end against real MongoDB data. Checkout stops at the delivery step; seller and
admin consoles are not started.

**Green as of last commit:** `next build` (187 pages), `tsc --noEmit`, `eslint` —
all clean. Inventory concurrency and auth verified by script (see Verification).

Legend: `[x]` done · `[~]` partial · `[ ]` not started

---

## Phase 1 — Architecture, routing, tokens, auth foundation

- [x] Reference project inspected (`C:\Projects\Shopix\frontend`, structure only)
- [x] Node 24 / MongoDB environment verified and documented in `AGENTS.md`
- [x] Next 16 bundled docs consulted; deviations recorded
- [x] Git initialised, committing per phase
- [x] Design tokens — colour, type, spacing, radii, shadows, motion, dark mode
- [x] Semantic token aliases exposed as Tailwind utilities (`bg-canvas`, `text-ink`…)
- [x] Domain model: entities, enums, state machines, attribute vocabulary
- [x] Pricing engine, coupon evaluation, paise-based money handling
- [x] scrypt password hashing with upgradeable work factor
- [x] jose sessions, split so `proxy.ts` verifies without touching Mongo
- [x] RBAC grant table; permissions re-derived server-side per request
- [x] `proxy.ts` route protection (replaces `middleware.ts`)
- [x] Login, register, forgot-password pages + sign-in/register/sign-out actions
- [x] `unauthorized.tsx`, `forbidden.tsx`, `not-found.tsx`, `error.tsx`
- [ ] Password reset email delivery (needs notification infrastructure)
- [ ] Email/phone verification

## Phase 2 — Design system, layout, service layer, data

- [x] MongoDB client (pooled, HMR-safe, lazy)
- [x] 40+ collections; index definitions treated as schema
- [x] Atomic inventory repository — reserve / release / commit / restock / write-off
- [x] Saga runner + journal for cross-document units of work
- [x] Gapless per-financial-year sequence counters
- [x] Deterministic seed — 42 categories, 20 brands, 15 stores, 786 products,
      6,271 variants, 5,180 reviews, 6 coupons, 11 CMS pages, homepage sections
- [x] `npm run seed` CLI with a Node resolver hook for the `@/` alias
- [x] `/api/media` SVG image route (deterministic, immutably cached)
- [x] UI primitives — button, badge, input, skeleton
- [x] Skeletons matching final layout (product card, grid, rail, page shells)
- [x] Header with data-driven mega menu, mobile drawer, footer
- [x] Catalogue service — `"use cache"` + `cacheTag` per product/category/brand
- [x] Listing service — one query path for category, search, brand, store
- [x] Cart service with live re-derivation and explicit issue detection
- [x] Wishlist service (guest + user, merged on sign-in)
- [x] CMS/content service
- [x] Top progress bar (custom, delay-gated)
- [x] Toaster wired to design tokens
- [ ] `useLinkStatus()` per-link pending indicators
- [ ] TanStack Query layer for client-heavy surfaces
- [ ] Zustand stores (not yet needed — state is URL- and server-driven)
- [ ] View Transitions / shared-element transitions

## Phase 3 — Storefront core

- [x] Home — rendered entirely from CMS section data, no hardcoded layout
- [x] Category listing with facets, sort, pagination, SEO copy
- [x] Search with facets and a distinct no-query state
- [x] PDP — gallery, variant selection, reviews, fit signal, related, JSON-LD
- [x] Product card / grid / rail
- [x] Bag — multi-seller grouping, per-line issues, save for later
- [x] Wishlist
- [x] Brand pages + brand index
- [x] Store pages + seller directory
- [x] Policy and help pages (CMS-backed, real copy)
- [x] Account home, addresses, orders (empty states)
- [x] Loading skeletons and empty states on every built route
- [ ] Pincode serviceability check on PDP
- [ ] Size chart drawer (button present, opens a placeholder toast)
- [ ] Search suggestions / autocomplete
- [ ] Recently viewed
- [ ] Add-address form (list renders; the add button is disabled)

## Phase 4 — Checkout, payments, orders

- [~] Checkout step 1 — address selection and delivery speed (live)
- [ ] Payment step, gateway abstraction, mock provider
- [ ] Order placement saga (reserve → charge → create → confirm)
- [ ] Webhook handlers with replay defence (`webhookEvents` unique index ready)
- [ ] Order history, detail, status timeline
- [ ] Cancellation, returns, exchanges, refunds
- [ ] Section 10 edge cases end to end

## Phase 5 — Seller console

- [ ] Everything

## Phase 6 — Admin console

- [ ] Everything

## Phase 7 — CMS, notifications, support, audit

- [x] CMS page storage and rendering
- [ ] Homepage/banner/navigation editing UI
- [ ] Notification infrastructure + preferences
- [ ] Help centre ticketing
- [ ] Audit log writes on sensitive actions

## Phase 8 — SEO, a11y, responsive, performance

- [x] `generateMetadata` on product, category, brand, store, CMS routes
- [x] JSON-LD — Product, Offer/AggregateOffer, AggregateRating, Review,
      BreadcrumbList, ItemList, Store
- [x] Canonicals; filtered and deep-paginated listings set `noindex, follow`
- [x] Slug-history resolution with 301 redirects
- [x] `generateStaticParams` on category, product, brand, store, CMS routes
- [ ] `Organization` + `WebSite` sitewide (builders written, not yet mounted)
- [ ] Segmented sitemap index + `robots.ts`
- [ ] Dynamic OG images
- [ ] Measured CWV audit against the budget
- [ ] Full accessibility audit
- [ ] `hreflang` / locale scaffolding

## Phase 9 — QA

- [x] Build, typecheck and lint green
- [x] Route smoke test — all built routes 200, unknown route 404
- [x] Inventory concurrency test — 40 racing reservations against 5 units
- [x] Auth verification — hashing, rejection, role resolution
- [ ] Vitest unit coverage on pricing, coupons, state machines
- [ ] Playwright e2e on the full funnel
- [ ] Manual pass across every role and viewport

---

## Verification run at last commit

```
40 concurrent reservations against 5 available units
  succeeded: 5    refused: 35    oversold: no    conserved: yes
10 concurrent releases against 5 reserved
  applied: 5      final available: 5 (not inflated)

auth: correct password accepted, wrong rejected, malformed hash rejected
      CUSTOMER -> / (6 perms), SELLER -> /seller (16), ADMIN -> /admin (35)

routes: 14 storefront paths 200, unknown path 404
        /account /admin /seller -> 307 to /login?next=…
PDP: JSON-LD Product + Offer + BreadcrumbList present, canonical present
```

---

## Known gaps and decisions

- **Checkout stops after the delivery step.** The "Continue to payment" control
  is disabled and says so rather than being a live-looking button that does
  nothing. Payment, order placement and confirmation are the next milestone.
- **Orders, shipments, settlements and audit logs are not seeded.** They should
  be produced by the order service so the generated history matches the code
  path the app actually uses. Until then `/orders` and both consoles have
  nothing to show.
- **Standalone MongoDB, no transactions.** Handled by design — atomic
  single-document updates plus compensating sagas. Verified above. Moving to a
  replica set later is a repository-layer change only.
- **`typedRoutes` is off.** It only validates string literals, and nearly every
  link here is composed at runtime from a slug or a filter. See `next.config.ts`
  for the full reasoning.
- **`/store/[slug]` replaces `/seller/[slug]`** for public store pages, because
  the brief's two `/seller/*` routes collide. See `AGENTS.md`.
- **Size guide button** opens an informational toast rather than the chart
  drawer, which lands with the PDP polish pass.
