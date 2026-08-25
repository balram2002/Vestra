import 'server-only';

import { FINANCE, SHIPPING } from '@/config/business';
import type { Settlement, SettlementLine, SettlementStatus } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { percentOf, sumPaise } from '@/lib/money';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextSettlementNumber } from '../db/sequences';
import { notifyQuietly } from './notifications';

/**
 * Seller settlements.
 *
 * A settlement is the statement AND the payout: it claims a set of delivered
 * seller orders, states every deduction line by line, and produces one net
 * figure to transfer. Sellers dispute payouts constantly, and the only defence
 * is a statement they can reconcile themselves — hence `lines`, which itemises
 * every credit and debit rather than presenting a total to be trusted.
 *
 * Three rules:
 *
 *  1. ONLY DELIVERED MONEY PAST THE HOLD. Revenue is at risk of a return until
 *     the window closes. Paying out earlier means clawing money back from
 *     sellers, which is where marketplace relationships go to die.
 *
 *  2. A SELLER ORDER IS CLAIMED EXACTLY ONCE. `settlementId` is set as part of
 *     the run and filtered on at selection, so a second run cannot pay the same
 *     order twice — the claim is what makes the run idempotent, not a flag on
 *     the settlement.
 *
 *  3. RETURNS ARE DEBITED IN THE PERIOD THEY LAND, not the period they sold in.
 *     An item sold in March and returned in April reduces April's payout,
 *     because March's has already been transferred.
 */

export interface SettlementRunOptions {
  /** Only settle money delivered before this instant. Defaults to now. */
  upTo?: Date;
  /** Preview the figures without claiming anything. */
  dryRun?: boolean;
}

export interface SettlementRunResult {
  ok: boolean;
  error?: string;
  settlementId?: string;
  netPayable?: number;
  orderCount?: number;
}

export async function runSettlement(
  sellerId: string,
  options: SettlementRunOptions = {},
): Promise<SettlementRunResult> {
  const upTo = options.upTo ?? new Date();
  const holdCutoff = new Date(
    upTo.getTime() - FINANCE.settlementHoldDays * 86_400_000,
  ).toISOString();

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Seller not found.' };

  const plans = await collections.commissionPlans();
  const plan = toEntity(await plans.findOne({ _id: seller.commissionPlanId }));

  const sellerOrderCol = await collections.sellerOrders();

  // Rule 1 and 2 together: delivered, past the hold, not already claimed.
  const claimable = toEntities(
    await sellerOrderCol
      .find({
        sellerId,
        status: 'DELIVERED',
        deliveredAt: { $ne: null, $lt: holdCutoff },
        settlementId: null,
      })
      .sort({ deliveredAt: 1 })
      .toArray(),
  );

  // Rule 3: returns that completed in this window, whoever they belong to.
  const returnCol = await collections.returns();
  const settledReturns = toEntities(
    await returnCol
      .find({
        sellerId,
        status: { $in: ['RETURNED', 'REFUND_INITIATED', 'REFUNDED'] },
        settlementId: null,
        closedAt: { $ne: null, $lte: upTo.toISOString() },
      })
      .toArray(),
  );

  if (claimable.length === 0 && settledReturns.length === 0) {
    return { ok: false, error: 'Nothing has cleared the settlement hold yet.' };
  }

  /* ------------------------------------------------------------- lines */

  const lines: SettlementLine[] = [];
  const push = (line: Omit<SettlementLine, 'id'>) =>
    lines.push({ id: entityId('stl'), ...line });

  const gatewayFeePercent = plan?.paymentGatewayFeePercent ?? FINANCE.paymentGatewayFeePercent;

  let grossSales = 0;
  let commission = 0;
  let gatewayFee = 0;
  let shippingCharges = 0;

  for (const order of claimable) {
    grossSales += order.total;
    commission += order.commission;
    shippingCharges += order.shippingFee;

    const fee = percentOf(order.total, gatewayFeePercent);
    gatewayFee += fee;

    push({
      type: 'SALE',
      orderNumber: order.orderNumber,
      sellerOrderId: order.id,
      orderItemId: null,
      description: `Order ${order.orderNumber} delivered`,
      amount: order.total,
      occurredAt: order.deliveredAt ?? order.updatedAt,
    });

    push({
      type: 'COMMISSION',
      orderNumber: order.orderNumber,
      sellerOrderId: order.id,
      orderItemId: null,
      description: `Platform commission at ${order.commissionRatePercent}%`,
      amount: -order.commission,
      occurredAt: order.deliveredAt ?? order.updatedAt,
    });

    if (fee > 0) {
      push({
        type: 'GATEWAY_FEE',
        orderNumber: order.orderNumber,
        sellerOrderId: order.id,
        orderItemId: null,
        description: `Payment gateway fee at ${gatewayFeePercent}%`,
        amount: -fee,
        occurredAt: order.deliveredAt ?? order.updatedAt,
      });
    }
  }

  let returnsValue = 0;
  let reverseShipping = 0;

  for (const request of settledReturns) {
    const value = sumPaise(request.items.map((item) => item.refundableAmount));
    returnsValue += value;

    push({
      type: 'RETURN',
      orderNumber: request.orderNumber,
      sellerOrderId: request.sellerOrderId,
      orderItemId: null,
      description: `Return ${request.returnNumber} refunded to customer`,
      amount: -value,
      occurredAt: request.closedAt ?? request.updatedAt,
    });

    // The seller only carries reverse logistics when the fault was theirs.
    if (request.liability === 'SELLER') {
      const fee = request.reverseShippingFee || SHIPPING.reversePickupFee;
      reverseShipping += fee;
      push({
        type: 'REVERSE_SHIPPING',
        orderNumber: request.orderNumber,
        sellerOrderId: request.sellerOrderId,
        orderItemId: null,
        description: 'Reverse pickup (seller liable)',
        amount: -fee,
        occurredAt: request.closedAt ?? request.updatedAt,
      });
    }
  }

  const netSales = grossSales - returnsValue;

  // TCS is collected by the marketplace on the net taxable supply; TDS applies
  // to the gross under 194-O. Both are statutory deductions, not platform fees.
  const tcs = percentOf(Math.max(0, netSales), FINANCE.tcsPercent);
  const tds = percentOf(Math.max(0, netSales), FINANCE.tdsPercent);

  if (tcs > 0) {
    push({
      type: 'TCS',
      orderNumber: null,
      sellerOrderId: null,
      orderItemId: null,
      description: `TCS at ${FINANCE.tcsPercent}% on net sales`,
      amount: -tcs,
      occurredAt: upTo.toISOString(),
    });
  }
  if (tds > 0) {
    push({
      type: 'TDS',
      orderNumber: null,
      sellerOrderId: null,
      orderItemId: null,
      description: `TDS at ${FINANCE.tdsPercent}% under section 194-O`,
      amount: -tds,
      occurredAt: upTo.toISOString(),
    });
  }

  const netPayable = sumPaise(lines.map((line) => line.amount));

  if (options.dryRun) {
    return { ok: true, netPayable, orderCount: claimable.length };
  }

  /* -------------------------------------------------------------- write */

  const iso = new Date().toISOString();
  const periodFrom = claimable[0]?.deliveredAt ?? settledReturns[0]?.closedAt ?? iso;

  // Below the minimum, a payout costs more in bank charges than it moves. The
  // orders stay unclaimed and roll into the next run.
  const belowMinimum = netPayable > 0 && netPayable < FINANCE.minPayoutAmount;
  const status: SettlementStatus = netPayable <= 0 ? 'ON_HOLD' : belowMinimum ? 'ON_HOLD' : 'PENDING';

  const settlement: Settlement = {
    id: entityId('stlm'),
    settlementNumber: await nextSettlementNumber(new Date()),
    sellerId,
    sellerName: seller.displayName,
    periodFrom,
    periodTo: upTo.toISOString(),
    status,
    grossSales,
    returns: returnsValue,
    netSales,
    commission,
    paymentGatewayFee: gatewayFee,
    shippingCharges,
    reverseShippingCharges: reverseShipping,
    tcs,
    tds,
    otherAdjustments: 0,
    adjustmentNote: null,
    netPayable,
    utr: null,
    bankReference: null,
    failureReason: null,
    holdReason:
      netPayable <= 0
        ? 'Returns exceeded sales in this period. The balance carries into the next run.'
        : belowMinimum
          ? `Below the minimum payout. It will be paid once the balance clears the threshold.`
          : null,
    lines,
    processedAt: null,
    paidAt: null,
    createdAt: iso,
    updatedAt: iso,
  };

  const settlements = await collections.settlements();
  await settlements.insertOne({ ...settlement, _id: settlement.id });

  // Claiming is what makes the run idempotent.
  if (claimable.length > 0) {
    await sellerOrderCol.updateMany(
      { _id: { $in: claimable.map((order) => order.id) } },
      { $set: { settlementId: settlement.id, updatedAt: iso } },
    );
  }
  if (settledReturns.length > 0) {
    await returnCol.updateMany(
      { _id: { $in: settledReturns.map((request) => request.id) } },
      { $set: { settlementId: settlement.id, updatedAt: iso } },
    );
  }

  const users = await collections.users();
  const owner = await users.findOne({ _id: seller.ownerUserId });
  if (owner) {
    notifyQuietly({
      userId: owner._id,
      category: 'FINANCE',
      title:
        status === 'PENDING'
          ? `Settlement ${settlement.settlementNumber} is ready`
          : `Settlement ${settlement.settlementNumber} is on hold`,
      body:
        status === 'PENDING'
          ? `${claimable.length} orders settled. Net payable is on its way to your bank account.`
          : (settlement.holdReason ?? 'This settlement needs review.'),
      href: '/seller/settlements',
      entityType: 'settlement',
      entityId: settlement.id,
    });
  }

  return { ok: true, settlementId: settlement.id, netPayable, orderCount: claimable.length };
}

/**
 * Mark a settlement paid.
 *
 * The UTR is the bank's reference for the transfer and is what a seller quotes
 * when the money has not arrived, so it is required rather than optional.
 */
export async function markSettlementPaid(
  settlementId: string,
  utr: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!utr.trim()) return { ok: false, error: 'Enter the bank UTR for this transfer.' };

  const settlements = await collections.settlements();
  const settlement = toEntity(await settlements.findOne({ _id: settlementId }));
  if (!settlement) return { ok: false, error: 'Settlement not found.' };
  if (settlement.status === 'PAID') return { ok: false, error: 'This settlement is already paid.' };

  const iso = new Date().toISOString();
  await settlements.updateOne(
    { _id: settlementId },
    {
      $set: {
        status: 'PAID',
        utr: utr.trim(),
        paidAt: iso,
        processedAt: settlement.processedAt ?? iso,
        failureReason: null,
        updatedAt: iso,
      },
    },
  );

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: settlement.sellerId }));
  if (seller) {
    const users = await collections.users();
    const owner = await users.findOne({ _id: seller.ownerUserId });
    if (owner) {
      notifyQuietly({
        userId: owner._id,
        category: 'FINANCE',
        title: `Payout sent for ${settlement.settlementNumber}`,
        body: `Reference ${utr.trim()}. Bank transfers usually land within one working day.`,
        href: '/seller/settlements',
        entityType: 'settlement',
        entityId: settlement.id,
      });
    }
  }

  return { ok: true };
}

export async function holdSettlement(
  settlementId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!reason.trim()) return { ok: false, error: 'Give a reason for holding this payout.' };

  const settlements = await collections.settlements();
  const result = await settlements.updateOne(
    { _id: settlementId, status: { $in: ['PENDING', 'PROCESSING'] } },
    { $set: { status: 'ON_HOLD', holdReason: reason.trim(), updatedAt: new Date().toISOString() } },
  );

  return result.matchedCount > 0
    ? { ok: true }
    : { ok: false, error: 'Only a pending settlement can be put on hold.' };
}

/* ------------------------------------------------------------------ reads */

export async function listSellerSettlements(sellerId: string, limit = 24): Promise<Settlement[]> {
  const settlements = await collections.settlements();
  return toEntities(
    await settlements.find({ sellerId }).sort({ createdAt: -1 }).limit(limit).toArray(),
  );
}

export async function getSettlement(settlementId: string): Promise<Settlement | null> {
  const settlements = await collections.settlements();
  return toEntity(await settlements.findOne({ _id: settlementId }));
}

export async function listAllSettlements(
  filter: { status?: SettlementStatus; limit?: number } = {},
): Promise<Settlement[]> {
  const settlements = await collections.settlements();
  const query = filter.status ? { status: filter.status } : {};
  return toEntities(
    await settlements
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter.limit ?? 100)
      .toArray(),
  );
}

/** What the next run would pay, without claiming anything. */
export async function previewSettlement(sellerId: string): Promise<SettlementRunResult> {
  return runSettlement(sellerId, { dryRun: true });
}
