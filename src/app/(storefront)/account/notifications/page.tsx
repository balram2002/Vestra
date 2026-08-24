import { Bell } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { MarkAllRead } from '@/components/account/mark-all-read';
import { NOTIFICATION_CATEGORIES } from '@/domain/enums';
import { formatRelative } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';
import { listNotifications } from '@/server/services/notifications';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return (
    <div className="gutter shell-max py-6">
      <AccountNav current="/account/notifications" />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Notifications />
      </Suspense>
    </div>
  );
}

async function Notifications() {
  const user = await requireUser();
  const [items, users] = await Promise.all([listNotifications(user.id), collections.users()]);
  const record = toEntity(await users.findOne({ _id: user.id }));
  const preferences = record?.preferences.notifications ?? {};

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-ink text-lg">Recent</h2>
          {items.some((item) => !item.read) ? <MarkAllRead /> : null}
        </div>

        {items.length === 0 ? (
          <div className="border-line mt-4 rounded-lg border border-dashed p-12 text-center">
            <Bell className="text-faint mx-auto size-7" aria-hidden strokeWidth={1.5} />
            <p className="text-ink mt-3 text-md font-medium">Nothing yet</p>
            <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
              Order updates, delivery news and refund confirmations arrive here.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-ink text-sm font-medium">{item.title}</p>
                    {!item.read ? (
                      <span
                        className="bg-accent mt-1.5 size-2 shrink-0 rounded-full"
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  <p className="text-muted mt-0.5 text-sm">{item.body}</p>
                  <p className="text-faint mt-1.5 text-2xs">
                    {formatRelative(item.createdAt)} - {item.category.toLowerCase()}
                  </p>
                </>
              );

              return (
                <li
                  key={item.id}
                  className={
                    item.read
                      ? 'border-line rounded-lg border p-4'
                      : 'border-accent-line bg-accent-soft/40 rounded-lg border p-4'
                  }
                >
                  {item.href ? (
                    <Link href={item.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="font-display text-ink text-lg">How we reach you</h2>
        <p className="text-muted mt-1 text-sm">
          In-app notifications are always on. These control everything else.
        </p>

        <ul className="border-line mt-4 divide-y rounded-lg border">
          {NOTIFICATION_CATEGORIES.filter((category) => category !== 'SYSTEM').map((category) => {
            const preference = preferences[category];
            const channels = [
              preference?.email ? 'Email' : null,
              preference?.sms ? 'SMS' : null,
              preference?.push ? 'Push' : null,
            ].filter(Boolean);

            return (
              <li key={category} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-ink text-xs capitalize">{category.toLowerCase()}</span>
                <span className="text-faint text-2xs">
                  {channels.length > 0 ? channels.join(', ') : 'In-app only'}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-faint mt-3 text-2xs">
          Marketing messages are only sent if you opt in, and never on a transactional channel.
        </p>
      </aside>
    </div>
  );
}
