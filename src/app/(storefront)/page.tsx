import { PageSections } from '@/components/home/page-sections';
import { getHomeSections } from '@/server/services/content';

/**
 * Home.
 *
 * The page renders whatever the composition data says, in the order it says.
 * There is no hardcoded arrangement here -- reordering the page, retargeting a
 * rail or hand-picking the eight products in it is an edit in the console, not
 * a deploy.
 *
 * Everything about HOW that renders lives in `PageSections`, which landing
 * pages use too, so the two can never drift apart.
 */
export default async function HomePage() {
  return <PageSections sections={await getHomeSections()} />;
}
