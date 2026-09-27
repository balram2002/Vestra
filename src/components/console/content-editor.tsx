'use client';

import { Eye, EyeOff, ExternalLink, FileText, History, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Prose } from '@/components/cms/prose';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTENT_TEMPLATE_META,
  CONTENT_TEMPLATES,
  outlineOf,
  readingMinutes,
  sameContent,
  seoReport,
  type ContentFields,
  type ContentTemplate,
} from '@/domain/content-pages';
import { cn } from '@/lib/cn';
import {
  discardContentDraft,
  loadShippedContent,
  publishContent,
  revertContent,
  saveContentDraft,
  setContentVisibility,
  type ContentResult,
} from '@/server/actions/content-pages';
import type { ContentPageState } from '@/server/services/content-pages';

const AUTOSAVE_MS = 900;
const FORMAT = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A content page, edited as a draft.
 *
 * Typing saves a draft a moment later; shoppers see nothing until Publish.
 * The switch that shows or hides the page is separate and immediate, because
 * "take the page down" should never wait behind a half-written edit.
 */
export function ContentEditor({ initial, hasShipped }: { initial: ContentPageState; hasShipped: boolean }) {
  const [state, setState] = useState(initial);
  const [fields, setFields] = useState<ContentFields>(initial.draft ?? initial.live);
  const [save, setSave] = useState<'idle' | 'pending' | 'saving' | 'error'>('idle');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof ContentFields, string>>>({});
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fields);

  const hasChanges = !sameContent(fields, state.live);
  const seo = seoReport(fields);
  const outline = outlineOf(fields.body);

  const apply = (result: ContentResult, message?: string) => {
    if (!result.ok) {
      if (result.field) setErrors({ [result.field]: result.error });
      toast.error(result.error);
      return false;
    }
    setState(result.state);
    if (message) toast.success(message);
    return true;
  };

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave('saving');
    const result = await saveContentDraft({ pageId: state.page.id, fields: latest.current });
    setSave(result.ok ? 'idle' : 'error');
    if (result.ok) setErrors({});
    apply(result);
  };

  const set = <K extends keyof ContentFields>(key: K, value: ContentFields[K]) => {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setFields(next);
    setSave('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const replaceAll = (next: ContentFields) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = next;
    setFields(next);
    setSave('idle');
  };

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (timer.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const act = (work: () => Promise<ContentResult>, message: string, after?: (result: ContentResult) => void) =>
    startTransition(async () => {
      if (timer.current) await flush();
      const result = await work();
      if (apply(result, message)) after?.(result);
    });

  const status =
    save === 'pending' || save === 'saving'
      ? 'Saving draft…'
      : save === 'error'
        ? 'The draft did not save — check the highlighted field.'
        : hasChanges
          ? 'Draft saved. Shoppers still see the published page.'
          : 'Nothing unpublished. Edits save as a draft automatically.';

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        {/* ------------------------------------------------------ template */}
        <section aria-label="Template" className="grid gap-3 sm:grid-cols-3">
          {CONTENT_TEMPLATES.map((template) => {
            const meta = CONTENT_TEMPLATE_META[template];
            const on = fields.template === template;
            return (
              <button
                key={template}
                type="button"
                onClick={() => set('template', template)}
                aria-pressed={on}
                className={cn(
                  'bg-raised flex flex-col gap-2 rounded-lg border p-3 text-left transition-shadow',
                  on ? 'border-ink ring-ink ring-1' : 'border-line hover:shadow-sm',
                )}
              >
                <TemplateSketch template={template} />
                <span className="text-ink text-sm font-semibold">
                  {meta.number} · {meta.name}
                  {state.live.template === template ? (
                    <span className="bg-success-50 text-success-700 ml-1.5 rounded-full px-1.5 py-0.5 text-2xs font-medium">Live</span>
                  ) : null}
                </span>
                <span className="text-muted text-xs leading-relaxed">{meta.description}</span>
              </button>
            );
          })}
        </section>

        {/* ------------------------------------------------------- content */}
        <section className="border-line bg-raised rounded-lg border" aria-label="Content">
          <div className="space-y-4 p-4 sm:p-5">
            <Input label="Title" value={fields.title} maxLength={120} onChange={(event) => set('title', event.target.value)} error={errors.title} />
            {fields.template !== 'PLAIN' ? (
              <Textarea
                label={fields.template === 'EDITORIAL' ? 'Standfirst' : 'Summary'}
                rows={2}
                maxLength={300}
                value={fields.summary}
                onChange={(event) => set('summary', event.target.value)}
                hint="One or two sentences under the title."
              />
            ) : null}
            {fields.template === 'EDITORIAL' ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
                <Input
                  label="Hero image"
                  value={fields.heroImageUrl}
                  onChange={(event) => set('heroImageUrl', event.target.value)}
                  placeholder="https://… or /images/…"
                  hint="Wide and calm: text sits below it, not over it."
                  error={errors.heroImageUrl}
                />
                <div className="bg-sunken mb-6 aspect-video overflow-hidden rounded-md" aria-hidden>
                  {/^https:\/\/|^\//.test(fields.heroImageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fields.heroImageUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-line flex items-center gap-1 border-t px-4 pt-2 sm:px-5" role="tablist" aria-label="Text">
            {(['write', 'preview'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-xs font-semibold capitalize',
                  tab === key ? 'border-ink text-ink' : 'text-muted border-transparent hover:text-ink',
                )}
              >
                {key}
              </button>
            ))}
            <span className="text-faint ml-auto text-2xs">
              {readingMinutes(fields.body)} min read · {outline.length} {outline.length === 1 ? 'heading' : 'headings'}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            {tab === 'write' ? (
              <Textarea
                label="Text"
                hideLabel
                rows={20}
                value={fields.body}
                onChange={(event) => set('body', event.target.value)}
                error={errors.body}
                hint="## Heading, ### Smaller heading, - list item, **bold**, [link](/help/returns). Blank line between paragraphs."
                className="font-mono text-[13px] leading-6"
              />
            ) : (
              <div className="border-line min-h-[20rem] rounded-md border p-5">
                <Prose markdown={fields.body} />
              </div>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------------- seo */}
        <section className="border-line bg-raised rounded-lg border" aria-label="Search and sharing">
          <header className="border-line border-b px-4 py-3 sm:px-5">
            <h2 className="text-ink text-sm font-semibold">Search and sharing</h2>
            <p className="text-muted mt-0.5 text-xs">How the page appears in search results.</p>
          </header>
          <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Input
                label="Search title"
                value={fields.metaTitle}
                maxLength={90}
                onChange={(event) => set('metaTitle', event.target.value)}
                placeholder={`${fields.title} | VestraWAB`}
                hint={`${seo.title.length} characters. Blank uses the page title.`}
                error={errors.metaTitle}
              />
              <Textarea
                label="Search description"
                rows={3}
                maxLength={300}
                value={fields.metaDescription}
                onChange={(event) => set('metaDescription', event.target.value)}
                hint={`${fields.metaDescription.trim().length} characters; about 155 show.`}
                error={errors.metaDescription}
              />
              <Switch
                label="Hide from search engines"
                description="For pages meant only for people who follow a link."
                checked={fields.noindex}
                onChange={(event) => set('noindex', event.target.checked)}
              />
            </div>
            <div>
              <p className="text-faint text-2xs font-semibold uppercase tracking-wider">Search result</p>
              <div className="border-line mt-2 rounded-md border bg-white p-4 text-left">
                <p className="truncate text-xs text-[#4d5156]">vestrawab.in › {state.page.slug.replace(/\//g, ' › ')}</p>
                <p className="mt-1 line-clamp-1 text-lg leading-snug text-[#1a0dab]">{seo.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-[#4d5156]">
                  {seo.description || fields.body.replace(/[#*\[\]()-]/g, '').slice(0, 155)}
                </p>
              </div>
              {seo.warnings.length ? (
                <ul className="text-warning-700 mt-3 space-y-1 text-xs">
                  {seo.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-success-700 mt-3 text-xs">Looks right for search.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* --------------------------------------------------------- publish */}
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className={cn('rounded-lg border p-4', hasChanges ? 'border-warning-100 bg-warning-50' : 'border-line bg-raised')} aria-label="Publishing">
          <p className="text-ink text-sm font-semibold">{hasChanges ? 'Unpublished changes' : 'Up to date'}</p>
          <p className="text-muted mt-1 text-xs" role="status">
            {status}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button asChild size="sm" variant="secondary">
              <a href={`/draft/content/${state.page.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Preview
              </a>
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" disabled={pending || !hasChanges}>
                  <Send className="size-4" aria-hidden />
                  Publish
                </Button>
              }
              title="Publish this page?"
              description={`Visitors to /${state.page.slug} see the new version straight away. The current one stays in History.`}
              confirmLabel="Publish now"
              onConfirm={() =>
                act(() => publishContent({ pageId: state.page.id, note: note.trim() || null }), 'Published — live now', (result) => {
                  if (result.ok) replaceAll(result.state.live);
                  setNote('');
                })
              }
            >
              <Textarea label="Note for the history (optional)" rows={2} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
            </ConfirmDialog>
            {hasChanges ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" size="sm" variant="ghost" disabled={pending}>
                    <Trash2 className="size-4" aria-hidden />
                    Discard
                  </Button>
                }
                title="Discard the draft?"
                description="Every unpublished edit on this page is thrown away."
                confirmLabel="Discard draft"
                tone="danger"
                onConfirm={() =>
                  act(() => discardContentDraft({ pageId: state.page.id }), 'Draft discarded', (result) => {
                    if (result.ok) replaceAll(result.state.live);
                  })
                }
              />
            ) : null}
          </div>
        </section>

        <section className="border-line bg-raised rounded-lg border p-4" aria-label="Visibility">
          <div className="flex items-start gap-3">
            {state.page.isPublished ? <Eye className="text-success-700 mt-0.5 size-4" aria-hidden /> : <EyeOff className="text-muted mt-0.5 size-4" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-semibold">{state.page.isPublished ? 'Visible on the site' : 'Hidden — its link shows not found'}</p>
              <p className="text-muted mt-0.5 text-xs">Immediate, and separate from publishing edits.</p>
            </div>
          </div>
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={pending}>
                {state.page.isPublished ? 'Hide page' : 'Show page'}
              </Button>
            }
            title={state.page.isPublished ? 'Hide this page?' : 'Show this page?'}
            description={
              state.page.isPublished
                ? 'Its link shows not found straight away. Links in the footer and elsewhere will lead nowhere.'
                : 'It appears at its link straight away, with the published text.'
            }
            confirmLabel={state.page.isPublished ? 'Hide page' : 'Show page'}
            tone={state.page.isPublished ? 'danger' : 'default'}
            onConfirm={() =>
              act(
                () => setContentVisibility({ pageId: state.page.id, isPublished: !state.page.isPublished }),
                state.page.isPublished ? 'Page hidden' : 'Page visible',
              )
            }
          />
        </section>

        <section className="border-line bg-raised rounded-lg border" aria-label="History">
          <p className="text-ink border-line flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <History className="text-muted size-4" aria-hidden />
            History
          </p>
          {state.revisions.length === 0 ? (
            <p className="text-muted px-4 py-3 text-xs">Every publish from here is kept, and can be put back.</p>
          ) : (
            <ol className="divide-line divide-y">
              {state.revisions.map((revision, index) => (
                <li key={revision.id} className="px-4 py-2.5">
                  <p className="text-ink text-xs font-medium" suppressHydrationWarning>
                    {FORMAT.format(new Date(revision.at))}
                    {index === 0 ? <span className="text-success-700"> · live</span> : null}
                  </p>
                  <p className="text-muted text-2xs">
                    {revision.byName} · {CONTENT_TEMPLATE_META[revision.content.template].name}
                  </p>
                  {revision.note ? <p className="text-muted mt-0.5 text-2xs italic">“{revision.note}”</p> : null}
                  {index > 0 ? (
                    <ConfirmDialog
                      trigger={
                        <button type="button" className="text-accent-ink mt-1 inline-flex items-center gap-1 text-2xs font-medium" disabled={pending}>
                          <RotateCcw className="size-3" aria-hidden />
                          Put back
                        </button>
                      }
                      title="Put this version back?"
                      description="It is published again straight away, and replaces any draft."
                      confirmLabel="Put it back"
                      onConfirm={() =>
                        act(() => revertContent({ pageId: state.page.id, revisionId: revision.id }), 'That version is live again', (result) => {
                          if (result.ok) replaceAll(result.state.live);
                        })
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        {hasShipped ? (
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="ghost" disabled={pending}>
                <FileText className="size-4" aria-hidden />
                Load the shipped wording
              </Button>
            }
            title="Load the shipped wording as a draft?"
            description="The title, text and search description go back to how the shop shipped — as a DRAFT to read before publishing. Nothing changes for visitors yet."
            confirmLabel="Load as draft"
            onConfirm={() =>
              act(() => loadShippedContent({ pageId: state.page.id }), 'Shipped wording loaded as a draft', (result) => {
                if (result.ok && result.state.draft) replaceAll(result.state.draft);
              })
            }
          />
        ) : null}
      </aside>
    </div>
  );
}

function TemplateSketch({ template }: { template: ContentTemplate }) {
  const line = 'bg-line block h-1.5 rounded-sm';
  return (
    <span aria-hidden className="bg-sunken block h-20 overflow-hidden rounded-md p-2">
      <span className="bg-canvas block h-full space-y-1 rounded-sm p-1.5 shadow-sm">
        {template === 'EDITORIAL' ? (
          <>
            <span className="block h-5 rounded-sm bg-gradient-to-r from-amber-200 to-rose-200" />
            <span className="bg-ink/70 mx-auto block h-2 w-2/3 rounded-sm" />
            <span className={cn(line, 'mx-auto w-1/2')} />
            <span className={cn(line, 'mx-auto w-1/2')} />
          </>
        ) : template === 'HELP' ? (
          <span className="flex h-full gap-1.5">
            <span className="border-line block w-1/4 space-y-1 border-r pr-1">
              <span className={line} />
              <span className={line} />
              <span className={line} />
            </span>
            <span className="block flex-1 space-y-1">
              <span className="bg-ink/70 block h-2 w-2/3 rounded-sm" />
              <span className={line} />
              <span className={line} />
              <span className="bg-accent/30 mt-1 block h-2.5 rounded-sm" />
            </span>
          </span>
        ) : (
          <>
            <span className="bg-ink/70 block h-2 w-1/2 rounded-sm" />
            <span className={cn(line, 'w-1/4')} />
            <span className={line} />
            <span className={line} />
            <span className={cn(line, 'w-5/6')} />
          </>
        )}
      </span>
    </span>
  );
}
