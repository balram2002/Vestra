/**
 * Console operations smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-console-ops.mjs
 *
 * The two things support and finance actually do all day: answer a ticket, and
 * put money back. Both are checked on their SIDE EFFECTS rather than on a
 * toast appearing — a reply that does not reach the customer's thread, or a
 * refund that is not capped and not audited, is the failure that matters.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

const client = await MongoClient.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
const db = client.db(process.env.MONGODB_DB ?? 'vestra');

const browser = await chromium.launch();

async function sessionFor(email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  return { context, page };
}

console.log('\nConsole operations\n');

/* ============================================================== support */

const ticket = await db.collection('supportTickets').findOne({ status: { $in: ['OPEN', 'IN_PROGRESS'] } });
check('an open ticket exists to answer', Boolean(ticket), ticket?.ticketNumber ?? '');

if (ticket) {
  const agent = await sessionFor('support@vestra.test');
  const messagesBefore = ticket.messages.length;

  await agent.page.goto(`${BASE}/admin/support/${ticket._id}`, { waitUntil: 'domcontentloaded' });
  await agent.page.getByLabel(/Reply to the customer/i).waitFor({ state: 'visible', timeout: 20000 });

  const detailText = await agent.page.locator('body').innerText();
  check('the ticket opens with its conversation', detailText.includes(ticket.ticketNumber));
  check('the requester email is masked', /•/.test(detailText), 'no masking found');

  /* ------------------------------------------------------ public reply */

  const reply = `Thanks for writing in. Checking this now — smoke ${Date.now().toString().slice(-6)}.`;
  await agent.page.getByLabel(/Reply to the customer/i).fill(reply);
  await agent.page.getByRole('button', { name: 'Send reply' }).click();

  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await db.collection('supportTickets').findOne({ _id: ticket._id });
    if (now.messages.length > messagesBefore) break;
    await agent.page.waitForTimeout(250);
  }

  const afterReply = await db.collection('supportTickets').findOne({ _id: ticket._id });
  const added = afterReply.messages[afterReply.messages.length - 1];

  check('the reply reached the thread', added?.body === reply, added?.body?.slice(0, 40) ?? '');
  check('it is attributed to the agent', added?.authorKind === 'AGENT', added?.authorKind ?? '');
  check('it is visible to the customer', added?.internal === false);
  check(
    'answering moved the ticket off the open queue',
    afterReply.status !== 'OPEN',
    afterReply.status,
  );
  check(
    'the agent took ownership of it',
    Boolean(afterReply.assignedToUserId),
    afterReply.assignedToName ?? 'unassigned',
  );
  check('the first-response clock was stopped', Boolean(afterReply.firstRespondedAt));

  /* ----------------------------------------------------- internal note */

  const note = `Internal: waiting on the courier — smoke ${Date.now().toString().slice(-6)}.`;
  await agent.page.getByRole('checkbox').first().check();
  await agent.page.getByLabel(/Internal note/i).first().fill(note);
  await agent.page.getByRole('button', { name: 'Add note' }).click();

  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await db.collection('supportTickets').findOne({ _id: ticket._id });
    if (now.messages.length > afterReply.messages.length) break;
    await agent.page.waitForTimeout(250);
  }

  const afterNote = await db.collection('supportTickets').findOne({ _id: ticket._id });
  const noteMessage = afterNote.messages[afterNote.messages.length - 1];
  check('the note was recorded as internal', noteMessage?.internal === true);

  /*
   * The point of an internal note: the customer must not see it. Checked
   * against the customer's own view, not against a flag in the database.
   */
  const customer = await db.collection('users').findOne({ _id: ticket.userId });
  if (customer) {
    const shopper = await sessionFor(customer.email);
    await shopper.page.goto(`${BASE}/account/support`, { waitUntil: 'domcontentloaded' });
    await shopper.page.waitForTimeout(1800);
    const customerView = await shopper.page.locator('body').innerText();

    check('the customer sees the reply', customerView.includes(reply.slice(0, 30)));
    check('the customer does NOT see the internal note', !customerView.includes(note.slice(0, 30)));
    await shopper.context.close();
  }

  await agent.context.close();
}

/* ============================================================== refunds */

/*
 * An order with nothing already refunded against it.
 *
 * The manual refund is capped at what is still owed, so an order that is
 * already fully refunded would make the action refuse — and the checks below
 * would then quietly grade a PRE-EXISTING refund instead of the one this test
 * raised.
 */
const refundedOrderIds = await db.collection('refunds').distinct('orderId');
const order = await db.collection('orders').findOne({
  paymentStatus: 'CAPTURED',
  'pricing.payable': { $gte: 100000 },
  _id: { $nin: refundedOrderIds },
});
check('a paid order exists to refund', Boolean(order), order?.orderNumber ?? '');

if (order) {
  const auditBefore = await db.collection('auditLogs').countDocuments({ action: 'order.refund' });

  /* ------------------------------------------- permission is enforced */

  // Support can read orders but must not be able to move money.
  const supportAgent = await sessionFor('support@vestra.test');
  await supportAgent.page.goto(`${BASE}/admin/orders/${order.orderNumber}`, { waitUntil: 'domcontentloaded' });
  await supportAgent.page.waitForTimeout(1800);
  const supportView = await supportAgent.page.locator('body').innerText();
  check('support can open the order', supportView.includes(order.orderNumber));
  check(
    'support is NOT offered the refund control',
    !/Refund this order/i.test(supportView),
    'refund control was visible to support',
  );
  await supportAgent.context.close();

  /* -------------------------------------------------- finance refunds */

  const finance = await sessionFor('finance@vestra.test');
  await finance.page.goto(`${BASE}/admin/orders/${order.orderNumber}`, { waitUntil: 'domcontentloaded' });
  await finance.page.waitForTimeout(1800);

  const refundTrigger = finance.page.getByRole('button', { name: 'Refund this order' });
  const offered = (await refundTrigger.count()) > 0;
  check('finance is offered the refund control', offered);

  if (offered) {
    await refundTrigger.click();
    await finance.page.waitForTimeout(400);

    // Deliberately more than the order is worth: the cap must hold.
    const excessive = Math.round(order.pricing.payable / 100) * 10;
    await finance.page.getByLabel(/Amount/i).fill(String(excessive));
    await finance.page.getByLabel(/Reason/i).fill('Courier lost the parcel in transit');

    await finance.page.getByRole('button', { name: /^Refund ₹/ }).click();

    for (let attempt = 0; attempt < 40; attempt++) {
      const found = await db.collection('refunds').countDocuments({ orderId: order._id });
      if (found > 0) break;
      await finance.page.waitForTimeout(250);
    }

    const refunds = await db.collection('refunds').find({ orderId: order._id }).toArray();
    const manual = refunds.find((refund) => refund.initiatedByUserId);

    check('a refund was raised', Boolean(manual), `${refunds.length} refunds on the order`);

    if (manual) {
      check(
        'the amount was capped at what the order is worth',
        manual.amount <= order.pricing.payable,
        `${manual.amount} vs ${order.pricing.payable}`,
      );
      check('the reason was recorded', manual.reason.length > 3, manual.reason);
      check('it records who raised it', Boolean(manual.initiatedByUserId));
      check(
        'it is not attributed to specific lines',
        Array.isArray(manual.items) && manual.items.length === 0,
        `${manual.items?.length} items`,
      );

      /*
       * Poll for the audit entry rather than reading it once.
       *
       * The refund ROW is written before the audit entry is, so the moment the
       * poll above sees the refund the server is still a couple of awaits away
       * from recording it. Reading the count straight afterwards is a race that
       * loses often enough to matter.
       */
      let auditAfter = auditBefore;
      for (let attempt = 0; attempt < 40; attempt++) {
        auditAfter = await db.collection('auditLogs').countDocuments({ action: 'order.refund' });
        if (auditAfter > auditBefore) break;
        await finance.page.waitForTimeout(250);
      }
      check('the refund was audited', auditAfter > auditBefore, `${auditBefore} → ${auditAfter}`);

      const entry = await db
        .collection('auditLogs')
        .findOne({ action: 'order.refund' }, { sort: { occurredAt: -1 } });
      check('the audit entry is marked critical', entry?.severity === 'CRITICAL', entry?.severity);

      /*
       * Clean up only what this test created. `manual` is guaranteed to be the
       * test's own refund because the order was chosen with none against it.
       */
      await db.collection('refunds').deleteOne({ _id: manual._id });
      if (entry) await db.collection('auditLogs').deleteOne({ _id: entry._id });
    }
  }

  await finance.context.close();
}

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
