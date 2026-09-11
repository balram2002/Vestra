import { FINANCE, RETURNS, SHIPPING } from '@/config/business';
import type { CmsPage } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { formatMoney } from '@/lib/format';

/**
 * Policy and help content.
 *
 * Real copy, not placeholder text. These pages state the commitments the rest
 * of the system actually enforces — the return window here is the same
 * `RETURNS.defaultWindowDays` the returns service checks, and the free-delivery
 * threshold is the one the pricing engine applies. Interpolating them from
 * `config/business` is what stops the published policy drifting from the code.
 *
 * Stored as CMS documents so they can be edited in Admin, Pages, without a
 * deploy. They state no facts about the business itself: no address, phone
 * number or officer's name. Those come from configuration and are set under
 * the contact and grievance pages by `CmsPageView`, so nothing here can be
 * invented or go stale. Read every page before launch all the same: they are
 * a starting point written against this codebase's defaults.
 */

const md = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '').trim();

interface PageSeed {
  slug: string;
  title: string;
  metaDescription: string;
  body: string;
}

const PAGES: PageSeed[] = [
  {
    slug: 'legal/terms',
    title: 'Terms of use',
    metaDescription:
      'The terms under which VestraWAB operates as a marketplace, and what buyers and sellers each agree to.',
    body: md`
## What VestraWAB is

VestraWAB is a marketplace. We do not manufacture or own the products listed here.
Each item is sold by an independent seller who is identified on the product page
and on your invoice. Your contract of sale is with that seller; our contract with
you covers the platform, payment handling and dispute resolution.

## Your account

You must be 18 or older to buy on VestraWAB. Keep your password to yourself — you
are responsible for orders placed from your account. Tell us immediately if you
think someone else has access to it.

## Pricing and availability

Prices shown include GST. We take reasonable care to keep prices and stock
accurate, but listings are maintained by sellers and errors happen. If a price
or stock error is discovered after you order, we will contact you and either
honour the order or cancel it with a full refund — we will never quietly charge
you a different amount than the one you agreed to.

## Cancellations

You may cancel any item before it is dispatched, from your orders page, at no
charge. After dispatch, use the returns process instead.

## Prohibited use

Do not scrape the catalogue, resell our content, attempt to interfere with the
service, or place orders you do not intend to pay for. We may suspend accounts
that do.

## Disputes

Contact support first — most issues are resolved within two working days. These
terms are governed by Indian law, and the courts where our registered office is
located have exclusive jurisdiction.
    `,
  },
  {
    slug: 'legal/privacy',
    title: 'Privacy policy',
    metaDescription:
      'What personal data VestraWAB collects, why, how long it is kept, and how to get it deleted.',
    body: md`
## What we collect

- **Account details** — your name, email, and phone number if you give one.
- **Addresses** — needed to deliver and to calculate serviceability and tax.
- **Order history** — required by law for tax and accounting records.
- **Payment metadata** — the method, status and gateway reference. We never
  store your full card number; that stays with the payment provider.
- **Usage data** — pages viewed and searches run, used to rank results.

## What we do not do

We do not sell your personal data. We do not share your contact details with
sellers beyond what is needed to deliver your order and handle returns.

## Sharing

Your name, delivery address and phone number are shared with the seller
fulfilling your order and with the courier carrying it. Payment details go to
the payment provider. Nothing else leaves VestraWAB except where the law requires.

## Marketing

Marketing email is opt-in and off by default. Every message has a working
unsubscribe link, and you can change your preferences under Account →
Notifications at any time.

## Retention

Order and invoice records are kept for eight years, as Indian tax law requires.
Everything else is deleted within 90 days of you closing your account.

## Your rights

You can ask for a copy of your data, correct it, or have it deleted. Write to
our grievance officer — details on the grievance redressal page — and we will
respond within 30 days.
    `,
  },
  {
    slug: 'legal/returns-policy',
    title: 'Return policy',
    metaDescription: `VestraWAB's return and exchange policy: ${RETURNS.defaultWindowDays}-day window, free reverse pickup where we are at fault.`,
    body: md`
## The window

Most items can be returned within **${RETURNS.defaultWindowDays} days of
delivery**. Some sellers offer longer, and the exact window is stated on every
product page — that number, not this one, is what applies to your order.

## Condition

Items must be unworn and unwashed, with tags and original packaging intact. Try
things on, but do so over your own clothes where the item is intimate wear.

## What cannot be returned

- Beauty, skincare and fragrance once the seal is broken
- Innerwear and swimwear
- Items marked non-returnable on the product page, which is always stated
  before you buy

## Who pays

If the fault is ours or the seller's — wrong item, damaged, not as described —
reverse pickup is **free** and you get the delivery charge back too. If you
simply changed your mind, a reverse pickup fee of
${formatMoney(SHIPPING.reversePickupFee)} is deducted from the refund.

## Refund timing

Once the item reaches the seller and passes a quality check, refunds are issued
within **${RETURNS.refundSlaDays.prepaid} working days** for prepaid orders and
**${RETURNS.refundSlaDays.cod} working days** for cash on delivery. Prepaid
refunds go back to the original payment method; COD refunds go to a bank account
you provide.

## Exchanges

Where a seller supports it, you can exchange for a different size or colour
instead of refunding. If your replacement size is unavailable, the exchange
automatically becomes a refund and we tell you as soon as that happens.
    `,
  },
  {
    slug: 'legal/grievance',
    title: 'Grievance redressal',
    metaDescription:
      'How to escalate an unresolved complaint, and the grievance officer’s contact details as required by Indian law.',
    body: md`
## Step 1 — Support

Raise a ticket from your account, or from the order it is about. Most issues
are resolved within two working days.

## Step 2 — Escalation

If you are not satisfied with the resolution, reply to the ticket asking for it
to be escalated. A senior agent will review it within three working days.

## Step 3 — Grievance officer

As required under the Consumer Protection (E-Commerce) Rules, 2020, the
grievance officer's name and contact details are set out below.

The officer acknowledges every complaint within 48 hours and resolves it within
one month.
    `,
  },
  {
    slug: 'help/shipping',
    title: 'Shipping and delivery',
    metaDescription:
      'Delivery timelines, charges, free-delivery threshold and how tracking works on VestraWAB.',
    body: md`
## Timelines

- **Metro cities** — ${SHIPPING.metroDays.min} to ${SHIPPING.metroDays.max} working days
- **Rest of India** — ${SHIPPING.standardDays.min} to ${SHIPPING.standardDays.max} working days
- **Express**, where offered — ${SHIPPING.expressDays.min} to ${SHIPPING.expressDays.max} working days

The estimate shown at checkout is calculated from your pincode and the seller's
dispatch location, not a national average.

## Charges

Delivery is **free above ${formatMoney(SHIPPING.freeShippingThreshold)}**. Below
that, standard delivery is ${formatMoney(SHIPPING.standardFee)}. Cash on delivery
adds ${formatMoney(SHIPPING.codFee)}.

Each seller ships separately, so an order containing items from three sellers
arrives as three parcels — and each qualifies for free delivery on its own
subtotal.

## Dispatch cut-off

Orders placed before ${SHIPPING.dispatchCutoffHour}:00 are dispatched the same
working day. After that, the next one.

## Tracking

You get an AWB number by email as soon as the courier collects the parcel.
Every scan appears on your order page.

## Failed delivery

Couriers attempt delivery up to three times. After that the parcel returns to
the seller and you are refunded in full, minus nothing.
    `,
  },
  {
    slug: 'help/returns',
    title: 'How to return or exchange',
    metaDescription: 'Step-by-step: how to raise a return or exchange on VestraWAB and what happens next.',
    body: md`
## Raising a return

1. Open **Your orders** and find the item.
2. Choose **Return** or **Exchange** and pick a reason. The reason matters — it
   decides who pays the reverse pickup fee.
3. Choose a pickup address and slot.

You will get a confirmation immediately, and the seller reviews it within one
working day.

## Pickup

A courier collects from your address within ${RETURNS.pickupWindowDays} days of
approval. Keep the item in its original packaging with tags attached. You do not
need a printer — the agent carries the label.

## Quality check

The seller checks the item on arrival, usually within
${RETURNS.qcSlaDays} working days. If it passes, your refund is issued
immediately. If it fails, we tell you exactly why and send the item back to you
at no charge.

## Exchanges

An exchange reserves your replacement as soon as it is approved, so it cannot
sell out while your return is in transit. If the replacement becomes
unavailable anyway, the exchange converts to a refund automatically and we let
you know.
    `,
  },
  {
    slug: 'help/refunds',
    title: 'Refunds',
    metaDescription: 'When VestraWAB refunds, how long it takes, and where the money goes.',
    body: md`
## When a refund is issued

- **Cancelled before dispatch** — immediately, in full
- **Returned and passed quality check** — on the same day the check passes
- **Delivery failed or parcel lost** — as soon as the courier confirms it
- **Payment succeeded but the order did not** — automatically, within 24 hours,
  without you having to ask

## How long it takes

Prepaid refunds reach your account in ${RETURNS.refundSlaDays.prepaid} working
days. Cash-on-delivery refunds take ${RETURNS.refundSlaDays.cod} working days
because they need bank details from you.

## Where it goes

Back to whatever you paid with. UPI to the same UPI ID, card to the same card,
wallet to the same wallet. If the original method has since closed, we contact
you for bank details instead.

## Partial refunds

If you return two items out of five, only those two are refunded. Any delivery
charge is refunded proportionally, and a coupon discount is re-apportioned
across what you kept — so returning one item never quietly removes a discount
from the rest.
    `,
  },
  {
    slug: 'help/contact',
    title: 'Contact us',
    metaDescription: 'How to reach VestraWAB support, and what to have ready so it is resolved fast.',
    body: md`
## Support

A ticket from your account is the fastest way to reach us: it goes to the same
team as an email, and keeps the conversation and the order it is about in one
place. Our other contact details are set out below.

## Faster resolution

Have your order number ready — it looks like *VS-2508-4KQ9M2* and is at the top
of your order page. For a damaged item, a photo taken before you remove the tags
lets us approve a replacement on the spot.

## What we can do immediately

- Cancel anything not yet dispatched
- Re-schedule a delivery or a return pickup
- Escalate an order past its promised date
- Issue a refund on an item already returned and checked

## What takes longer

Anything needing the seller's input — a made-to-order garment, a size not in
stock — usually needs one working day.
    `,
  },
  {
    slug: 'help/size-guide',
    title: 'Size guide',
    metaDescription: 'How VestraWAB sizing works, and how to measure yourself so it fits first time.',
    body: md`
## Read the product, not the label

Sizing is not consistent across Indian fashion labels, so every product page
lists the actual garment measurements alongside the size name. Compare those
against something you already own and like the fit of — it is far more reliable
than picking the size you usually wear.

## What buyers say

Each product shows a fit signal built from real reviews: what percentage of
buyers found it true to size, and which way it runs otherwise. If 40% say it
runs small, size up.

## How to measure

- **Chest / bust** — around the fullest part, tape level and not pulled tight
- **Waist** — at the natural waist, the narrowest point
- **Hip** — around the fullest part, roughly 20cm below the waist
- **Shoulder** — seam to seam across the back

## Still unsure

Order the two sizes you are torn between and return the one that does not fit.
Returns are free on unworn items with tags intact.
    `,
  },
  {
    slug: 'about',
    title: 'About VestraWAB',
    metaDescription:
      'VestraWAB is a marketplace for independent Indian fashion labels selling direct, with verified sellers and honest product information.',
    body: md`
## What we are building

VestraWAB is a marketplace for fashion, beauty and home, built around a simple
position: the people who make things should be able to sell them without a
three-times markup, and shoppers should be able to see who they are buying from.

## How we are different

**Every seller is verified.** GST registration and KYC are checked before a
store's first listing goes live, and the store's real operating record —
dispatch time, return rate, rating — is shown on its page.

**Product information is specific.** Fabric weight, actual garment
measurements, what the model is wearing, whether the colour varies by batch.
Vague copy is how the wrong thing ends up in a parcel.

**Prices are honest.** The price you see includes GST. No inflated MRP existing
only to make a discount look bigger.
    `,
  },
  {
    slug: 'sell-with-us',
    title: 'Sell on VestraWAB',
    metaDescription:
      'What it takes to sell on VestraWAB: commission, settlement terms, onboarding and the tools you get.',
    body: md`
## Who we onboard

Independent labels, workshops, weavers and family businesses making their own
product. We are not looking for resellers of the same catalogue everyone else
carries.

## What it costs

Commission starts at ${FINANCE.defaultCommissionPercent}% and varies by category. There is no listing fee, no
monthly fee and no charge for the seller console.

## When you get paid

Settlements run weekly. Money for an order clears the hold
${FINANCE.settlementHoldDays} days after delivery and lands in your account on
the next payout run.

## What you get

- A catalogue tool with variants and media management
- An order queue with labels, manifests and pickup scheduling
- Inventory tracked across available, reserved, sold, returned and damaged
- Settlement statements that reconcile to the paisa
- Your own store page with your record on it

## Getting started

Register, submit GST and PAN, add a pickup address and a bank account. Most
sellers are verified within two working days, and you can build your catalogue
while verification is in progress.
    `,
  },
];

export function generateCmsPages(updatedByUserId: string, now: Date): CmsPage[] {
  const at = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  return PAGES.map((page) => ({
    id: entityId('cms'),
    slug: page.slug,
    title: page.title,
    body: page.body,
    metaTitle: `${page.title} | VestraWAB`,
    metaDescription: page.metaDescription,
    isPublished: true,
    updatedAt: at,
    updatedByUserId,
  }));
}
