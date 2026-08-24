# Progress

Living checklist. Updated as work lands, not as it is planned.

**Verification commands.** `npm run verify` (typecheck + lint + build), then with
a server running: `npm run smoke` (purchase funnel) and `npm run smoke:rbac`
(role access).

Latest run: **build 253/253 routes · typecheck clean · lint clean · funnel 11/11
· RBAC 19/19**

---

## Phase 1-2 — Foundation, data layer, auth · **done**

- [x] Domain model: entities, enums, state machines, attribute vocabulary
- [x] Money as integer paise; pricing, tax and coupon engines
- [x] Design tokens; type scale rebuilt at 15px base with display sizes to 80px
- [x] MongoDB data layer — pooled client, typed collections, documents ARE domain entities
- [x] Indexes as schema: unique constraints, TTL sweeps, partial filters for nullable uniques
- [x] Atomic single-document inventory movements (no transactions needed)
- [x] Compensating-action saga runner with journal + stuck-saga recovery scan
- [x] Gapless per-financial-year sequence counters
- [x] scrypt passwords, jose sessions, RBAC grant table
- [x] `proxy.ts` route protection (replaces `middleware.ts`)
- [x] Deterministic seed: 42 categories, 20 brands, 15 stores, 770 products,
      6,384 variants, 5,300+ reviews, 1,400 orders, coupons, CMS content

## Phase 3 — Storefront core · **done**

- [x] Home composed from CMS sections; hero, category strip, rails, banner grid
- [x] Category, search, brand and store listing with facets, sort, pagination
- [x] PDP: gallery + buy box as one island (colour is shared state), reviews
- [x] Bag with per-line issue resolution; wishlist; guest-to-account merge
- [x] Real photography via a family-pooled source, SVG generator as fallback
- [x] Skeletons matched to final layout; route progress; per-link pending state

## Phase 4 — Checkout, payments, orders, returns · **done**

- [x] Gateway interface + mock provider that genuinely declines and stalls
- [x] Webhook as the authority: signature, replay index, idempotent apply
- [x] Order placement saga: revalidate → reserve → create unpaid → open payment
- [x] Per-line price/tax/seller snapshot frozen at purchase
- [x] Multi-seller order splitting with per-seller commission and payable
- [x] Checkout, payment step, confirmation, order history and detail
- [x] Status timeline that changes shape for exceptional flows
- [x] Per-item cancellation and returns; liability drives who pays
- [x] Quality check gates restock vs write-off; refunds through the gateway

## Phase 5 — Seller console · **done**

- [x] Shared console shell; static nav, per-user badges stream in
- [x] Dashboard: work queues above figures, revenue trend, best sellers
- [x] Fulfilment queue defaulting to "needs action", one legal next step per row
- [x] Products, inventory per size with inline stock editing
- [x] Returns queue with approve / reject / quality check
- [x] Earnings with the full payout arithmetic written out
- [x] Analytics and store settings

## Phase 6 — Admin console · **done**

- [x] Role-adaptive dashboard (queues for everyone, figures gated on permission)
- [x] Orders, payments ledger, returns across the platform
- [x] Products review queue, category tree
- [x] Sellers and users directories, contact details masked
- [x] Coupons, homepage composition, audit log, settings + RBAC matrix
- [x] `authInterrupts` enabled — without it `forbidden()` was inert and every
      permission check silently passed

---

## Not yet done

Honest list of what the brief asks for that is not built.

### Functional gaps

- [ ] **Shipments and manifests.** Order items transition to SHIPPED, but there
      is no shipment entity in use, no AWB, label, manifest or courier tracking
      screen. The domain types and status machine exist; the service does not.
- [ ] **Exchanges.** Returns and refunds work end to end. Exchange requests have
      types and states but no service or UI.
- [ ] **Settlements and invoices.** Earnings are computed and the hold period is
      modelled, but no settlement run creates payouts and no GST invoice is
      generated.
- [ ] **Notifications.** No in-app centre, no email or SMS adapters. Preferences
      are stored on the user but nothing reads them.
- [ ] **Support tickets.** Types and seed vocabulary exist; no ticket UI.
- [ ] **Seller onboarding and KYC submission flow.** Sellers are seeded as
      approved; there is no application journey.
- [ ] **Product create/edit for sellers.** The catalogue is read-only in the
      console — no listing form, no media upload, no approval submission.
- [ ] **Admin write actions.** Approve a listing, suspend a seller, issue a
      manual refund: all read-only today, and audit-log writing depends on them.
- [ ] **Promotions engine.** Coupons work. Promotions (flash sales, bank offers,
      BXGY) are typed but not evaluated.
- [ ] **Guest checkout.** Checkout requires an account.

### Quality gaps

- [ ] **Automated tests.** Vitest is configured but the pricing, coupon,
      inventory and saga logic have no unit tests. The two smoke suites are the
      only automated verification.
- [ ] **SEO pass.** Metadata, JSON-LD and sitemap exist; canonical handling for
      filtered listings, `noindex` on deep pagination and a Core Web Vitals
      measurement have not been done.
- [ ] **Accessibility pass.** Semantics and focus states were written carefully
      but nothing has been audited with a screen reader or axe.
- [ ] **Dark mode** for the consoles.

### Known caveats

- **Product photography is representative, not real.** Images come from a small
  pool of verified Unsplash photographs matched by product family, and they do
  not depict the specific generated product. They must be replaced by seller
  uploads before launch. `MEDIA_SOURCE=generated` swaps in the first-party SVG
  renderer, which needs no network.
- **MongoDB is standalone**, so nothing uses transactions. See AGENTS.md for how
  correctness is obtained instead. Moving to a replica set is a repository-layer
  change.
- **Payments run against the mock gateway.** Razorpay and Stripe adapters are
  stubbed behind the same interface and throw if selected without credentials.
