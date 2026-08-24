import { SUPPORT } from '@/config/business';
import type {
  Notification,
  Order,
  OrderItem,
  SupportTicket,
  TicketMessage,
  User,
} from '@/domain/types';
import { entityId } from '@/lib/ids';
import { formatMoney } from '@/lib/format';
import { createRng, type Rng } from '@/lib/random';

/**
 * Notifications and support tickets for the demo dataset.
 *
 * Derived from the ORDERS that were generated rather than invented separately,
 * so every notification points at an order that exists and every ticket is
 * about something real. A notification centre full of messages referencing
 * orders that are not in the database is worse than an empty one — it looks
 * finished and behaves broken.
 */

export interface GeneratedEngagement {
  notifications: Notification[];
  tickets: SupportTicket[];
}

const TICKET_SUBJECTS: Array<{
  category: SupportTicket['category'];
  subject: string;
  body: string;
}> = [
  {
    category: 'DELIVERY_ISSUE',
    subject: 'Parcel marked delivered but not received',
    body: 'The tracking says delivered this morning but nothing arrived. I was home all day and the guard has not taken anything either. Could you check with the courier?',
  },
  {
    category: 'RETURN_REFUND',
    subject: 'Refund not received after return pickup',
    body: 'The courier collected the item eight days ago and the return shows as returned, but the refund has not reached my card. Could you confirm it has been sent?',
  },
  {
    category: 'PRODUCT_QUALITY',
    subject: 'Colour is noticeably different from the photos',
    body: 'The listing shows a deep indigo but what arrived is much closer to a washed grey-blue. I understand hand dyeing varies but this is a different colour entirely.',
  },
  {
    category: 'ORDER_ISSUE',
    subject: 'Wrong size delivered',
    body: 'I ordered a 38 and the tag inside says 42. The invoice in the parcel says 38, so it looks like a packing error.',
  },
  {
    category: 'PAYMENT_ISSUE',
    subject: 'Charged twice for the same order',
    body: 'My bank shows two debits for this order a minute apart. Only one order appears in my account. Please reverse the duplicate.',
  },
  {
    category: 'DELIVERY_ISSUE',
    subject: 'Can I change the delivery address?',
    body: 'I am travelling next week and will not be at the address I gave. Can this be redirected to my office, or should I cancel and reorder?',
  },
  {
    category: 'PRODUCT_QUALITY',
    subject: 'Seam came apart on second wear',
    body: 'The shoulder seam opened up after wearing it twice. I have photos if that helps. I would prefer a replacement in the same size.',
  },
];

const AGENT_REPLIES = [
  'Thanks for flagging this. I have raised it with the courier and asked for a delivery proof — they usually come back within 24 hours. I will update you as soon as I hear.',
  'I am sorry about this. I have approved a full refund and it should reach your original payment method within five working days. You do not need to send anything back.',
  'I have checked with the seller and they have confirmed the packing error. A replacement in the correct size is going out today at no charge, and we will collect the wrong one.',
  'I can see both debits. The second one is an authorisation that was never captured and it will drop off your statement within three to five working days.',
];

export function generateEngagement(args: {
  orders: Order[];
  items: OrderItem[];
  customers: User[];
  staff: User[];
  now: Date;
}): GeneratedEngagement {
  const rng = createRng('vestra-engagement');
  const { orders, items, customers, staff, now } = args;

  const notifications: Notification[] = [];
  const tickets: SupportTicket[] = [];

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const agents = staff.filter((person) => person.roles.includes('SUPPORT'));

  /* --------------------------------------------------------- notifications */

  // Only recent orders: a notification centre going back a year is noise, and
  // the real product would sweep them.
  const recent = orders
    .filter((order) => Date.parse(order.placedAt) > now.getTime() - 45 * 86_400_000)
    .slice(0, 260);

  for (const order of recent) {
    if (!order.userId) continue;

    push(notifications, order, 'ORDER', `Order ${order.orderNumber} placed`,
      'We have received your order. You can track every parcel from your orders page.',
      order.placedAt, rng);

    const orderItems = itemsByOrder.get(order.id) ?? [];
    const shipped = orderItems.find((item) =>
      ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(item.status),
    );

    if (shipped) {
      push(notifications, order, 'SHIPPING', `Order ${order.orderNumber} is on its way`,
        `"${shipped.productTitle}" has been handed to the courier.`,
        offset(order.placedAt, rng.int(20, 40)), rng);
    }

    if (order.status === 'DELIVERED') {
      push(notifications, order, 'SHIPPING', `Order ${order.orderNumber} delivered`,
        'Let us know how it fits — your review helps other shoppers get the size right.',
        offset(order.placedAt, rng.int(72, 150)), rng);
    }

    if (order.status === 'REFUNDED') {
      push(notifications, order, 'PAYMENT',
        `Refund of ${formatMoney(order.pricing.payable)} complete`,
        'The money is back with your original payment method.',
        offset(order.placedAt, rng.int(180, 300)), rng);
    }

    if (order.paymentStatus === 'FAILED') {
      push(notifications, order, 'PAYMENT',
        `Payment for ${order.orderNumber} did not go through`,
        'Nothing has been charged and your items are still held. Try again from your order.',
        offset(order.placedAt, 1), rng);
    }
  }

  /* -------------------------------------------------------------- tickets */

  const ticketCount = 34;
  for (let i = 0; i < ticketCount; i++) {
    const order = rng.pick(recent.length > 0 ? recent : orders);
    if (!order.userId) continue;

    const customer = customerById.get(order.userId);
    if (!customer) continue;

    const template = rng.pick(TICKET_SUBJECTS);
    const openedAt = offset(order.placedAt, rng.int(24, 240));
    const priority = rng.weighted<SupportTicket['priority']>([
      ['NORMAL', 54],
      ['HIGH', 24],
      ['LOW', 14],
      ['URGENT', 8],
    ]);

    const status = rng.weighted<SupportTicket['status']>([
      ['RESOLVED', 40],
      ['IN_PROGRESS', 22],
      ['OPEN', 18],
      ['WAITING_ON_CUSTOMER', 12],
      ['CLOSED', 8],
    ]);

    const answered = status !== 'OPEN';
    const agent = agents.length > 0 ? rng.pick(agents) : null;
    const ticketId = entityId('tkt');

    const messages: TicketMessage[] = [
      {
        id: entityId('msg'),
        ticketId,
        authorKind: 'CUSTOMER',
        authorName: customer.fullName,
        body: template.body,
        attachments: [],
        internal: false,
        createdAt: openedAt,
      },
    ];

    const respondedAt = answered ? offset(openedAt, rng.int(1, 20)) : null;

    if (answered && agent) {
      messages.push({
        id: entityId('msg'),
        ticketId,
        authorKind: 'AGENT',
        authorName: agent.fullName,
        body: rng.pick(AGENT_REPLIES),
        attachments: [],
        internal: false,
        createdAt: respondedAt!,
      });
    }

    tickets.push({
      id: ticketId,
      ticketNumber: `HD${String(2600 + i).padStart(6, '0')}`,
      userId: customer.id,
      requesterName: customer.fullName,
      requesterEmail: customer.email,
      subject: template.subject,
      category: template.category,
      status,
      priority,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderItemId: null,
      sellerId: null,
      assignedToUserId: answered && agent ? agent.id : null,
      assignedToName: answered && agent ? agent.fullName : null,
      messages,
      firstRespondedAt: respondedAt,
      resolvedAt:
        status === 'RESOLVED' || status === 'CLOSED'
          ? offset(respondedAt ?? openedAt, rng.int(2, 48))
          : null,
      // The SLA clock runs from opening, by priority.
      slaDueAt: offset(openedAt, SUPPORT.slaHours[priority]),
      satisfactionRating:
        status === 'RESOLVED' && rng.bool(0.5) ? rng.int(3, 5) : null,
      createdAt: openedAt,
      updatedAt: respondedAt ?? openedAt,
    });
  }

  return { notifications, tickets };
}

function push(
  into: Notification[],
  order: Order,
  category: Notification['category'],
  title: string,
  body: string,
  at: string,
  rng: Rng,
): void {
  into.push({
    id: entityId('ntf'),
    userId: order.userId!,
    category,
    title,
    body,
    href: `/orders/${order.id}`,
    imageUrl: null,
    // Older notifications are mostly read; recent ones mostly are not.
    read: Date.parse(at) < Date.now() - 5 * 86_400_000 ? rng.bool(0.85) : rng.bool(0.25),
    readAt: null,
    channels: ['IN_APP', 'EMAIL'],
    entityType: 'order',
    entityId: order.id,
    createdAt: at,
  });
}

function offset(from: string, hours: number): string {
  return new Date(Date.parse(from) + hours * 3_600_000).toISOString();
}
