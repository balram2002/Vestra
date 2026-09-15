'use client';

import { ChevronDown, ChevronUp, Eye, EyeOff, LayoutGrid, Pencil, Plus, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import type { HomeSection, HomeSectionKind } from '@/domain/types';
import { cn } from '@/lib/cn';
import { setSectionActive } from '@/server/actions/admin';
import { createSection, moveSection, resetPageSections } from '@/server/actions/sections';

import { DESCRIPTIONS, LABELS } from './section-form';

/**
 * The page, as a list.
 *
 * This IS the page: the order here is the order shoppers scroll through, and
 * every row is a section they will meet. That is why a row says what the
 * section will actually contain -- "Hand-picked · 8 products · grid of 4" --
 * rather than only its type.
 *
 * NOTHING HERE DELETES. A section that should not be on the page is HIDDEN with
 * the eye, and stays in the list where it can be brought back with the same
 * click. A deleted rail with twenty hand-picked products is twenty searches
 * somebody has to do again; a hidden one is a click.
 *
 * Every change a shopper would notice asks first: hiding, showing and resetting
 * the page. Reordering does not -- it is undone with the opposite arrow, and a
 * confirmation on every nudge would teach people to click straight through the
 * ones that matter.
 *
 * Editing opens a PAGE, not a dialog: see `section-editor-page`.
 */
export function SectionBuilder({
  page,
  sections,
  addable,
}: {
  /** 'home', or a CMS page's slug. */
  page: string;
  sections: HomeSection[];
  addable: HomeSectionKind[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done?: string) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work.');
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });
  };

  const live = sections.filter((section) => section.isActive).length;

  return (
    <section aria-labelledby="composition">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="composition" className="text-ink text-md font-semibold">
            Sections
          </h2>
          <p className="text-muted mt-0.5 max-w-2xl text-xs">
            Top to bottom, this is the page. {live} of {sections.length} live — hidden sections
            stay here and show nothing to shoppers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="ghost" disabled={pending}>
                <RotateCcw className="size-4" aria-hidden />
                Reset page
              </Button>
            }
            title={page === 'home' ? 'Reset the homepage?' : 'Reset this page?'}
            description={
              page === 'home' || page === 'categories'
                ? 'The page goes back to its default layout: the original sections return live, in their original order and settings. Sections you added are hidden, not deleted.'
                : 'Every section on this page is hidden. Nothing is deleted, and each one can be shown again.'
            }
            confirmLabel="Reset page"
            tone="danger"
            requireText="RESET"
            onConfirm={() => run(() => resetPageSections({ page }), 'Page reset to its default layout')}
          />

          <AddSection
            addable={addable}
            page={page}
            onAdded={(sectionId) => router.push(`/admin/cms/sections/${sectionId}`)}
          />
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="border-line text-muted rounded-md border border-dashed px-4 py-8 text-sm">
          Nothing on this page yet. Add a section to begin.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Sections on this page">
          {sections.map((section, index) => {
            const name = section.title || LABELS[section.kind] || section.kind;

            return (
              <li
                key={section.id}
                data-section-row={section.kind}
                className={cn(
                  'border-line bg-raised flex flex-wrap items-start gap-3 rounded-md border p-3 sm:flex-nowrap',
                  !section.isActive && 'bg-sunken/60',
                )}
              >
                <span className="text-faint tabular w-5 shrink-0 pt-1 text-xs">{index + 1}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/cms/sections/${section.id}`}
                      className={cn(
                        'truncate text-sm font-medium hover:underline',
                        section.isActive ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {name}
                    </Link>
                    <span className="bg-sunken text-muted rounded px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide">
                      {LABELS[section.kind] ?? section.kind}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-3xs font-medium',
                        section.isActive ? 'bg-success-50 text-success-700' : 'bg-sunken text-faint',
                      )}
                    >
                      {section.isActive ? 'Live' : 'Hidden'}
                    </span>
                  </div>

                  <p className="text-faint mt-0.5 truncate text-2xs">{summarise(section)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    title="Move up"
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveSection({ sectionId: section.id, direction: 'UP' }))}
                    className={ROW_BUTTON}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    title="Move down"
                    disabled={pending || index === sections.length - 1}
                    onClick={() =>
                      run(() => moveSection({ sectionId: section.id, direction: 'DOWN' }))
                    }
                    className={ROW_BUTTON}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </button>

                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        aria-label={section.isActive ? 'Hide from the page' : 'Show on the page'}
                        title={section.isActive ? 'Hide from the page' : 'Show on the page'}
                        disabled={pending}
                        className={ROW_BUTTON}
                      >
                        {section.isActive ? (
                          <Eye className="size-4" aria-hidden />
                        ) : (
                          <EyeOff className="size-4" aria-hidden />
                        )}
                      </button>
                    }
                    title={section.isActive ? `Hide “${name}”?` : `Show “${name}”?`}
                    description={
                      section.isActive
                        ? 'It comes off the page for every shopper straight away. Nothing is deleted.'
                        : 'It joins the page for every shopper straight away.'
                    }
                    confirmLabel={section.isActive ? 'Hide section' : 'Show section'}
                    tone={section.isActive ? 'danger' : 'default'}
                    onConfirm={() =>
                      run(
                        () =>
                          setSectionActive({ sectionId: section.id, isActive: !section.isActive }),
                        section.isActive ? 'Hidden' : 'Live',
                      )
                    }
                  />

                  <Link
                    href={`/admin/cms/sections/${section.id}`}
                    aria-label="Edit"
                    title="Edit"
                    className={ROW_BUTTON}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const ROW_BUTTON = cn(
  'text-muted hover:bg-sunken hover:text-ink grid size-9 place-items-center rounded-md sm:size-8',
  'transition-colors disabled:pointer-events-none disabled:opacity-30',
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1',
);

/** What this section will actually show, in one line. */
function summarise(section: HomeSection): string {
  const parts: string[] = [];
  const config = section.config ?? {};

  switch (section.kind) {
    case 'PRODUCT_RAIL':
    case 'DEAL_COUNTDOWN': {
      const manual = config.source === 'MANUAL';
      parts.push(
        manual
          ? `${config.productIds?.length ?? 0} hand-picked`
          : sourceLabel(config.source ?? (section.kind === 'DEAL_COUNTDOWN' ? 'DEALS' : undefined)),
      );
      if (!manual && config.limit) parts.push(`${config.limit} products`);
      parts.push(layoutLabel(config.layout));
      if (section.kind === 'DEAL_COUNTDOWN') {
        parts.push(section.endsAt ? 'Counting down' : 'No end date, so no timer');
      }
      break;
    }
    case 'CATEGORY_STRIP':
      parts.push(
        config.categoryIds?.length
          ? `${config.categoryIds.length} hand-picked`
          : `${config.limit ?? 12} categories`,
      );
      break;
    case 'BRAND_STRIP':
      parts.push(
        config.brandIds?.length ? `${config.brandIds.length} hand-picked` : `${config.limit ?? 12} brands`,
      );
      break;
    case 'SELLER_SPOTLIGHT':
      parts.push(
        config.sellerIds?.length ? `${config.sellerIds.length} hand-picked` : `${config.limit ?? 4} stores`,
      );
      break;
    case 'BANNER_GRID':
      parts.push(config.bannerIds?.length ? `${config.bannerIds.length} tiles` : 'Every live tile');
      break;
    case 'REELS_STRIP':
      parts.push(`Up to ${config.limit ?? 10} clips`);
      break;
    case 'TESTIMONIALS':
      parts.push(`Up to ${config.limit ?? 6} verified reviews`);
      break;
    case 'EDITORIAL':
      parts.push(config.imageUrl ? 'With a picture' : 'Type only');
      if (section.ctaLabel) parts.push(`Button: ${section.ctaLabel}`);
      break;
    case 'VALUE_PROPS':
      parts.push('Edited under Appearance');
      break;
    case 'HERO_CAROUSEL':
      parts.push('Slides managed below');
      break;
    default:
      break;
  }

  if (section.visibleOn !== 'ALL') {
    parts.push(section.visibleOn === 'MOBILE' ? 'Phone only' : 'Desktop only');
  }
  if (section.startsAt || section.endsAt) parts.push('Scheduled');

  return parts.join(' · ');
}

function sourceLabel(source: HomeSection['config']['source']): string {
  switch (source) {
    case 'NEW_ARRIVALS':
      return 'Newest first';
    case 'TRENDING':
      return 'Trending';
    case 'DEALS':
      return 'Biggest discounts';
    case 'MANUAL':
      return 'Hand-picked';
    default:
      return 'Bestsellers';
  }
}

function layoutLabel(layout: HomeSection['config']['layout']): string {
  switch (layout) {
    case 'GRID_2':
      return 'grid of 2';
    case 'GRID_3':
      return 'grid of 3';
    case 'GRID_4':
      return 'grid of 4';
    default:
      return 'scrolling row';
  }
}

function AddSection({
  addable,
  page,
  onAdded,
}: {
  addable: HomeSectionKind[];
  page: string;
  onAdded: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const add = (kind: HomeSectionKind) => {
    startTransition(async () => {
      const result = await createSection({ kind, page });
      if (!result.ok || !result.sectionId) {
        toast.error(result.error ?? 'That could not be added.');
        return;
      }
      toast.success('Added, and hidden until you are ready');
      setOpen(false);
      // Straight to its editor: a section nobody has set up yet is the one
      // thing on this screen that certainly needs editing.
      onAdded(result.sectionId);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-4" aria-hidden />
          Add a section
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a section"
        description="It joins the foot of the page, hidden, and opens so you can set it up before anyone sees it."
        size="lg"
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {addable.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => add(kind)}
                disabled={pending}
                className={cn(
                  'border-line hover:border-accent-control h-full w-full rounded-md border p-3 text-left',
                  'transition-colors disabled:opacity-50',
                )}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="text-accent-ink size-4 shrink-0" aria-hidden />
                  <span className="text-ink text-sm font-medium">{LABELS[kind] ?? kind}</span>
                </span>
                <span className="text-muted mt-1 block text-xs">{DESCRIPTIONS[kind] ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
