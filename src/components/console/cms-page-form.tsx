'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateCmsPage, type UpdatePageInput } from '@/server/actions/admin';

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
    <form onSubmit={submit} noValidate className="mt-6 max-w-3xl space-y-5">
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
        defaultValue={page.body}
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
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save page
        </Button>
      </div>
    </form>
  );
}
