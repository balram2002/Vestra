# Enhancement delivery

## Completed — 15 September 2026

The previous milestone 1–3.2 implementation was audited, corrected where needed, and completed through every remaining prompt item.

### Milestone 1 — storefront and navigation

- Promotion strip centering, overflow marquee speed and desktop/mobile animation.
- Desktop hero transitions, autoplay and shorter landing height without changing mobile behavior.
- Modern homepage composition including category, product, story, reels, testimonial and campaign sections.
- Dynamic global search across products, brands, categories and sellers with type-correct links.
- Smooth sticky header behavior.
- Collapsible admin/seller navigation and guarded mobile drawer gestures using `@use-gesture/react`.

### Milestone 2 — admin composition tools

- Page-based section editing with real storefront previews, responsive preview sizes and full field controls.
- Confirmation dialogs for material changes, scheduling and validation.
- Reset and visibility controls across homepage, shop page, banners, appearance and CMS pages.
- Promotion-strip visibility control and responsive marketing management screens.
- Dedicated illustrated shop-page composition at `/admin/categories-page`, isolated from homepage sections.

### Milestone 3 — identity, categories and reels

- Profile photo, name, phone, personal details, communication preferences and preferred sizes.
- Email-code two-step verification for enable, sign-in, resend and disable flows.
- Google OpenID Connect sign-in with authorization code exchange, PKCE, signed state/nonce cookie, verified ID tokens, unique provider identity and existing 2FA enforcement.
- Responsive auth screens with show/hide controls, password strength, common-password rejection and accessible validation.
- Illustrated `/categories` directory backed by catalogue data and managed through the dedicated admin composition page.
- Reels navigation with a custom damped spring, swipe/wheel/keyboard/arrows, reduced-motion support, active-video playback, mute/pause, error handling, sharing and persisted wishlist state.

### Production verification

- `npm run check`: typecheck, lint and 341 unit tests passed across 23 files.
- `npm run verify`: final typecheck, lint and Next.js 16.3.5 production build passed; 154 pages generated.
- `npm run smoke:auth`: all configured registration, verification, password reset, login/logout, security, profile and email-2FA flows passed against an isolated production server.
- `npm run smoke:rbac`: 19/19 anonymous, customer, seller, staff and super-admin access checks passed.
- Enhancement browser smoke: desktop hero/search/reels/category editor and mobile auth/drawer/reels checks passed.
- Desktop/mobile screenshot review completed for storefront, categories, auth, reels, CMS and shop-page management with no console errors.
- Accessibility audit: 0 serious, critical, moderate or minor violations across 28 desktop/mobile route checks.
- `npm audit --omit=dev`: 0 production vulnerabilities after upgrading Next.js, Nodemailer and Sharp.

Google's live consent screen still requires deployment-owned OAuth credentials. Configure both Google values described in `.env.example` and `docs/enhancements.md` before the deployment build.

## Storefront commerce enhancement — 16 September 2026

- Rebuilt the public seller profile around an image-led identity, verified badge, configurable trust/dispatch/sales scorecard, policies, store search, and existing catalogue filters. Admins can edit each seller's scorecard; saves are audited and invalidate the public store cache.
- Added shareable `/demo/[slug]?clip=...` landing pages for exact product reels. The video player supports play/pause, seek, mute, playback speed, fullscreen, sharing, WhatsApp, loading/error recovery, and a touch/keyboard-resizable featured-products sheet. Sellers can curate products per clip; shoppers can select a variant and add it to the bag without leaving the demo.
- Refined product details with a bounded image gallery, mobile purchase bar, and a three-dot menu that copies the demo link. Reel shares and homepage reel cards lead to the demo. Product listings gained clearer cards, demo links, compact mobile filters, and two-column mobile grids.
- Browser smoke on an isolated production server passed video playback/seek/mute, panel resizing, guest add-to-bag, demo link copy, admin scorecard persistence/cache invalidation, exact-clip 404 behavior, and 36 responsive route/width checks with no horizontal overflow or browser errors.
- Targeted axe audit passed the store, product, demo, and category pages at 390px and 1440px with no serious or critical violations. Final `npm run verify` passed after the mobile gallery-height adjustment; all 341 unit tests passed. The production browser smoke was repeated on the final build and passed again.

## Shopping UI and session refinement — 16 September 2026

- Product demos now try autoplay with sound and fall back to muted autoplay when the browser rejects audible autoplay. The timer is replaced by a seek strip and top progress line; sharing, WhatsApp and copy link are in the three-dot menu. The compact mobile sheet shows image/name/price, while expanded cards expose variant selection and add-to-bag.
- The product page shows a labelled mobile live-shopping action, a visible product demo link when video exists, tighter footer spacing, and a sticky gallery that follows the hiding header. Product cards use a restrained image zoom and no demo button.
- Category pages gained a collection banner, subcategory shortcuts, and mobile-first filter access. The header search panel, mega menu and account dropdown received updated geometry and transitions. Shared sticky offsets let listing controls and sidebars sit flush with the dynamic header.
- Reels gained a top progress strip, central play/pause target, loading state, bottom seller profile/caption/product CTA, and right-side sound/save/share controls. The spring navigation remains in the existing tested hook.
- Customer sessions remain 30 days; staff sessions are now 15 days. Admin and super-admin sign-in requires an email code regardless of the optional account setting, and they cannot disable that protection. Protected-route expiry shows a sign-in-again dialog.
- Final `npm run verify` passed with the isolated MongoDB test database, and all 341 unit tests passed. The auth browser suite passed sign-up, sign-in, verification, recovery, session expiry, and mandatory admin sign-in code flows. Production browser smoke passed product demos, mobile purchase actions, header menus, hero autoplay, admin scorecard persistence, and overflow checks at 320/390/768/1440px across ten routes. RBAC smoke passed 20/20 role checks. Final screenshots were reviewed for reels, product details, category listing, and the demo drawer. The final axe audit passed all 12 mobile/desktop checks across home, store, product, demo, category, and reels with no serious or critical findings.

## Homepage composition and purchase-bar refinement — 17 September 2026

- Removed the inherited 24px margin that separated the product purchase bar from the mobile navigation; the bar now measures flush against the navigation, and the navigation has an opaque ground so page text does not show through it.
- Built a separate desktop hero carousel with its own three compositions, crossfading slide motion, autoplay, keyboard/arrows, and timed progress controls. The existing mobile carousel remains the default; its two additional layouts are selected independently.
- Every homepage section now stores independent desktop/mobile choices for Layout 1 (the existing design), Layout 2 (featured composition), and Layout 3 (mosaic composition). The admin editor previews and persists those choices without changing section content.
- Shop by Category shows its current automatic selections in the admin editor. An admin can turn them into a manual list by removing, adding or reordering entries; an empty manual list intentionally hides the section's items, while switching back to automatic restores the current taxonomy selection.
- Desktop department menus close after pointer exit even when a clicked link retains focus. The mobile drill-down clips outgoing panels so its right-side controls do not flash during navigation.
- Hero slides now expose separate desktop and phone images in the admin editor, and admins can add, edit, reorder, hide, and delete slides without code changes. A browser run confirmed image edits and deletion persisted to MongoDB.
- A failed initial MongoDB connection now releases its shared promise so later requests can reconnect after recovery.
- Final production `npm run verify`, commerce browser smoke at 320/390/768/1440px, and 12-route accessibility audit passed. Browser runs confirmed the hero/layout controls and current category data persist from admin to storefront, plus hero slide creation, phone-image editing, and deletion.

## Store page layouts and per-page frame — 26 September 2026

- The public store page (`/store/[slug]`) now has three layouts, chosen for every store at once under **Admin › Marketing › Store page**. Variant 1 (Classic) is the page as it was. Variant 2 (Spotlight) is a bold banner using the store's own cover photo, with the logo inside its left edge and the shop name in heavy display type, then three trust numbers (trust score, delivery timing, orders shipped) and the products as a 9:16 reel wall. Variant 3 (Studio) is an Instagram-style profile: a story-ring logo, counters, a short bio, WhatsApp and share buttons, and Reels/Grid tabs over a three-up reel wall.
- Each layout keeps its own switches for breadcrumbs, banner, logo, name, tagline, verified badge, location, share, WhatsApp, search, each trust number, rating, returns/COD, about, products, filters, reel prices and play buttons, plus product layout (reels or grid) and section title. Editing a layout never makes it live. Admins save it, preview it on a real store at `/store/[slug]/preview/[variant]` (staff only, noindex), then choose **Make live**.
- **Admin › Marketing › Page layout** is a table of every storefront page family against the promotion strip, header, footer and phone bottom bar. The gates run on the client and mount only when a part is actually hidden somewhere, so the default frame stays in the static shell.
- Both settings are stored as new blocks in the existing `siteContent` document, merged deep over code defaults, and saved through `saveAppearance`. That keeps validation, audit logging and cache invalidation the same as the rest of Appearance.
- `npm run verify` passed. A browser run against the local demo dataset hid the header and footer on the store profile from the admin table, confirmed they disappeared there and stayed on `/stores`, then restored them. The desktop and phone screenshot review of all three layouts and both admin screens showed no page errors.

## Marketing roadmap, Milestone 1: the Page Designer — 26 September 2026

The plan for bringing every Marketing screen up to one standard lives in `docs/marketing-roadmap.md` (5 milestones, 25 phases). This milestone builds the framework the rest depend on.

- **Page designs are definitions.** `src/domain/page-designs/` describes a designable page as plain data: variants, grouped fields (toggle, text, choice), per-variant defaults and a preview path. The zod schema, the defaults merge and the admin screen are all derived from it. A definition-level test fails if any variant is missing a default.
- **Draft, preview, publish.** Designs moved from `siteContent` into a `pageDesigns` collection, one document per page, holding the published config, a draft, an optional schedule and the last 20 revisions. Every change is a single-document write. The Store page's existing settings are read as the published config until the first save, so nothing changed for shoppers during the migration.
- **One designer screen for every page** (`/admin/design/[page]`). It has layout cards with sketches and Live / In draft badges, grouped settings with a "Changed" marker that restores the default in one click, per-layout reset, "Copy from…", a draft that autosaves after each change (Ctrl+S saves immediately), and an embedded preview at phone, tablet and desktop widths with a real-store picker. Publishing takes an optional note, and a publish can be scheduled or cancelled. History lists the last 20 publishes, and any of them can be put back.
- **Publishing is immediate.** Publish, revert and schedule changes call `updateTag`, so the next shopper request gets the new design rather than a stale copy. Scheduled publishes apply on read inside the cached scope, with a cache lifetime that turns over within about five minutes of the go-live time, so no cron is needed.
- **Marketing overview** (`/admin/marketing`) shows live and scheduled campaign counts, what ends or starts this week, each page design's live layout with any pending draft or schedule, and site-wide status. The admin nav is regrouped into *Campaigns*, *Page designs* and *Site-wide*.
- The Store page runs on the framework, and `/admin/store-page` now redirects to `/admin/design/store`.
- Verification: `npm run verify` passed; 354 unit tests passed (13 new). The new `npm run smoke:marketing` passed 13/13, covering draft hidden from shoppers, preview, publish live, discard, schedule and cancel, put back, and leaving the page as found. `smoke:rbac` passed 27/27 with new cases: Marketing may enter, Support is refused, and anonymous visitors are refused the draft preview. Desktop and 1024px screenshots were reviewed.

## Marketing roadmap, Milestone 2: every Marketing screen to one standard — 27 September 2026

- **Coupons** (`/admin/coupons`): status tabs, search and sort, rules stated in plain words, and a usage meter on each row. A full-page editor covers create and edit, with a bag preview, generated small print and an example-bag saving; category, brand and store targeting and payment methods are now exposed. Codes are fixed once used; coupons can be duplicated, archived and restored. Each coupon shows its redemptions, discount given, revenue influenced and latest uses.
- **Promotions** (`/admin/promotions`): the same list treatment, an eight-week calendar, and an editor for all eight offer kinds. The editor's preview is priced by the checkout evaluator itself, and a live overlap panel says which offer a shopper would get. New offers still start paused. The list now reads `valueKind`; it used to infer rupees or percent from the offer type.
- **Homepage and Shop page**: the builders edit a draft, and shoppers read a published snapshot in `compositions`. The first open sets the baseline from what was live, so the switch changed nothing for shoppers. A publish bar lists changes in words, with draft preview, discard, publish with a note, and history with put-back.
- **Content pages**: autosaved drafts, separate from the immediate show/hide switch. Three templates (Plain, Editorial, Help article), a search panel with a result preview and warnings, hide-from-search, a staff-only preview, and history with put-back. "Load the shipped wording" now makes a draft instead of publishing.
- **Appearance**: every card has a History with put-back, and strip lines can be scheduled to start and end on their own, with a live preview of the band.
- **Page layout**: each part is Everywhere, Desktop only, Phones only or Off, per page family; single-page rules override a family; history with put-back. Rules saved in the old boolean format read as before.
- **Fixed along the way**: publishing now reaches shoppers on the next request (`updateTag`). An autosaving editor no longer refreshes its own route, which could remount it and drop an edit made just after a publish.
- **Verification**: `smoke:marketing` passed 42/42 twice in a row, `smoke:rbac` 27/27, and new unit tests for coupon, promotion, composition, content-page and page-layout rules. Screens were reviewed from screenshots.

## Marketing roadmap, Milestone 3: Product page designer — 27 September 2026

- **Admin › Page designs › Product page** (`/admin/design/product`) runs on the same designer as the Store page: layout cards, 22 settings in four groups, an autosaved draft, an embedded preview with a product picker, publish or schedule, and history.
- **Variant 1 · Classic** is the page as shipped; every part answers to a switch. **Variant 2 · Lookbook** shows the photographs as a spread (the first full width, the rest in pairs) with the listing's highlights set large between them, a buy panel that stays in view, and "Complete the look" from the same store. **Variant 3 · Social** puts the seller first (story-ring logo, trust numbers, WhatsApp, Visit store), then a tall 9:16 hero, photo reviews with a customer-photo wall, and more from the store as reels.
- **One buy box everywhere**: `ProductViewer` takes a layout and switches (zoom, size guide, See it live, wishlist, pinned bar, low-stock note, button label), so buying works the same in every layout.
- **Fixed**: the Appearance editor's clock hook re-subscribed on every render, which could loop (React error #185) and crash the page intermittently. Its subscription is now module-level; the rule is in AGENTS.md.
- **Verification**: `smoke:marketing` 48/48 twice in a row, including add-to-bag in all three layouts and publishing Lookbook to shoppers; `smoke:rbac` 29/29. Reviewed at 390px and 1440px.

## Marketing roadmap, Milestone 4: Product demo designer — 27 September 2026

- **Admin › Page designs › Product demo** (`/admin/design/demo`) has 11 settings covering the header, playback and shopping.
- **Variant 1 · Classic** is the demo player as shipped, now with switches. **Variant 2 · Showroom** frames the clip on a light ground beside the lead piece, whose options and Add to bag are right there, with a shelf of the other pieces below. **Variant 3 · Stories** is tap-through: one segment per piece, progress bars, hold to pause, a sticker to shop each piece, and an end card offering "Call the store".
- One choose-and-add step (`DemoChooser`) is shared by every layout.
- `smoke:marketing` adds to the bag through all three layouts and publishes Stories (54/54); a test step now empties the bag first so the five-per-item cap cannot fail a working button.

## Marketing roadmap, Phase 5.1: Category page designer — 27 September 2026

- **Admin › Page designs › Category page** (`/admin/design/category`) has 14 settings: breadcrumbs, picture, the line above the title, description, shop-by-type (chips or photo tiles), bestseller rail, shortcut tiles, popular filters, docked filters, quick view, wall density, and the SEO copy.
- **Variant 1 · Classic** is the listing as shipped. **Variant 2 · Editorial** is a department front, with shortcut tiles in the grid that link to this same listing with one filter applied. **Variant 3 · Visual wall** is a photo wall with a quick view (colour, then size, then add) that never leaves the page.
- A setting can now be marked `onlyFor` some layouts, and the designer shows it only while one of those is edited.
- `ListingView` gained options (docked rail, popular filters, tiles, wall display) that default to the old behaviour, so search, brand and store are unchanged.
- Staff preview at `/category/[slug]/preview/[variant]` keeps filter and sort links inside the preview.
- `smoke:marketing` 64/64 (quick view adds to the bag, tiles filter, Editorial publishes to shoppers); `smoke:rbac` 34/34.
