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
