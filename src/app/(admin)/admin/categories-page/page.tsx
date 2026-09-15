import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { SectionBuilder } from '@/components/console/section-builder';
import { PageHeader } from '@/components/console/page-header';
import { ADDABLE_SECTION_KINDS } from '@/domain/sections';
import { requirePermission } from '@/server/auth/session';
import { categoryPageEditorSections } from '@/server/services/category-page';
import { InitializeCategories } from '@/components/console/initialize-categories';
import { collections } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Shop page' };
export default function CategoriesEditorPage() {
  return <><PageHeader title="Shop page" description="Arrange the illustrated category directory and add collections, brands or editorial stories." />
    <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" />}><Composition /></Suspense></>;
}
async function Composition() {
  await requirePermission('cms:write');
  const sections = await categoryPageEditorSections();
  const initialized = await (await collections.homeSections()).countDocuments({ page: 'categories' });
  return <div className="mt-6 space-y-6">
    <Link href="/categories" target="_blank" className="text-accent-ink inline-flex min-h-11 items-center text-sm underline">Preview shop page</Link>
    {initialized ? <SectionBuilder page="categories" sections={sections} addable={ADDABLE_SECTION_KINDS} /> : <InitializeCategories sections={sections} />}
  </div>;
}
