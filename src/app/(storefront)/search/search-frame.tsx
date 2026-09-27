import { ListingView } from '@/components/commerce/listing-view';
import {
  DidYouMean,
  EmptySearchPrompt,
  NoResults,
  ResultsHeading,
  SearchBox,
  Shortcuts,
} from '@/components/commerce/search-page-view';
import type { SearchPageSettings, SearchPageVariant } from '@/domain/page-designs/search';
import { parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { getDepartments } from '@/server/services/catalog';
import { getProductRail, listProducts } from '@/server/services/listing';
import { searchEverything, spellingSuggestion } from '@/server/services/search';

/**
 * The search page in one layout. Shared by the live page and the staff
 * preview; rendered inside the route's `<Suspense>`, because everything here
 * depends on the query string.
 */
export async function SearchFrame({
  variant,
  settings,
  searchParams,
  basePath = '/search',
  banner,
}: {
  variant: SearchPageVariant;
  settings: SearchPageSettings;
  searchParams: Promise<RawSearchParams>;
  /** Where the search box, filters and sort point: the preview keeps them inside it. */
  basePath?: string;
  banner?: React.ReactNode;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw);

  if (!query.q) {
    const departments = await getDepartments();
    return (
      <>
        {banner}
        <EmptySearchPrompt departments={departments} searchBox={settings.searchBox} basePath={basePath} />
      </>
    );
  }

  const q = query.q;
  const result = await listProducts(query);
  const [shortcuts, suggestion, departments, picks] = await Promise.all([
    settings.shortcuts ? searchEverything(q) : Promise.resolve(null),
    // Offered whatever the count: "etnhic wear" finds hundreds of products
    // through "wear" alone, which is exactly when a shopper needs telling.
    // The vocabulary is the shop's own words, so a correct word is not "fixed".
    settings.didYouMean ? spellingSuggestion(q) : Promise.resolve(null),
    result.total === 0 && settings.noResultsDepartments ? getDepartments() : Promise.resolve([]),
    result.total === 0 && settings.noResultsPicks ? getProductRail('BESTSELLERS', 12) : Promise.resolve([]),
  ]);

  const heading = (
    <>
      {settings.searchBox ? <SearchBox q={q} basePath={basePath} size={variant === 'visual' ? 'hero' : 'regular'} /> : null}
      {/* Without its big search box, the Visual layout needs a visible heading. */}
      <ResultsHeading q={q} variant={variant === 'visual' && !settings.searchBox ? 'classic' : variant} />
      {suggestion && result.total > 0 ? <DidYouMean suggestion={suggestion} basePath={basePath} /> : null}
      {shortcuts ? <Shortcuts results={shortcuts} /> : null}
    </>
  );

  return (
    <>
      {banner}
      <ListingView
        result={result}
        params={raw}
        basePath={basePath}
        sort={query.sort ?? 'relevance'}
        heading={heading}
        rail={variant !== 'visual' && settings.filterRail}
        quickFilters={settings.quickFilters}
        display={variant === 'visual' ? { wall: settings.wallDensity === 'dense' ? 'dense' : 'airy', quickView: settings.quickView } : 'grid'}
        emptyState={
          <NoResults
            q={q}
            suggestion={suggestion}
            basePath={basePath}
            departments={departments}
            picks={picks}
            picksTitle={settings.noResultsPicksTitle || 'Bestsellers right now'}
          />
        }
      />
    </>
  );
}
