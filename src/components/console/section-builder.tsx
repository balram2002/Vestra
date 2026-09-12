'use client';

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import type { HomeSection, HomeSectionKind } from '@/domain/types';
import { cn } from '@/lib/cn';
import { setSectionActive } from '@/server/actions/admin';
import { createSection, deleteSection, moveSection } from '@/server/actions/sections';

import { DESCRIPTIONS, LABELS, SectionEditor } from './section-editor';

/**
 * The page, as a list.
 *
 * This IS the page: the order here is the order shoppers scroll through, and
 * every row is a section they will meet. That is why the row shows what the
 * section will actually contain -- "Hand-picked · 8 products · grid of 4" --
 * rather than only its type. A builder that shows a list of type names makes an
 * editor open every one to find the rail they meant to change.
 *
 * REORDERING IS ARROWS, NOT DRAG-AND-DROP. Dragging is lovely with a mouse and
 * miserable with a keyboard, a screen reader or a thumb, and this list is short
 * by nature -- a page with forty sections is a different problem. The arrows
 * work everywhere and say exactly what they do.
 *
 * A NEW SECTION ARRIVES HIDDEN, so a half-configured rail is never in front of
 * shoppers. Making it live is a deliberate second step.
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
  const [editing, setEditing] = useState<HomeSection | null>(null);

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

  return (
    <section aria-labelledby="composition">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="composition" className="text-ink text-md font-semibold">
            Sections
          </h2>
          <p className="text-muted mt-0.5 max-w-2xl text-xs">
            Top to bottom, this is the page. Hidden sections stay here and show nothing to
            shoppers.
          </p>
        </div>

        <AddSection addable={addable} page={page} onAdded={() => router.refresh()} />
      </div>

      {sections.length === 0 ? (
        <p className="border-line text-muted rounded-md border border-dashed px-4 py-8 text-sm">
          Nothing on this page yet. Add a section to begin.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Sections on this page">
          {sections.map((section, index) => (
            <li
              key={section.id}
              data-section-row={section.kind}
              className={cn(
                'border-line bg-raised flex items-start gap-3 rounded-md border p-3',
                !section.isActive && 'opacity-70',
              )}
            >
              <span className="text-faint tabular w-5 shrink-0 pt-1 text-xs">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-ink truncate text-sm font-medium">
                    {section.title || LABELS[section.kind] || section.kind}
                  </p>
                  <span className="bg-sunken text-muted rounded px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide">
                    {LABELS[section.kind] ?? section.kind}
                  </span>
                  {section.isActive ? null : (
                    <span className="text-faint text-2xs">Hidden</span>
                  )}
                </div>

                <p className="text-faint mt-0.5 truncate text-2xs">{summarise(section)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <RowButton
                  label="Move up"
                  disabled={pending || index === 0}
                  onClick={() => run(() => moveSection({ sectionId: section.id, direction: 'UP' }))}
                >
                  <ChevronUp className="size-4" aria-hidden />
                </RowButton>
                <RowButton
                  label="Move down"
                  disabled={pending || index === sections.length - 1}
                  onClick={() =>
                    run(() => moveSection({ sectionId: section.id, direction: 'DOWN' }))
                  }
                >
                  <ChevronDown className="size-4" aria-hidden />
                </RowButton>
                <RowButton
                  label={section.isActive ? 'Hide from the page' : 'Show on the page'}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        setSectionActive({ sectionId: section.id, isActive: !section.isActive }),
                      section.isActive ? 'Hidden' : 'Live',
                    )
                  }
                >
                  {section.isActive ? (
                    <Eye className="size-4" aria-hidden />
                  ) : (
                    <EyeOff className="size-4" aria-hidden />
                  )}
                </RowButton>
                <RowButton label="Edit" disabled={pending} onClick={() => setEditing(section)}>
                  <Pencil className="size-4" aria-hidden />
                </RowButton>
                <DeleteSection
                  name={section.title || LABELS[section.kind] || section.kind}
                  onConfirm={() =>
                    run(() => deleteSection({ sectionId: section.id }), 'Section removed')
                  }
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing ? (
        <SectionEditor
          key={editing.id}
          section={editing}
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </section>
  );
}

/** What this section will actually show, in one line. */
function summarise(section: HomeSection): string {
  const parts: string[] = [];
  const config = section.config ?? {};

  switch (section.kind) {
    case 'PRODUCT_RAIL': {
      const manual = config.source === 'MANUAL';
      parts.push(manual ? `${config.productIds?.length ?? 0} hand-picked` : sourceLabel(config.source));
      if (!manual && config.limit) parts.push(`${config.limit} products`);
      parts.push(layoutLabel(config.layout));
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

function RowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'text-muted hover:bg-sunken hover:text-ink grid size-8 place-items-center rounded-md',
        'transition-colors disabled:opacity-30',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1',
      )}
    >
      {children}
    </button>
  );
}

function AddSection({
  addable,
  page,
  onAdded,
}: {
  addable: HomeSectionKind[];
  page: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const add = (kind: HomeSectionKind) => {
    startTransition(async () => {
      const result = await createSection({ kind, page });
      if (!result.ok) {
        toast.error(result.error ?? 'That could not be added.');
        return;
      }
      toast.success('Added, and hidden until you are ready');
      setOpen(false);
      onAdded();
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
        description="It joins the foot of the page, hidden, so you can set it up before anyone sees it."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {addable.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => add(kind)}
                disabled={pending}
                className={cn(
                  'border-line hover:border-accent-control w-full rounded-md border p-3 text-left',
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

function DeleteSection({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          className="text-danger-600 hover:bg-danger-50 grid size-8 place-items-center rounded-md transition-colors"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent
        title="Remove this section?"
        description={`"${name}" comes off the page. The products, brands and banners in it are not touched.`}
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Keep it
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Remove
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
