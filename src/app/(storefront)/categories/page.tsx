import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSections } from '@/components/home/page-sections';
import { absoluteUrl } from '@/config/site';
import { getPageSections } from '@/server/services/content';

export const metadata: Metadata = {
  title: 'Shop by category', description: 'Find your next favourite. Explore every department, collection and style at VestraWAB.',
  alternates: { canonical: absoluteUrl('/categories') },
};
export default function CategoriesPage() {
  return <div className="pb-10">
    <header className="gutter shell-max py-8 sm:py-12">
      <p className="text-accent-ink mb-3 text-xs font-semibold uppercase tracking-widest">The style directory</p>
      <h1 className="font-display text-ink text-3xl sm:text-5xl">Find your next favourite.</h1>
      <p className="text-muted mt-4 max-w-lg text-sm sm:text-base">Every department. Every possibility. Explore the pieces that feel like you.</p>
    </header>
    <Suspense fallback={<div className="gutter shell-max grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden>{[0, 1, 2, 3].map((n) => <div key={n} className="skeleton aspect-4/5 rounded-xl" />)}</div>}><Directory /></Suspense>
  </div>;
}
async function Directory() {
  const sections = await getPageSections('categories');
  return sections.length ? <PageSections sections={sections} /> : <p className="gutter shell-max text-muted py-12">New collections are on their way. Check back soon.</p>;
}
