# Progress

Living checklist. Updated as work lands, not as it is planned.

**Verification commands.** `npm run verify` (typecheck + lint + build), then
with a server running (`npm run restart && npm run start`):

| Command | Checks |
|---|---|
| `npm run smoke` | the purchase funnel, end to end in a browser |
| `npm run smoke:rbac` | 6 identities against 19 routes |
| `npm run smoke:admin` | admin writes, verified by their side effects in Mongo |
| `npm run smoke:shipping` | courier webhook defences, labels, parcel ownership |
| `npm run smoke:exchange` | a size swap end to end, asserted on stock movements |
| `npm run audit:a11y` | axe-core, 12 routes × 2 widths |
| `npm run audit:contrast` | WCAG ratios, parsed from `tokens.css` |

Latest run: **build 269/269 routes · typecheck clean · lint clean · 44 unit tests
· funnel 11/11 · RBAC 19/19 · admin writes 6/6 · fulfilment 25/25 · exchange 20/20
· a11y 0 violations · contrast 3/3**

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

## Phase 9 — Shipments and the Eshopbox integration · **done**

- [x] Courier-agnostic `ShippingProvider` contract — serviceability, shipment,
      label/AWB, pickup, manifest, tracking, cancellation, reverse pickup
- [x] Eshopbox adapter against the real API shapes: token minted from the
      refresh token and cached for its 24h life, stampede-collapsed refresh,
      retries confined to timeouts/429/5xx, rupee conversion at the boundary
- [x] Simulated courier behind the same interface, and deliberately awkward:
      unserviceable pincodes, prepaid-only areas, one failed delivery in
      sixteen, one RTO in fifty. Those are the paths with the most fragile UI
- [x] Tracking derived from the AWB itself (issue time and zone are encoded in
      it), so it survives restarts and needs no cron
- [x] Tracking webhook with the same four defences as the payment webhook:
      signature, replay index, out-of-order rejection, always-2xx once stored
- [x] `applyEvent` is the single write path for parcel status — webhook,
      polling reconciler and seller actions all go through it
- [x] Seller fulfilment now performs real logistics: "Generate label" books the
      parcel and burns an AWB, "Book pickup" calls the courier, "Hand over" is a
      hand-over. Order status became a consequence, not an assertion
- [x] Seller shipment queue, parcel detail, manifest close, cancellation
- [x] 4×6 thermal label with real Code 128 barcodes, on its own print layout
- [x] Customer tracking timeline on the order page, exceptions kept visible
- [x] 2,024 parcels and 1,545 manifests backfilled into the seeded history,
      with scan times nudged into the hours a courier actually works

**Two defects this work surfaced and fixed.** The seeded AWB collided on the
unique index because the zone and filler digits were drawn from the same end of
the hash and 4 divides 100 — 400 possible suffixes were really 100. And couriers
skip scans: a same-city parcel goes from picked up straight to out for delivery,
which the strict adjacency rule rejected, leaving order items a step behind the
parcel they were inside. Courier-sourced moves may now skip forward; every other
caller still cannot.

---

## Phase 10 — Exchanges · **done**

A size swap, which is the common case in fashion, and deliberately NOT modelled
as a return followed by a new order — that shape loses the customer their
price, their coupon and their place in the queue.

- [x] `requestExchange` reserves the replacement AT REQUEST TIME. An exchange
      promises a specific size; without the hold, the last M sells to somebody
      else while the customer's parcel is still in the courier's van and the
      exchange fails after they have already given their item back
- [x] Price frozen from the original line. Only equal-priced variants qualify —
      anything else would mean collecting money or refunding it mid-flow, which
      is a return wearing an exchange costume, and the customer is told to do
      exactly that instead
- [x] The replacement ships only after the returned item passes quality check,
      so nobody can hold both
- [x] Rejection at any stage releases the held unit immediately
- [x] Reverse pickup and replacement dispatch reuse the shipment layer:
      `createReturnPickup` (direction RETURN, addressed to the seller) and
      `createReplacementShipment` (EXCHANGE_FORWARD, labelled straight away)
- [x] `applyEvent` now branches on direction — a "delivered" scan on a reverse
      leg means the parcel reached the SELLER, and mapping it onto the order
      item would have told the customer their return was delivered to them
- [x] Customer: a separate "Exchange size" button with a server-resolved size
      picker, so it can never offer a variant the request would refuse
- [x] Seller: exchanges sit ABOVE returns in the queue, because an undecided
      exchange is holding sellable stock out of the catalogue
- [x] `/account/returns` covers both; the seller badge counts both

---

## Phase 11 — Invoices and settlements · **done**

The money story stopped at commission: it was computed per order and never
became a document or a payout.

- [x] GST tax invoices raised per SELLER, not per platform — the seller is the
      supplier of record, so the series is per seller per financial year and
      carries their GSTIN. A shared series would break every seller's filings
- [x] Raised at DISPATCH, which is when the invoice legally accompanies the
      goods, and idempotent so a reprint never burns a second number (gaps in
      an invoice series are a compliance problem)
- [x] Place of supply decides CGST+SGST versus IGST; amounts come from the
      order item's frozen snapshot, so a reprint a year later is identical
- [x] Credit notes on return, because under GST an invoice is never amended
- [x] A4 invoice document, plain by design, linked from the customer's order,
      the seller's parcel and reachable by staff — one route, authorisation
      expressed once, a 404 for anyone else
- [x] Settlement runs: claim delivered orders past the hold, itemise every
      deduction as a line, produce one net figure. Claiming is what makes the
      run idempotent — a second click settles nothing rather than paying twice
- [x] Returns debit the period they LAND in, not the one they sold in
- [x] Below the minimum payout the balance rolls forward instead of being
      transferred at a loss
- [x] Seller statement writes the arithmetic out in full; finance console runs
      payouts and records the bank UTR, both gated on `finance:payout`
- [x] `amount-in-words` with Indian lakh/crore grouping, 10 unit tests

**Three data defects this surfaced.** The seeder generated returns and refunds
but never inserted them, so 180 order items claimed to have been returned with
nothing behind them — the seller queue, `/account/returns` and the refund
ledger were all permanently empty, and every settlement showed a zero return
debit. Seeded GSTINs used a random state code and an unrelated PAN, so an
invoice showed a Goa GSTIN on a Rajasthan address. And `smoke:admin` was
asserting against fixed sleeps, which had quietly become too short — it was
reporting a bug in an action that worked.

---

## Not yet done

Honest list of what the brief asks for that is not built.

### Functional gaps

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

- [ ] **Automated tests — partly done.** 44 unit tests now cover the pricing
      engine's allocation and GST-slab rules, the shipment state machine, and
      the Code 128 table (checked against the specification, because a
      transposed digit produces a barcode that looks right and fails at the
      scanner), and the invoice amount-in-words conversion. Coupon evaluation,
      inventory movements and the saga runner are still only covered by the
      smoke suites.
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
