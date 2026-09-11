# Deploying VestraWAB

A production deployment is one or more Node processes running the Next.js
build, behind a TLS-terminating proxy or load balancer, talking to MongoDB.
This page is the checklist. The reasoning behind each rule lives next to the
code it describes.

## 1. Requirements

- **Node 24** (`.nvmrc` pins 24.11.0). Next 16 refuses older versions.
- **MongoDB 6 or 7.** A standalone server is fine: nothing in the data layer
  needs transactions. Back it up; it holds orders and payouts.
- **A proxy that terminates TLS and sets `X-Forwarded-For`.** Per-address rate
  limits read the first address in that header.

## 2. Environment

Copy `.env.example` and fill it in. `APP_ENV` decides how strict the server is
when it starts (see `src/config/env.ts`):

| `APP_ENV` | On a configuration problem |
|---|---|
| `development` | prints the problems and carries on |
| `staging` | refuses to start; mock providers are warned about |
| `production` | refuses to start, and so do mock payments, missing SMTP and a non-https site URL |

`next start` always sets `NODE_ENV=production`, including on a laptop, so
strictness deliberately keys on `APP_ENV` instead.

Required for `APP_ENV=production`:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://` origin shoppers use; canonical URLs and emails are built from it |
| `AUTH_SECRET` | 32+ random characters. The development placeholder is refused |
| `MONGODB_URI`, `MONGODB_DB` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | order, password-reset and verification emails |
| `PAYMENT_PROVIDER` | `razorpay` or `stripe`, with that provider's keys and webhook secret |
| Eshopbox credentials | all five `ESHOPBOX_*` values, or set `ESHOPBOX_MODE=simulation` deliberately |
| `LIVE_PROVIDER` | `zoom` with its three S2S OAuth values for real calls; `mock` is allowed but warned about |
| ImageKit | optional. Without it, uploads go to local disk, which does not survive a multi-instance deploy |
| Business details | recommended: `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_GRIEVANCE_OFFICER` (an Indian marketplace must name one), and the rest of the block in `.env.example`. Unset ones are left out, never invented, and the startup check warns about those two |

Every provider falls back to a simulation when its secrets are missing. That is
right on a laptop, and the startup check exists so it cannot happen by accident
in production.

## 3. Build and start

```bash
npm ci
npm run check            # typecheck, lint, unit tests
npm run build
APP_ENV=production npm run start
```

On startup the server validates the environment and creates any missing
database indexes, including the TTL indexes that expire rate-limit windows and
guest carts. There is no separate migration step.

**Do not run `npm run seed` against production.** It wipes the database and
loads a demo shop. Load the reference data instead (the category tree, the
legal and help pages, the homepage layout and the roles, but no banners, stores
or products; it only inserts what is missing and never deletes), then create the first administrator:

```bash
npm run seed:reference
```


```bash
npm run admin:create -- --email you@company.com --name "Your Name"
```

It prompts for the password (never pass it on the command line), and refuses
to overwrite an existing account.

## 4. Behind the load balancer

- **Health check:** `GET /api/health` returns `200` when the process is up and
  can reach MongoDB, and `503` when it cannot, so a node that lost its database
  leaves the pool. It is never cached and discloses nothing about the stack.
- **Webhooks** (point the providers at these):
  - payments: `POST /api/webhooks/payments`
  - Eshopbox tracking: `POST /api/webhooks/eshopbox`

  Both verify signatures and reject anything unsigned.
- **More than one instance** is fine. Sessions are signed cookies, rate limits
  live in MongoDB, and nothing else is held in process memory that matters
  across requests.

## 5. What is already hardened

- **Rate limits** on sign-in, registration, password reset, password change,
  coupon codes, support tickets, reviews and live requests
  (`src/server/security/rate-limit.ts`). Sign-in, password changes and coupons
  spend budget only on failures, so a customer who gets it right is never
  slowed. The limiter fails open if MongoDB is unreachable.
- **Headers:** `nosniff`, a referrer policy, `X-Frame-Options`, a baseline
  Content-Security-Policy (`object-src`, `base-uri`, `frame-ancestors`,
  `form-action`), HSTS in production, no `X-Powered-By`, and a Permissions-Policy
  that allows camera and microphone only on the live-call routes.
- **Sessions:** `httpOnly`, `Secure` in production, `SameSite=Lax`.
- **Errors:** every boundary shows a reference digest instead of the message.
  Console pages fail inside the console, so the navigation stays usable.

## 6. Verifying a deployment

`.github/workflows/ci.yml` runs typecheck, lint, unit tests, a seeded build and
the production build on every push. Against a running staging server:

```bash
BASE_URL=https://staging.example.com npm run smoke:hardening
BASE_URL=https://staging.example.com npm run smoke            # browse to order
BASE_URL=https://staging.example.com npm run smoke:account    # new customer
BASE_URL=https://staging.example.com npm run audit:console    # console layout
```

The smoke suites write test data and clean up after themselves, but they
assume the demo seed, so run them against staging, never production.

## 7. Deploying on Vercel

Vercel builds the site on its own machines and runs it as serverless functions. That changes four things compared with a server of your own.

1. **The database must be reachable from Vercel, during the build and afterwards.** The build prerenders the catalogue, the help and legal pages and the sitemap from MongoDB. Use MongoDB Atlas (or any hosted MongoDB), and in **Atlas → Network Access → Add IP Address** choose **Allow access from anywhere (`0.0.0.0/0`)**: Vercel's build machines and functions use changing IP addresses. A database on your own computer can never be reached.
2. **Set the environment variables in Vercel**, under **Project → Settings → Environment Variables**, for **Production and Preview**. Variables starting with `NEXT_PUBLIC_` are baked into the build, so they must be set before it runs; redeploy after changing any of them.
3. **The disk is read-only.** Set the three ImageKit variables, or uploads have nowhere to go (production refuses to start without them on Vercel), and set SMTP so email is actually sent.
4. **Node.js 24**: **Project → Settings → General → Node.js Version**, to match `.nvmrc`. 22 also works.

Then:

- **Import the GitHub repository** in Vercel. The Next.js preset is detected; leave the build command as `npm run build`.
- **Load the reference data** once, from your computer, with `.env.local` pointing at the Atlas database Vercel uses: `npm run seed:reference`. It adds the category tree, site pages, homepage layout and roles, and never deletes anything. (`npm run seed` instead wipes the database and loads a demo shop.)
- **Create the first administrator** against the same database: `npm run admin:create -- --email you@company.com --name "Your Name"`.
- **Add your brands** in the admin console under **Catalogue → Brands**. A seller cannot submit a listing without one.
- **Fill in the business details** in Vercel's environment variables: at least `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_GRIEVANCE_OFFICER` (the whole block is in `.env.example`), plus `EMAIL_FROM` with an address your SMTP provider sends from. They are `NEXT_PUBLIC_`, so redeploy after setting them. Nothing is invented for an empty one: it is simply not shown.
- **Read every page** under **Marketing → Pages**. The terms, privacy, returns and grievance policies are a starting point and they are your commitments, so edit them there. The contact details under the contact and grievance pages come from the variables above.
- **Add homepage banners** under **Marketing → Homepage**: upload an image (needs ImageKit on Vercel) or paste an https link. Until there is one, the hero and the tile grid stay hidden.
- **Webhooks** go to your Vercel domain: `https://<domain>/api/webhooks/payments` and `https://<domain>/api/webhooks/eshopbox`.
- **Check** `https://<domain>/api/health` returns `"status":"ok"`.

`npm run build` starts with a database check (`scripts/check-build.mjs`). If a deployment stops with **"Build stopped: MongoDB is not usable for this build"**, the message says which of the steps above is missing: the variable is not set, it points at `localhost`, or Atlas is refusing Vercel's address. Before this check, the same problem surfaced as `Failed to collect page data for /sitemap/[__metadata_id__]`.