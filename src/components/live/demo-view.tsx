import type { DemoPageSettings, DemoPageVariant } from '@/domain/page-designs/demo';
import type { ProductDemoData } from '@/server/services/product-demo';

import { DemoShowroom } from './demo-showroom';
import { DemoStories } from './demo-stories';
import { ProductDemo } from './product-demo';

/** The demo in whichever layout is live (or being previewed). */
export function DemoView({
  demo,
  variant,
  settings,
}: {
  demo: ProductDemoData;
  variant: DemoPageVariant;
  settings: DemoPageSettings;
}) {
  if (variant === 'showroom') return <DemoShowroom key={demo.path} demo={demo} settings={settings} />;
  if (variant === 'stories') return <DemoStories key={demo.path} demo={demo} settings={settings} />;
  return <ProductDemo key={demo.path} demo={demo} settings={settings} />;
}
