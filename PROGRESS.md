# Progress

Living checklist. Updated as work lands, not as it is planned.

**Verification commands.** `npm run verify` (typecheck + lint + build), then
with a server running (`npm run restart && npm run start`):

| Command | Checks |
|---|---|
| `npm run smoke` | the purchase funnel, end to end in a browser |
| `npm run smoke:rbac` | 6 identities against 19 routes |
| `npm run smoke:admin` | admin writes, verified by their side effects in Mongo |
| `npm run audit:a11y` | axe-core, 12 routes × 2 widths |
| `npm run audit:contrast` | WCAG ratios, parsed from `tokens.css` |

Latest run: **build 262/262 routes · typecheck clean · lint clean · funnel 11/11
· RBAC 19/19 · admin writes 6/6 · a11y 0 violations · contrast 3/3**

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

## Phase 7 — Notifications, support, governance · **done**

- [x] Notification service with per-channel adapters; preferences and the
      transactional/marketing split enforced in one place
- [x] Wired into order confirmation, dispatch, delivery, payment failure,
      return approval and every admin decision
- [x] `/account/notifications` with preference summary; account section nav
- [x] `/account/returns` and `/account/reviews` — the three dead links on the
      account page now go somewhere
- [x] Account overview rebuilt around recent orders instead of a tile grid
- [x] Support tickets: customer thread view and agent queue, SLA-ordered,
      internal notes never leak into the customer view
- [x] Admin write actions — approve/reject listings, suspend/reinstate stores,
      toggle coupons and homepage sections
- [x] Append-only audit service with field-level diffs; every admin mutation
      writes one and notifies the affected party
- [x] Seeded 635 notifications and 34 tickets derived from real orders; listing
      statuses varied so the review queue is not permanently empty

## Phase 8 — SEO and accessibility · **partly done**

- [x] `robots.ts` — private surfaces and the unbounded `/search` space
      disallowed; non-production deployments blocked entirely
- [x] Segmented `sitemap.ts` (20k URLs per file) plus a real sitemap INDEX at
      `/sitemap-index.xml`, because `generateSitemaps` publishes segments but no
      index and `robots.txt` was pointing at a 404
- [x] Honest priority and change frequency; products carry their real
      `updatedAt` and selling products outrank the tail
- [x] Accessibility audited with axe rather than asserted: **26 serious
      violations → 0**, across 12 routes at desktop and mobile
- [x] `aria-pressed` on filter LINKS replaced with `aria-current` (37 nodes)
- [x] Contrast: `text-tertiary` measured 3.78:1 and failed everywhere it was
      used — 1,030 nodes. Darkened to 4.77:1. Premium and low-rating badges
      moved from the 500 to the 600 steps
- [x] `scripts/check-contrast.mjs` parses `tokens.css` rather than restating it,
      so it cannot pass while the real tokens drift
- [ ] Core Web Vitals measured under load
- [ ] Dynamic OG images per product and category

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
- [ ] **Real notification delivery.** The in-app centre works and preferences
      are honoured, but the email, SMS and push adapters log rather than send —
      deliberately visible as stubs.
- [ ] **Replying to a ticket from the UI.** The service supports it; the agent
      view is read-only.
- [ ] **Seller onboarding and KYC submission flow.** Sellers are seeded as
      approved; there is no application journey.
- [ ] **Product create/edit for sellers.** The catalogue is read-only in the
      console — no listing form, no media upload, no approval submission.
- [ ] **Manual refunds from the console.** Approvals, suspensions and toggles
      are done; issuing a refund by hand is not.
- [ ] **Promotions engine.** Coupons work. Promotions (flash sales, bank offers,
      BXGY) are typed but not evaluated.
- [ ] **Guest checkout.** Checkout requires an account.

### Quality gaps

- [ ] **Automated tests.** Vitest is configured but the pricing, coupon,
      inventory and saga logic have no unit tests. The two smoke suites are the
      only automated verification.
- [ ] **Core Web Vitals.** Not measured. LCP, CLS and INP targets are designed
      for (priority hero image, skeletons that reserve exact space, Server
      Components by default) but no number has been taken.
- [ ] **Screen reader pass.** axe is clean, which catches the mechanical faults;
      it does not tell you whether the page makes sense read aloud.
- [ ] **Dynamic OG images** via `next/og` per product and category.
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
