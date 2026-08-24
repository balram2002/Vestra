/**
 * SEO-friendly URL slugs.
 *
 * Product URLs embed the id so a renamed product keeps resolving:
 *   /product/mora-cotton-anarkali-kurta-indigo-prd_9f3kq2m8
 * The trailing id segment is authoritative; the words are for humans and search.
 */

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function productSlug(title: string, id: string): string {
  return `${slugify(title)}-${id.toLowerCase()}`;
}

/** Recover the entity id from a slug produced by `productSlug`. */
export function idFromSlug(slug: string): string {
  const match = slug.match(/([a-z]{3,4}_[a-z0-9]+)$/i);
  return match ? match[1] : slug;
}

export function joinPath(...parts: Array<string | undefined | null>): string {
  return (
    '/' +
    parts
      .filter(Boolean)
      .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/')
  );
}
