'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { resetCmsPage, updateCmsPage, type UpdatePageInput } from '@/server/actions/admin';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Prose } from '@/components/cms/prose';

/**
 * The page editor.
 *
 * A textarea, not a rich-text editor: the pages are light Markdown, and a box
 * holding exactly what will be rendered is harder to get wrong than a toolbar
 * that produces markup the renderer does not support. The hint under it lists
 * everything the renderer understands.
 */
export function CmsPageForm({
  page,
}: {
  page: {
    id: string;
    slug: string;
    title: string;
    metaDescription: string | null;
    body: string;
    isPublished: boolean;
  };
}) {
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<UpdatePageInput | null>(null);
  const [body, setBody] = useState(page.body);
  const [formVersion, setFormVersion] = useState(0);
  const router = useRouter();
  const linkedFromFooter = page.slug.startsWith('legal/') || page.slug.startsWith('help/');

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const input: UpdatePageInput = {
      pageId: page.id,
      title: String(form.get('title') ?? '').trim(),
      metaDescription: String(form.get('metaDescription') ?? '').trim(),
      body: String(form.get('body') ?? ''),
      isPublished: form.get('isPublished') === 'on',
    };

    setReview(input);
  };

  const persist = () => {
    const input = review;
    if (!input) return;
    setErrors({});
    startTransition(async () => {
      const result = await updateCmsPage(input);
      if (result.ok) {
        toast.success('Page saved', {
          description: input.isPublished
            ? `Live at /${page.slug}.`
            : 'It is unpublished, so its link shows not found.',
        });
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not save the page.');
      }
    });
  };

  return (
    <form key={formVersion} onSubmit={submit} className="mt-6 max-w-3xl space-y-5">
      <Input
        label="Title"
        name="title"
        required
        maxLength={120}
        defaultValue={page.title}
        error={errors.title}
      />
      <Textarea
        label="Search description"
        name="metaDescription"
        rows={2}
        maxLength={300}
        defaultValue={page.metaDescription ?? ''}
        hint="Shown under the title in search results."
        error={errors.metaDescription}
      />
      <Textarea
        label="Page text"
        name="body"
        required
        rows={24}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="font-mono text-xs leading-relaxed"
        hint="## starts a heading and ### a smaller one. A line starting with - is a list item. **bold** and *italic*. Leave a blank line between paragraphs."
        error={errors.body}
      />
      <Switch
        name="isPublished"
        defaultChecked={page.isPublished}
        label="Published"
        description={
          linkedFromFooter
            ? 'Linked from the footer of every page. Unpublished, the link shows not found.'
            : 'Unpublished, the page shows not found.'
        }
      />
      <details className="border-line rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Preview page text</summary><div className="mt-5"><Prose markdown={body} /></div></details>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setBody(page.body); setErrors({}); setFormVersion((value) => value + 1); }}>Discard changes</Button>
        <ConfirmDialog trigger={<Button type="button" variant="secondary" disabled={pending}>Reset page text</Button>}
          title="Restore the default page?" description="Built-in pages return to their original text and visibility. Custom pages are hidden with their text preserved. Section layout is managed separately below."
          confirmLabel="Reset page" requireText="RESET" onConfirm={() => startTransition(async () => {
            const result = await resetCmsPage({ pageId: page.id });
            if (!result.ok) toast.error(result.error); else { toast.success('Page reset'); router.refresh(); }
          })} />
        <Button type="submit" loading={pending}>
          Save page
        </Button>
      </div>
      <ConfirmDialog open={review !== null} onOpenChange={(open) => { if (!open) setReview(null); }}
        title="Save this page?" description={review?.isPublished ? 'These changes will be visible to shoppers immediately.' : 'This page will be hidden from shoppers. Its text will be preserved.'}
        confirmLabel="Confirm and save" onConfirm={persist} />
    </form>
  );
}
