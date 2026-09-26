# Marketing console roadmap

**Goal:** every screen under Admin › Marketing works to the standard set by
`/admin/store-page`: layout variants you can see before choosing, a switch for
every section and button, a real preview, a safe path to live, and a way back.
The key storefront pages get their own designer screens, with today's design
as Variant 1 and two new designs as Variants 2 and 3.

Status key: ☐ not started · ◐ in progress · ☑ done

---

## Where things stand (audit, 26 Sep 2026)

| Screen | What it does today | Gap against the Store page standard |
|---|---|---|
| Coupons | List, create dialog, on/off | No edit, duplicate, archive, search/filter, usage insight or shopper-side preview |
| Promotions | List, create dialog, on/off | Same as coupons, plus no schedule view and no detection of overlapping promotions |
| Homepage | Section builder, 3 layouts per section per device, banners, hero slides | Saves straight to live, no draft or history, preview is per section and not whole-page |
| Shop page | Section builder for `/categories` | Same as Homepage |
| Pages | CMS page list and form | No SEO fields panel, templates, draft/publish or preview |
| Appearance | Strip, header actions, promises, footer | Solid per-block editing; no preview of the strip or footer, no history |
| Store page | 3 variants, per-variant switches, preview, make-live | The reference. Its storage (a block inside `siteContent`) will not scale to many pages |
| Page layout | Page × part switch table | No per-device rule (e.g. hide the footer on phones only), no single-path overrides |
| Product page, Product demo, Category, Sellers, Brand | Not in Marketing | One design each, hard-coded |

---

## Architecture decisions (made in Milestone 1, used by everything after)

1. **One Page Designer framework, many pages.** A page design is a *definition*
   in `src/domain/page-designs/<page>.ts`: variants (name, description, sketch),
   toggle groups, text fields, choice fields, defaults and a zod schema built
   from the same definition. The admin screen, validation, storage and preview
   are generic. Adding a page means adding a definition and three renderers,
   not a new editor.
2. **Designs move out of `siteContent` into a `pageDesigns` collection**, one
   document per page. Each document holds a *published* config, a *draft*
   config and the last 20 revisions. Store page and Page layout migrate across
   and read the old block as a fallback, so nothing breaks mid-migration.
3. **Draft → preview → publish.** Editing only touches the draft. Preview
   renders the draft inside the real storefront frame. Publish copies draft to
   published, records a revision, writes an audit entry and invalidates exactly
   the cache tags that page reads (new tags in `cache-tags.ts`, no strings).
4. **Preview is embedded.** The designer shows the page in an iframe with
   Phone / Tablet / Desktop widths and an entity picker (which product, which
   store). A "Open full page" link remains.
5. **Server asserts.** Every designer action calls
   `requirePermission('cms:write')`; coupon and promotion actions keep their own
   `coupon:write` / `promotion:write`. Preview routes are staff-only and
   `noindex`.
6. **Cache Components rules still hold.** Layout and variant choice is read from
   cached, tagged services; nothing reads cookies to pick a layout in the page
   shell. That is why A/B testing is its own phase (5.6) rather than a
   toggle.

---

## Milestone 1 — The Page Designer foundation

**Outcome:** the Store page is rebuilt on a reusable framework with draft,
publish, history and embedded preview. Every later page uses it for free.

- ☑ **Phase 1.1 — Domain and storage.** Page-design definition type,
  `pageDesigns` collection, service (`getLiveDesign`, `getDesignState`,
  `saveDraft`, `publish`, `schedule`, `revertTo`), migration of `storePage`
  out of `siteContent` with a fallback read, and unit tests for the
  merge-over-defaults and schema generation. *`pageChrome` is a page × part
  table rather than a set of variants, so it moves in Phase 2.6 instead.*
- ☑ **Phase 1.2 — Designer UI kit.** `PageDesigner` component: variant cards
  with sketches, Live / Draft / Scheduled badges, grouped switches, text and
  choice fields, "changed from default" markers, per-variant reset, "copy
  settings from Variant N", an unsaved-changes guard and keyboard access
  throughout.
- ☑ **Phase 1.3 — Preview.** A generic staff-only draft preview route inside the
  storefront group, an iframe preview pane with device widths and an entity
  picker, and a refresh after each draft save.
- ☑ **Phase 1.4 — Publish and history.** Publish with confirmation, a revision
  list (who, when, which variant, what changed), one-click revert and
  scheduled publish ("go live on 1 Oct, 00:00" for festive layouts), applied
  on read so no cron is needed.
- ☑ **Phase 1.5 — Store page on the framework.** Port the three store variants
  and all their switches. The public page is visually identical before and
  after (screenshot diff).
- ☑ **Phase 1.6 — Marketing home and navigation.** A new `/admin/marketing`
  overview showing what's live on each page, drafts waiting, scheduled
  changes, running coupons and promotions, and anything expiring this week.
  The nav is regrouped into *Campaigns*, *Page designs* and *Site-wide*.

**Done when:** Store page works end to end on the framework, `npm run verify`
passes, and a new smoke script (`smoke:marketing`) covers draft → preview →
publish → revert.

**Status: ☑ done (26 Sep 2026).** `npm run verify` passed, 354 unit tests
passed (13 new), `smoke:marketing` passed 13/13, and `smoke:rbac` passed 27/27
(7 new cases for the designer, overview and draft preview).

---

## Milestone 2 — Bring every existing Marketing screen up to standard

- ☑ **Phase 2.1 — Coupons.** *Done: list with status tabs, search and sort;
  full-page editor with bag preview, plain-language rules and generated small
  print; category / brand / store targeting and payment methods (supported by
  the evaluator but never exposed before); duplicate; archive and restore;
  per-coupon redemptions, discount given, revenue and latest uses.
  `smoke:marketing` covers create, validation, list, edit, duplicate and
  archive.* Original scope: A full editor page (create, edit, duplicate,
  archive) with rules shown in plain language ("₹200 off orders above ₹1,499,
  first order only"). The list gets search, status filters (live, scheduled,
  expired, paused, used up) and sorting. Each coupon gets a redemption count,
  discount given and revenue influenced, plus a preview of how it looks in the
  bag coupon panel. `valueKind` stays the only source of what `value` means.
- ☑ **Phase 2.2 — Promotions.** *Done: list with status tabs, search, sort and
  an overlap flag per row; an eight-week calendar; full-page editor for all
  eight offer kinds (bank, store and buy-X-get-Y offers were not creatable
  before) with a preview priced by the checkout evaluator itself, and live
  overlap checks that say which offer a shopper gets; duplicate; archive. New
  offers are still saved paused. The list now reads `valueKind`, fixing a
  display that inferred rupees-or-percent from the offer's type.* Original
  scope: the same editor treatment, a **calendar view**
  of what runs when, and **overlap detection**: a warning when two promotions
  cover the same products in the same window, with the one that would win
  identified. A preview shows the price badge on a real product card.
- ☐ **Phase 2.3 — Homepage and Shop page.** The existing section builders move
  onto draft → preview → publish with history. The embedded preview becomes
  whole-page with device widths. Sections gain schedule windows (show from/to)
  and per-device visibility.
- ☐ **Phase 2.4 — Content pages.** An SEO panel (title, description, social
  image, indexable) with a search-result preview. Three page templates as
  variants: *Plain*, *Editorial* (hero image, pull quotes) and *Help article*
  (sidebar table of contents). Draft, preview and publish.
- ☐ **Phase 2.5 — Appearance.** A live preview of the strip, header and footer
  beside the editor, promotion-strip scheduling (festive offers that end on
  their own), and history and revert per block.
- ☐ **Phase 2.6 — Page layout.** Moves out of `siteContent` onto the same
  draft → publish → history model. Per-device rules (phone / desktop), overrides
  for a single path (e.g. one landing page with no header), and a preview of
  the result.

---

## Milestone 3 — Product details page designer

`/product/[slug]` · Admin › Marketing › Product page

- **Variant 1 · Classic** — today's page, unchanged.
- **Variant 2 · Lookbook** (new) — an editorial, image-led layout. Desktop has
  a full-height image stack scrolling beside a sticky buy panel. The phone gets
  a full-screen swipe gallery with a pinned buy bar. Highlights appear as large
  type between images, with "Complete the look" from the same store.
- **Variant 3 · Social** (new) — for Instagram-native sellers. A 9:16 reel or
  demo hero with shoppable stickers, a prominent seller card (WhatsApp, "See
  it live", trust numbers), photo reviews first, and "More from this store" as
  a reel strip.
- **Switches:** breadcrumbs, gallery style, zoom, size guide, pincode delivery
  estimate, offers block, See-it-live, seller card, WhatsApp, highlights,
  specifications, returns info, reviews, photo reviews, related rail, store
  rail, recently viewed, sticky buy bar, share, wishlist, button labels.
- ☐ Phase 3.1 — Definition and switches on Variant 1 (no visual change with all on).
- ☐ Phase 3.2 — Variant 2 · Lookbook.
- ☐ Phase 3.3 — Variant 3 · Social.
- ☐ Phase 3.4 — Visual review at 320 / 390 / 768 / 1440, a11y audit, and add-to-bag smoke on all three.

## Milestone 4 — Product demo page designer

`/demo/[slug]` · Admin › Marketing › Product demo

- **Variant 1 · Classic** — today's player, unchanged.
- **Variant 2 · Showroom** (new) — the video with a product rail on desktop
  (the shopper can add to bag without leaving the video) and a pull-up product
  sheet on the phone.
- **Variant 3 · Stories** (new) — tap-through segments with progress bars, a
  product sticker per segment, swipe-up to buy and a "Call the store" end card.
- **Switches:** seller header, captions, like and share, product tray, autoplay,
  start muted, live-call CTA, offer countdown, related demos, CTA labels.
- ☐ Phase 4.1 — Definition and Variant 1 · ☐ Phase 4.2 — Showroom ·
  ☐ Phase 4.3 — Stories · ☐ Phase 4.4 — Review, a11y, reduced-motion and data-saver checks.

## Milestone 5 — More page designers, and experiments

- ☐ **Phase 5.1 — Category listing** (`/category/[slug]`). V1 current. V2
  *Editorial* (department hero, curated chips, promo tiles placed in the grid).
  V3 *Visual wall* (reel/masonry discovery with quick-view).
- ☐ **Phase 5.2 — Sellers directory** (`/stores`). V1 current. V2 *Local
  market* (grouped by city, "near you" first). V3 *Stories* (live and new
  stores as a story row, then trust-ranked cards).
- ☐ **Phase 5.3 — Brand page** (`/brand/[slug]`). V1 current. V2 *Campaign*
  (full-bleed brand film/hero). V3 *Catalogue* (compact, filter-first).
- ☐ **Phase 5.4 — Search results** (`/search`). V1 current. V2 *Instant*
  (the query's matching stores, brands and categories as chips above the
  grid, with "did you mean"). V3 *Visual* (a reel wall of results with
  sort-as-tabs).
- ☐ **Phase 5.5 — Overrides.** A product-page variant per category (e.g.
  Social for ethnic wear), and the store-page variant chosen by the seller
  from the set Marketing allows.
- ☐ **Phase 5.6 — A/B experiments.** Split traffic between two variants of one
  page. Assignment happens in `proxy.ts` and is carried in the URL rewrite, so
  pages stay cacheable. Results (views, add-to-bag, orders) appear in
  Analytics with a clear winner threshold.

Checkout and payment stay out of scope for variants. Only trust-badge switches
are offered there, because layout experiments on the payment step risk revenue
for little gain.

---

## Quality bar for every phase

- `npm run verify` passes, and relevant unit tests are added.
- Screenshots reviewed at phone and desktop, light and dark.
- `smoke:rbac` still passes. A Marketing Manager can reach every Marketing
  screen, and Support cannot.
- Every publish writes an audit entry and invalidates only its own tags.
- `PROGRESS.md` updated, with a commit per phase.

## Decisions (26 Sep 2026)

1. **Storage:** designs move to their own `pageDesigns` collection with draft,
   published, revisions and scheduled publish.
2. **Extra designers:** Category listing, Sellers directory, Brand page and
   Search results.
3. **A/B experiments:** kept, as the final phase (5.6).
4. **Delivery:** milestone by milestone, with a verify, screenshot review,
   commit and report after each.
