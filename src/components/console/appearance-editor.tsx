'use client';

import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ICON_LABELS } from '@/components/ui/content-icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTENT_ICONS,
  type AnnouncementItem,
  type ContentIcon as IconKey,
  type FooterBadge,
  type FooterColumn,
  type HeaderActions,
  type SiteContent,
  type ValueProp,
} from '@/domain/site-content';
import { cn } from '@/lib/cn';
import {
  resetAppearance,
  saveAppearance,
  type AppearanceBlock,
} from '@/server/actions/appearance';

/**
 * The shop's words, edited.
 *
 * ONE BLOCK AT A TIME. Each card holds its own draft, its own Save and its own
 * Reset, so an administrator fixing a typo in the strip cannot accidentally
 * publish a half-finished footer they scrolled past. It also means a failed
 * save loses one card's work rather than the screen's.
 *
 * Rows are edited in place and ORDER IS THE ORDER SHOWN: the arrows move a row
 * up and down the list, and the list is exactly what the storefront renders.
 * No hidden position field, no sort order to reason about.
 *
 * Nothing is saved as you type. A strip that changed under shoppers on every
 * keystroke would be a different shop every second, so the draft stays local
 * until Save is pressed -- and the card says when it is holding unsaved work.
 */
export function AppearanceEditor({ content }: { content: SiteContent }) {
  return (
    <div className="mt-6 space-y-6">
      <AnnouncementsBlock initial={content.announcements} />
      <HeaderActionsBlock initial={content.headerActions} />
      <ValuePropsBlock initial={content.valueProps} />
      <FooterBadgesBlock initial={content.footerBadges} />
      <FooterColumnsBlock initial={content.footerColumns} />
    </div>
  );
}

/* ------------------------------------------------------------- the shell */

function useBlock<T>(block: AppearanceBlock, initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = () => {
    startTransition(async () => {
      const result = await saveAppearance({ block, value: draft });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(draft);
      toast.success('Saved — live on the shop');
    });
  };

  const reset = () => {
    startTransition(async () => {
      const result = await resetAppearance({ block });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not reset.');
        return;
      }
      toast.success('Back to the original. Reload to see it here.');
    });
  };

  return { draft, setDraft, dirty, pending, save, reset };
}

function Block({
  title,
  description,
  dirty,
  pending,
  onSave,
  onReset,
  children,
}: {
  title: string;
  description: string;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-raised rounded-lg border">
      <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-ink text-sm font-semibold">{title}</h2>
          <p className="text-muted mt-0.5 text-xs">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {dirty ? <span className="text-warning-700 text-2xs font-medium">Unsaved</span> : null}
          <Button type="button" size="xs" variant="ghost" onClick={onReset} disabled={pending}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
          <Button type="button" size="xs" onClick={onSave} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** A row's own controls: where it sits, and whether it stays. */
function RowTools({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        label="Move up"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        icon={<ChevronUp className="size-4" aria-hidden />}
      />
      <IconButton
        label="Move down"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        icon={<ChevronDown className="size-4" aria-hidden />}
      />
      <IconButton
        label="Remove"
        onClick={() => onRemove(index)}
        icon={<Trash2 className="size-4" aria-hidden />}
        danger
      />
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-md transition-colors',
        'hover:bg-sunken disabled:opacity-30',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1',
        danger ? 'text-danger-600' : 'text-muted',
      )}
    >
      {icon}
    </button>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Ids are stable and readable, so a saved block is legible in the database. */
function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-line bg-canvas flex items-start gap-3 rounded-md border p-3">
      {children}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="xs" variant="secondary" onClick={onClick}>
      <Plus className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}

/**
 * The icon picker, in a box of its own.
 *
 * A `Field` paints itself `w-full`, which as a bare flex child means "take the
 * row" -- and it did, squeezing the label beside it to nothing. The fixed,
 * non-shrinking wrapper is what keeps a row a row.
 */
function IconSelect({
  value,
  onChange,
}: {
  value: IconKey;
  onChange: (value: IconKey) => void;
}) {
  return (
    <div className="w-36 shrink-0">
      <Select
        label="Icon"
        hideLabel
        value={value}
        onChange={(event) => onChange(event.target.value as IconKey)}
      >
        {CONTENT_ICONS.map((icon) => (
          <option key={icon} value={icon}>
            {ICON_LABELS[icon]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/* ------------------------------------------------------- announcements */

function AnnouncementsBlock({ initial }: { initial: AnnouncementItem[] }) {
  const { draft, setDraft, dirty, pending, save, reset } = useBlock('announcements', initial);

  const update = (index: number, patch: Partial<AnnouncementItem>) =>
    setDraft(draft.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  return (
    <Block
      title="Announcement strip"
      description="The band above the header. It scrolls on a phone and sits still on a desktop."
      dirty={dirty}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      {draft.map((item, index) => (
        <Row key={item.id}>
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1fr]">
            <Input
              label="Text"
              hideLabel
              value={item.text}
              onChange={(event) => update(index, { text: event.target.value })}
              maxLength={120}
              placeholder="Free delivery above ₹1,199"
            />
            <Input
              label="Link"
              hideLabel
              value={item.href ?? ''}
              onChange={(event) => update(index, { href: event.target.value || null })}
              placeholder="/help/shipping (optional)"
            />
          </div>

          <label className="flex shrink-0 items-center gap-1.5 pt-2 text-2xs">
            <input
              type="checkbox"
              checked={item.isActive}
              onChange={(event) => update(index, { isActive: event.target.checked })}
              className="accent-ink size-4"
            />
            <span className="text-muted">Show</span>
          </label>

          <RowTools
            index={index}
            count={draft.length}
            onMove={(from, to) => setDraft(move(draft, from, to))}
            onRemove={(at) => setDraft(draft.filter((_, position) => position !== at))}
          />
        </Row>
      ))}

      <AddButton
        label="Add a line"
        onClick={() =>
          setDraft([...draft, { id: newId('note'), text: '', href: null, isActive: true }])
        }
      />
    </Block>
  );
}

/* -------------------------------------------------------- header actions */

function HeaderActionsBlock({ initial }: { initial: HeaderActions }) {
  const { draft, setDraft, dirty, pending, save, reset } = useBlock('headerActions', initial);

  const rows: Array<{ key: keyof HeaderActions; label: string; description: string }> = [
    { key: 'search', label: 'Search', description: 'The field on desktop and the icon on a phone.' },
    { key: 'reels', label: 'Reels', description: 'The video feed, in the bottom bar and the menu.' },
    { key: 'wishlist', label: 'Saved items', description: 'The heart, and the Saved tab.' },
    { key: 'bag', label: 'Bag', description: 'Turning this off hides the way to checkout.' },
  ];

  return (
    <Block
      title="Header and bottom bar"
      description="Which actions the shop offers. An action turned off disappears everywhere at once."
      dirty={dirty}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      <div className="divide-line divide-y">
        {rows.map((row) => (
          <Switch
            key={row.key}
            label={row.label}
            description={row.description}
            checked={draft[row.key]}
            onChange={(event) => setDraft({ ...draft, [row.key]: event.target.checked })}
          />
        ))}
      </div>
    </Block>
  );
}

/* ------------------------------------------------------------ promises */

function ValuePropsBlock({ initial }: { initial: ValueProp[] }) {
  const { draft, setDraft, dirty, pending, save, reset } = useBlock('valueProps', initial);

  const update = (index: number, patch: Partial<ValueProp>) =>
    setDraft(draft.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  return (
    <Block
      title="Promises"
      description="The band near the foot of the homepage. Each one should state a number rather than a claim."
      dirty={dirty}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      {draft.map((item, index) => (
        <Row key={item.id}>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <IconSelect value={item.icon} onChange={(icon) => update(index, { icon })} />
              <div className="min-w-48 flex-1">
                <Input
                  label="Title"
                  hideLabel
                  value={item.title}
                  onChange={(event) => update(index, { title: event.target.value })}
                  maxLength={80}
                  placeholder="Free delivery above ₹1,199"
                />
              </div>
              <label className="flex shrink-0 items-center gap-1.5 pt-2 text-2xs">
                <input
                  type="checkbox"
                  checked={item.isActive}
                  onChange={(event) => update(index, { isActive: event.target.checked })}
                  className="accent-ink size-4"
                />
                <span className="text-muted">Show</span>
              </label>
            </div>

            <Textarea
              label="Body"
              hideLabel
              rows={2}
              value={item.body}
              onChange={(event) => update(index, { body: event.target.value })}
              maxLength={400}
              placeholder="Standard delivery in 3–6 days, calculated from the pincode."
            />
          </div>

          <RowTools
            index={index}
            count={draft.length}
            onMove={(from, to) => setDraft(move(draft, from, to))}
            onRemove={(at) => setDraft(draft.filter((_, position) => position !== at))}
          />
        </Row>
      ))}

      {draft.length < 6 ? (
        <AddButton
          label="Add a promise"
          onClick={() =>
            setDraft([
              ...draft,
              { id: newId('promise'), icon: 'sparkle', title: '', body: '', isActive: true },
            ])
          }
        />
      ) : null}
    </Block>
  );
}

/* -------------------------------------------------------------- footer */

function FooterBadgesBlock({ initial }: { initial: FooterBadge[] }) {
  const { draft, setDraft, dirty, pending, save, reset } = useBlock('footerBadges', initial);

  const update = (index: number, patch: Partial<FooterBadge>) =>
    setDraft(draft.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  return (
    <Block
      title="Footer badges"
      description="The short reassurances at the point of leaving."
      dirty={dirty}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      {draft.map((item, index) => (
        <Row key={item.id}>
          <IconSelect value={item.icon} onChange={(icon) => update(index, { icon })} />
          <div className="min-w-0 flex-1">
            <Input
              label="Label"
              hideLabel
              value={item.label}
              onChange={(event) => update(index, { label: event.target.value })}
              maxLength={60}
              placeholder="Secure checkout"
            />
          </div>
          <RowTools
            index={index}
            count={draft.length}
            onMove={(from, to) => setDraft(move(draft, from, to))}
            onRemove={(at) => setDraft(draft.filter((_, position) => position !== at))}
          />
        </Row>
      ))}

      {draft.length < 6 ? (
        <AddButton
          label="Add a badge"
          onClick={() => setDraft([...draft, { id: newId('badge'), icon: 'secure', label: '' }])}
        />
      ) : null}
    </Block>
  );
}

function FooterColumnsBlock({ initial }: { initial: FooterColumn[] }) {
  const { draft, setDraft, dirty, pending, save, reset } = useBlock('footerColumns', initial);

  const updateColumn = (index: number, patch: Partial<FooterColumn>) =>
    setDraft(draft.map((column, at) => (at === index ? { ...column, ...patch } : column)));

  return (
    <Block
      title="Footer columns"
      description="Everything but Shop, which follows the departments that actually exist."
      dirty={dirty}
      pending={pending}
      onSave={save}
      onReset={reset}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {draft.map((column, columnIndex) => (
          <div key={column.id} className="border-line bg-canvas rounded-md border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label="Column title"
                  hideLabel
                  value={column.title}
                  onChange={(event) => updateColumn(columnIndex, { title: event.target.value })}
                  maxLength={40}
                  placeholder="Help"
                  className="font-medium"
                />
              </div>
              <RowTools
                index={columnIndex}
                count={draft.length}
                onMove={(from, to) => setDraft(move(draft, from, to))}
                onRemove={(at) => setDraft(draft.filter((_, position) => position !== at))}
              />
            </div>

            <ul className="mt-3 space-y-2">
              {column.links.map((link, linkIndex) => (
                <li key={link.id} className="flex items-start gap-1.5">
                  <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
                    <Input
                      label="Label"
                      hideLabel
                      value={link.label}
                      onChange={(event) =>
                        updateColumn(columnIndex, {
                          links: column.links.map((entry, at) =>
                            at === linkIndex ? { ...entry, label: event.target.value } : entry,
                          ),
                        })
                      }
                      maxLength={60}
                      placeholder="Contact us"
                    />
                    <Input
                      label="Link"
                      hideLabel
                      value={link.href}
                      onChange={(event) =>
                        updateColumn(columnIndex, {
                          links: column.links.map((entry, at) =>
                            at === linkIndex ? { ...entry, href: event.target.value } : entry,
                          ),
                        })
                      }
                      placeholder="/help/contact"
                    />
                  </div>

                  <RowTools
                    index={linkIndex}
                    count={column.links.length}
                    onMove={(from, to) =>
                      updateColumn(columnIndex, { links: move(column.links, from, to) })
                    }
                    onRemove={(at) =>
                      updateColumn(columnIndex, {
                        links: column.links.filter((_, position) => position !== at),
                      })
                    }
                  />
                </li>
              ))}
            </ul>

            {column.links.length < 20 ? (
              <div className="mt-2">
                <AddButton
                  label="Add a link"
                  onClick={() =>
                    updateColumn(columnIndex, {
                      links: [...column.links, { id: newId('link'), label: '', href: '' }],
                    })
                  }
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {draft.length < 6 ? (
        <AddButton
          label="Add a column"
          onClick={() => setDraft([...draft, { id: newId('column'), title: '', links: [] }])}
        />
      ) : null}
    </Block>
  );
}
