'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { HomeSection } from '@/domain/types';
import { initializeCategoryPage } from '@/server/actions/sections';

export function InitializeCategories({ sections }: { sections: HomeSection[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div className="border-line rounded-xl border p-5">
    <h2 className="text-lg font-semibold">Your shop directory</h2>
    <p className="text-muted mt-2 text-sm">The storefront currently shows these departments from your live catalogue. Customise them to manage their order, contents and visibility. Category images are managed in the catalogue.</p>
    <ul className="my-5 grid gap-2 sm:grid-cols-2">{sections.map((section) => <li key={section.id} className="bg-sunken rounded-lg p-3 text-sm">{section.title} · {section.config.categoryIds?.length} categories</li>)}</ul>
    <Button loading={pending} onClick={() => start(async () => {
      const result = await initializeCategoryPage();
      if (!result.ok) toast.error(result.error); else router.refresh();
    })}>Customise shop page</Button>
  </div>;
}
