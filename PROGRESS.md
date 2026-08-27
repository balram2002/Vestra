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
| `npm run smoke:listing` | a seller authoring a listing from empty form to sizes |
| `npm run smoke:offers` | coupons and promotions, asserted on the total not the banner |
| `npm run smoke:guest` | a purchase with no account, and who can read it afterwards |
| `npm run smoke:ops` | answering a ticket and refunding an order, incl. permissions |
| `npm run smoke:onboarding` | applying to sell, KYC upload, and the gate on an unverified store |
| `npm run smoke:email` | verification, password reset, and what actually reaches an inbox |
| `npm run audit:a11y` | axe-core, 14 routes × 2 widths |
| `npm run audit:contrast` | WCAG ratios in BOTH themes, parsed from `tokens.css` |

Latest run: **build 276/276 routes · typecheck clean · lint clean · 173 tests
· funnel 11/11 · RBAC 19/19 · admin writes 6/6 · fulfilment 25/25 · exchange 20/20
· listing 20/20 · offers 17/17 · guest 18/18 · console ops 23/23 · onboarding 23/23
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

## Phase 12 — Seller listing authoring · **done**

The catalogue was read-only in the seller console. Sellers could see their
products and change stock; they could not create one.

- [x] Draft-first: saving is always possible, completeness is checked at
      SUBMIT. A form that refuses to save until it is perfect loses work
- [x] Blockers shown inline BEFORE submitting, phrased as the thing to do
      ("Add at least one photo"), not the field that is empty
- [x] Attributes derived from the chosen category, so picking Kurtas asks
      about sleeve and neck and picking Sneakers does not — from the same
      vocabulary the storefront filters on
- [x] Size/colour matrix with a generator, because typing 24 rows by hand is
      how sellers end up listing one row called "Free size". Rupees in the
      form, integer paise in the database, converted at that boundary
- [x] Variants are never deleted — a dropped row is deactivated, because live
      carts and historical order items point at it forever
- [x] Real uploads behind a swappable `MediaStore`: bytes are checked against
      known magic numbers rather than trusting the declared type, dimensions
      are read from the header so grids can reserve space, and ids are
      content-addressed so the same photo twice is stored once
- [x] Editing a LIVE listing sends it back for review only when something
      material changed (title, brand, category). Copy fixes do not, or sellers
      stop fixing typos
- [x] Renaming preserves the old slug in `slugHistory`, so inbound links live
- [x] Duplicate for a new colourway; take down and put back up without losing
      reviews; archive

**Three test defects this surfaced**, all in the tests rather than the app:
`smoke:admin` asserted against fixed sleeps that had grown too short;
`smoke:funnel` inherited a bag from the previous run, so a sold-out leftover
correctly blocked checkout and looked like a broken funnel; and the new
authoring test indexed into every number input on the page, putting an MRP into
the return-window field. All three now wait for outcomes and target elements by
accessible name.

---

## Phase 13 — Coupons wired up, and the promotions engine · **done**

The coupon engine existed, was well tested by nothing, and was **not connected
to the bag** — `getCartView` returned `coupon: null`, `availableCoupons: []`,
`offers: []` and `creditAvailable: 0` as literals. Six coupons were seeded and
none of them could ever be applied. Promotions were typed and indexed but had
no evaluator, no data and no UI.

- [x] Promotions engine: one offer per line (the best), never stacked — a
      festival offer plus a flash sale plus a seller offer must not discount an
      item to nothing
- [x] Bank offers stay MESSAGING until the instrument is chosen, so the bag
      never shows a total the shopper cannot actually pay
- [x] Flash sales stop at their allocation, so scarcity is real and the funder
      is not exposed to an unbounded discount
- [x] Buy-X-get-Y discounts UNITS, not lines, and scales with complete groups
- [x] Coupons, promotions and store credit all wired into `getCartView`, and
      re-evaluated on every read against live rules — a coupon that expires
      overnight stops discounting on the next page view
- [x] Coupon codes are stored on the bag; the DISCOUNT never is
- [x] Coupon redemptions recorded as a saga step, compensated on rollback —
      without which the engine's per-user and total limits were unenforceable
      and a "first order only" coupon worked for ever
- [x] Offers panel on the bag: type a code, or take one of the offers listed
      best-first, with the shortfall shown for the ones nearly in reach
- [x] Admin promotions screen with an audited enable/disable
- [x] 20 unit tests on the promotions engine

**Two defects found by looking at the rendered bag.** A free-shipping coupon
was offered as "Save ₹0" on an order that already shipped free — the engine had
no idea what shipping was, and now refuses with "your order already ships free".
And **category-targeted offers could never fire**: offers store category IDs
while `product.categoryPath` stores ancestor SLUGS, because that is what the
listing query matches against. The type said "ids" and was simply wrong. The
slugs are now resolved to ids where the offer context is built, and the type
comment says what the field actually holds.

---

## Phase 14 — Guest checkout · **done**

Checkout required an account, which is the single largest avoidable drop-off
in a funnel.

- [x] A guest buys with the same stock reservation, the same server-side
      re-pricing and the same saga. What they lack is an account, so contact
      details and address travel with the ORDER — everything downstream already
      treated `order.userId` as nullable
- [x] `/checkout` and `/orders` came OUT of the proxy matcher and enforce at the
      page instead; a blanket redirect to login made guest checkout impossible
- [x] Order access for a guest is granted by an httpOnly cookie holding the ids
      they placed, never by the order number. Verified: a stranger gets a 404,
      and so does a signed-in customer who knows the id
- [x] After buying, the guest is told plainly that the order lives in this
      browser, and offered the one action that fixes it
- [x] No dead ends: the saved-address detour and the "Your orders" breadcrumb
      both bounce a guest into a sign-in wall, so neither is shown to one

**Three defects this surfaced.** The seeder numbered orders with its own
counter and never advanced the shared `counters` collection, so the first real
order placed after a seed asked for a number a seeded order already held and
the unique index rejected it — the saga compensated correctly and the shopper
saw "we could not place your order", but nobody could buy until the counter
walked past every seeded number. The seed generators for shipments and returns
had a private copy of the financial-year helper that produced six digits where
the canonical one produces four, so seeded and live numbers had different
shapes. And the guest address fields wrapped their hint text inside the
`<label>`, which folds it into the accessible NAME — the email field announced
as "Email Your order confirmation and tracking go here".

---

## Phase 15 — Support replies, manual refunds, admin order detail · **done**

The last two console gaps, plus the screen both of them needed.

- [x] Agents reply on the ticket thread, and INTERNAL NOTES live on the same
      thread rather than in a second system — the customer view filters them
      out, and the smoke suite checks that against the customer's actual page
      rather than against a flag
- [x] Replying moves the ticket and assigns it. An agent who answers has by
      definition started work, and a queue where everyone can act and nobody
      owns anything is how two agents answer the same customer differently
- [x] Manual refunds for what the return flow cannot express: a lost parcel, a
      goodwill gesture, a duplicate charge. Deliberately NOT modelled as a fake
      return, which would corrupt the return metrics sellers are scored on
- [x] The amount is capped at what the order actually contributed minus what
      has already been refunded, so neither a typo nor a double click can
      refund more than was paid
- [x] Gated on `order:refund` and audited at CRITICAL. Support can read the
      order and is not offered the control; finance is
- [x] `/admin/orders/[orderNumber]` — resolves by order number OR id, because
      support arrives from a phone call holding the number and the console
      links with the id
- [x] Requester email is masked in the agent view; a support console on a
      shared screen is where customer contact details usually leak

---

## Phase 16 — Seller onboarding and KYC · **done**

The last functional gap in the brief. Until now sellers arrived pre-approved
from the seeder; there was no way to become one.

- [x] `/sell-with-us/apply` — one page, not a wizard. The applicant needs to see
      what is being asked of them before they start, and a four-step wizard
      hides exactly that
- [x] The GSTIN is checked against the pickup state, not merely against the
      format. A GSTIN starting `29` on a Rajasthan address is a transcription
      error, and catching it here is cheaper than catching it on the face of an
      invoice three weeks later
- [x] Only the last four digits of the bank account are stored. The full number
      is never needed again after the payout instruction is set up
- [x] The applicant gets the SELLER role the moment they apply — otherwise they
      could not reach the screen that asks for their documents — so the console
      gates on the store's STATUS, not on the role. `requireSeller()` sends an
      unapproved store to its onboarding screen; `requireSellerAccount()` is the
      weaker assertion that onboarding screen itself uses
- [x] Applying reissues the session token. `proxy.ts` routes on the roles baked
      into the cookie and deliberately cannot reach the database, so without
      this a fresh applicant is bounced off their own onboarding screen with no
      way out but signing out and back in
- [x] Documents are validated by their BYTES, not by the name or the MIME type
      the browser claimed, and lock once the application is in review — a set a
      reviewer can no longer see being swapped underneath them is not a review
- [x] Submission is refused until all four are present, and the screen names
      which are missing rather than only disabling the button

---

## Phase 17 — The untested money paths · **done**

Coupon evaluation, inventory movements and the saga runner were the three
places where real money and real stock are decided, and all three were covered
only by end-to-end smoke tests. Six flaky smoke assertions fixed across the
last two phases are the argument for pushing that logic down.

- [x] 40 tests on coupon evaluation. Asserted on the NUMBERS and the WORDS, not
      on `applicable` — a coupon that applies for the wrong reason, or refuses
      with a message that sends a shopper to add the wrong thing, is a bug that
      a boolean assertion sails past
- [x] The load-bearing rule pinned down: the minimum spend is measured against
      QUALIFYING items, so a pair of shoes cannot unlock a coupon written for
      ethnic wear. So is the clamp that stops a ₹500 coupon taking ₹500 off
      ₹300 of goods
- [x] 19 tests on the saga runner — reverse-order compensation, a compensation
      that throws not abandoning the rest, and the original failure never being
      masked by the cleanup's failure. The journal is asserted on too: it is the
      only durable trace of a half-finished unit of work
- [x] 32 tests on inventory movements, against a REAL MongoDB on a throwaway
      database. Every movement there is a Mongo query, so a mock would only
      re-state the source — and the guarantee that matters, that a conditional
      update cannot oversell under concurrency, is a claim about MongoDB that
      only MongoDB can settle. Twenty concurrent attempts at the last ten units
      produce exactly ten winners
- [x] The suite skips itself when no server is reachable, and refuses to drop
      any database but the scratch one

---

## Phase 18 — Dynamic OG images · **done**

- [x] `next/og` cards for the site default, categories and stores, from ONE
      renderer in `src/lib/og/card.tsx`. A card per route is how five slightly
      different brands end up in one social feed
- [x] The site-wide default matters most: without it every share of the home
      page, search, or any CMS page rendered as a bare link, because
      `summary_large_image` was declared with no image to show
- [x] Products keep their own photography — a real garment beats a generated
      card. The category banner does NOT: it is a wide crop that loses its
      subject at 1200×630, is often shared across a whole department, and
      carries no text, so a shared link never said which category it was
- [x] Satori supports a deliberate subset of CSS and cannot read custom
      properties, so the tokens are mirrored as literals in exactly one file
      rather than once per card
- [x] **Bug found by looking at the output:** `absoluteUrl()` prefixed the site
      origin onto already-absolute media URLs, so every product's `og:image`
      AND the `image` array in its Product JSON-LD read
      `https://vestra.example/https://images.example/photo.jpg`. Every social
      share and every rich-result crawl of a product page fetched a 404. Fixed
      in the shared helper, which repaired 46 call sites at once, and pinned
      with tests

---

## Phase 19 — Wiring up cache invalidation · **done**

`cache-tags.ts` defined a careful tag vocabulary, documented how far each
mutation should reach, and exported `productTags(id, scope)`. Nothing ever
called it. `revalidateTag` appeared nowhere in the codebase outside a comment.

Every `"use cache"` scope in the storefront therefore refreshed ONLY on expiry,
which is hours. Found by chasing a funnel failure to its root: a size chip
rendered as selectable for a variant that had been sold out for the best part
of an hour, and the shopper who picked it was refused at the bag with "this
size just sold out".

- [x] `invalidate()` in a new `cache-invalidation.ts`, kept apart from the
      vocabulary because the vocabulary is dependency-free and importable
      anywhere, while `revalidateTag` drags in the request scope
- [x] Safe outside a request. The seeder, scripts and tests call the same
      repositories a request does, and `revalidateTag` throws there — but only
      that throw is swallowed, and only because there is genuinely no cache
- [x] Inventory movements invalidate on a POLICY, not on every write. Expiring
      every listing page on every add-to-bag is a heavy price for a number
      nobody renders; what is rendered is a size chip's enabled state and the
      "Only N left" count. So a crossing of zero fires, a movement inside the
      urgency band fires, and 77 → 76 deliberately does not
- [x] `findOneAndUpdate` returning the BEFORE document — MongoDB refuses a
      positional projection together with `returnDocument: 'after'`, and the
      positional `$` is what returns the matched variant rather than the first
- [x] Catalogue mutations wired: approve/reject, publish/unpublish, archive,
      submit-for-review, draft edits, the variant matrix, media, seller
      suspension, coupons, promotions and CMS sections
- [x] **A second false-passing test found.** The funnel's "item reached the
      bag" check matched the FOOTER's "Size guide" link, so it passed on a
      completely empty bag and the run then failed further down at checkout
      with no hint of where it started

---

## Phase 21 — Email that actually sends · **done**

- [x] SMTP through one `EmailTransport` seam, because every provider speaks it
      — SES, Mailgun, Postmark, Resend — so choosing one is a change to `.env`
      rather than to any code. With no SMTP host, mail is written to
      `.data/outbox` as rendered HTML and says on every message that it was not
      delivered
- [x] `email/catalogue.ts` drives out WHICH actions mail, against three tests:
      it is a record, it needs an action while the person is away, or it is
      time-critical. Catalogue events fail all three and stay in-app — mailing a
      seller forty times a week is how the messages that matter stop being read
- [x] One table-based shell with a plain-text alternative rendered from the
      same content, so the two cannot drift. Email is not the web: Outlook
      renders through Word and flexbox is unavailable in enough clients that
      using it means designing for a subset
- [x] Verification and password reset, on single-use hashed tokens. Only the
      SHA-256 is stored, verification and consumption are one operation, and the
      comparison is constant-time
- [x] The reset form answers identically for a known and an unknown address —
      anything else is an account-enumeration oracle
- [x] **Bug found on the way:** newly registered customers were created with an
      empty preference map, an absent preference read as "off", and so they
      never received their own order confirmation. The default now lives in one
      place and `notify()` falls back to it, which fixes existing accounts too
- [x] **Bug found by reading a rendered email:** the order total printed ₹0. It
      was not the email. `SELLER_OFFER` was priced as a percentage while being
      seeded as a flat ₹300 in paise, so the engine computed a 30,000% discount
      and the clamp downstream quietly reduced it to the whole line. Orders were
      going out free and nothing failed

---

## Phase 22 — Theme, carousels and a mobile shell · **done**

The first milestone aimed squarely at how the thing looks and feels, with the
weight on phones.

- [x] **Dark mode, finally reachable.** The dark palette had been sitting in
      `tokens.css` under a `.dark` class that nothing ever applied — written,
      complete, and dead. Now an inline script in `<head>` resolves the choice
      before the first paint, so there is no flash of the wrong theme, and
      `light / dark / system` is a three-way control because `system` is the
      commonest real answer, not a fallback
- [x] The theme lives outside React, in a store read through
      `useSyncExternalStore` — it is a DOM attribute, `localStorage` and a media
      query, which is exactly that hook's shape. It follows the device while set
      to `system`, and follows other tabs
- [x] **The contrast checker only ever measured the light palette**, so the dark
      tokens shipped with ratios nobody had calculated. It now checks both, and
      immediately found `text-tertiary` at 4.45:1 — a WCAG AA failure by a hair
- [x] **A carousel primitive**, built on native scroll-snap rather than a
      transform track: momentum, rubber-banding and trackpad gestures are the
      platform's rather than reimplemented, it works before hydration, and it
      costs no dependency. Labelled region, per-slide position, arrows that
      disable at the ends, and nothing that auto-advances
- [x] The home hero was a mosaic that stacked into three full-height cards on a
      phone — roughly two and a half screens before the first product. It is one
      swipeable row at every width now. Product rails use the same primitive
- [x] **The PDP gallery was a tablist**: a big image changed by clicking a
      thumbnail, which meant swiping the photo — the one thing everybody tries —
      did nothing. The photos are the carousel now and the thumbnails drive it
- [x] **A sticky buy bar on mobile**, carrying price, size and the action, so
      the primary control on the page is never a scroll away
- [x] **A bottom navigation bar**, because the five things people move between
      were behind a hamburger at the least reachable corner of the phone
- [x] `/categories` — the taxonomy was reachable only through the desktop mega
      menu, so browsing did not exist on a phone
- [x] **The header bag and wishlist badges were hardcoded to `0`.**
      `getBagCount` and `getWishlistCount` both existed and neither had ever
      been called, so the badge had never once appeared
- [x] The PLP header cost about two thirds of a phone screen before the first
      product. Filter, sort and count are one sticky row now

---

## Not yet done

Honest list of what the brief asks for that is not built.

### Functional gaps

- [ ] **SMS and push delivery.** Email now sends for real; the SMS and push
      adapters still log, deliberately visible as stubs.

### Quality gaps

- [x] **Automated tests.** 155 tests cover the pricing engine's allocation and
      GST-slab rules, the shipment state machine, the Code 128 table (checked
      against the specification, because a transposed digit produces a barcode
      that looks right and fails at the scanner), the promotions and coupon
      engines, the invoice amount-in-words conversion, the saga runner's
      compensation contract, and inventory movements against a real MongoDB.
      What is still smoke-only is the parts that need a browser: rendering,
      navigation and the console screens.
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
