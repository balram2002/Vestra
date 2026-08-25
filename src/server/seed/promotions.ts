import 'server-only';

import type { Brand, Category, Promotion, Seller } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { toPaise } from '@/lib/money';

/**
 * Automatic offers for the demo catalogue.
 *
 * Deliberately a MIX, because each type exercises a different branch of the
 * evaluator and a different piece of the interface:
 *
 *   - a live festive campaign, so the bag shows a discount with no code typed
 *   - a flash sale with a stock allocation, so the "ends when it sells out"
 *     path is reachable
 *   - a bank offer, which stays messaging until a card is chosen at payment
 *   - a buy-2-get-1, which discounts units rather than lines
 *   - a seller-funded offer, so the seller block in the bag has something in it
 *   - one that has already ENDED, so the expiry filter is exercised by real
 *     data rather than only by a unit test
 */
export function generatePromotions(
  categories: Category[],
  brands: Brand[],
  sellers: Seller[],
  now: Date,
): Promotion[] {
  const day = 86_400_000;
  const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day).toISOString();

  const women = categories.find((category) => category.slug === 'women');
  const ethnic =
    categories.find((category) => category.slug.includes('ethnic')) ?? women;
  const footwear = categories.find((category) => category.slug.includes('footwear'));
  const premiumBrand = brands.find((brand) => brand.isPremium) ?? brands[0];
  const flagship = sellers[0];
  const second = sellers[1] ?? sellers[0];

  const base = {
    categoryIds: [] as string[],
    brandIds: [] as string[],
    sellerIds: [] as string[],
    productIds: [] as string[],
    paymentMethods: [] as Promotion['paymentMethods'],
    bankName: null,
    maxDiscount: null as number | null,
    minOrderValue: 0,
    bannerUrl: null,
    badgeText: null as string | null,
    buyXGetY: null,
    stockLimit: null as number | null,
    stockSold: 0,
    isActive: true,
    createdAt: at(-40),
    updatedAt: at(-2),
  };

  const promotions: Promotion[] = [
    {
      ...base,
      id: entityId('prm'),
      slug: 'festive-edit',
      title: 'Festive Edit',
      subtitle: 'Ethnic wear, ready for the season',
      description: '20% off ethnic wear, applied automatically.',
      type: 'FESTIVAL_CAMPAIGN',
      value: 20,
      maxDiscount: toPaise(1500),
      minOrderValue: toPaise(1499),
      categoryIds: ethnic ? [ethnic.id] : [],
      startsAt: at(-12),
      endsAt: at(18),
      priority: 60,
      fundedBy: 'PLATFORM',
      badgeText: 'Festive 20%',
    },
    {
      ...base,
      id: entityId('prm'),
      slug: 'weekend-flash',
      title: 'Weekend Flash Sale',
      subtitle: 'While stocks last',
      description: 'Extra 30% off selected footwear. Limited units.',
      type: 'FLASH_SALE',
      value: 30,
      maxDiscount: toPaise(2000),
      categoryIds: footwear ? [footwear.id] : [],
      startsAt: at(-2),
      endsAt: at(3),
      priority: 90,
      fundedBy: 'PLATFORM',
      badgeText: 'Flash 30%',
      // A real allocation, so the sale genuinely ends rather than running for
      // ever at the platform's expense.
      stockLimit: 400,
      stockSold: 268,
    },
    {
      ...base,
      id: entityId('prm'),
      slug: 'hdfc-card-offer',
      title: '10% off with HDFC Bank cards',
      subtitle: 'On orders above ₹2,000',
      description: 'Instant 10% discount, up to ₹750, on HDFC credit and debit cards.',
      type: 'BANK_OFFER',
      value: 10,
      maxDiscount: toPaise(750),
      minOrderValue: toPaise(2000),
      paymentMethods: ['CARD'],
      bankName: 'HDFC Bank',
      startsAt: at(-30),
      endsAt: at(60),
      priority: 40,
      fundedBy: 'PLATFORM',
      badgeText: 'Bank offer',
    },
    {
      ...base,
      id: entityId('prm'),
      slug: 'buy-two-get-one',
      title: 'Buy 2, get 1 free',
      subtitle: 'On everyday basics',
      description: 'Add three basics and the cheapest is free.',
      type: 'BUY_X_GET_Y',
      value: 0,
      startsAt: at(-8),
      endsAt: at(22),
      priority: 70,
      fundedBy: 'SELLER',
      sellerIds: [flagship.id],
      badgeText: 'B2G1',
      buyXGetY: { buyQuantity: 2, getQuantity: 1, applyTo: 'CHEAPEST', discountPercent: 100 },
    },
    {
      ...base,
      id: entityId('prm'),
      slug: 'atelier-launch',
      title: `${second.displayName} launch offer`,
      subtitle: 'New store on Vestra',
      description: `Flat ₹300 off everything from ${second.displayName}.`,
      type: 'SELLER_OFFER',
      value: toPaise(300),
      minOrderValue: toPaise(1299),
      sellerIds: [second.id],
      startsAt: at(-5),
      endsAt: at(25),
      priority: 50,
      fundedBy: 'SELLER',
    },
    {
      ...base,
      id: entityId('prm'),
      slug: 'premium-brand-week',
      title: `${premiumBrand?.name ?? 'Premium'} Brand Week`,
      subtitle: 'Ended',
      description: '15% off, applied automatically during brand week.',
      type: 'PERCENT_DISCOUNT',
      value: 15,
      brandIds: premiumBrand ? [premiumBrand.id] : [],
      // Already over. Present so the expiry path is exercised by real data.
      startsAt: at(-40),
      endsAt: at(-9),
      priority: 30,
      fundedBy: 'PLATFORM',
      isActive: true,
    },
  ];

  return promotions;
}
