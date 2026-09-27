import { connection } from 'next/server';
import { Suspense } from 'react';

import { LiveBand, StoresDirectoryView, StoryRow } from '@/components/commerce/stores-directory-view';
import type { StoresPageSettings, StoresPageVariant } from '@/domain/page-designs/stores';
import { orderStores, storyOrder, type DirectoryStore } from '@/domain/store-directory';
import { getStoreDirectory, liveStoreIds } from '@/server/services/store-directory';

const NOBODY: ReadonlySet<string> = new Set();

/**
 * The directory in one layout, shared by the live page and the staff preview
 * so the two can never drift.
 */
export async function StoresFrame({
  variant,
  settings,
  banner,
}: {
  variant: StoresPageVariant;
  settings: StoresPageSettings;
  banner?: React.ReactNode;
}) {
  const stores = orderStores(await getStoreDirectory(), settings.order, settings.openingSoon);

  // Who is live is a ninety-second heartbeat, so it is read at request time in
  // its own island. The fallback is the same story row with no one live yet:
  // the row paints with the page, and only the rings change.
  const live =
    settings.storyRow || settings.liveNow ? (
      <Suspense fallback={settings.storyRow ? <StoryRow stores={storyOrder(stores, NOBODY)} live={NOBODY} /> : null}>
        <LiveIsland stores={stores} settings={settings} />
      </Suspense>
    ) : null;

  return <StoresDirectoryView stores={stores} variant={variant} settings={settings} live={live} banner={banner} />;
}

async function LiveIsland({ stores, settings }: { stores: DirectoryStore[]; settings: StoresPageSettings }) {
  await connection();
  const live = settings.liveNow ? await liveStoreIds() : NOBODY;
  if (settings.storyRow) return <StoryRow stores={storyOrder(stores, live)} live={live} />;
  return <LiveBand stores={stores.filter((store) => live.has(store.id) && store.liveProducts > 0)} />;
}
