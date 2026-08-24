import { serializeJsonLd, type JsonLdNode } from '@/lib/seo/structured-data';

/**
 * Emit a JSON-LD block.
 *
 * A Server Component, so the markup is in the initial HTML where crawlers
 * actually read it — structured data injected after hydration is frequently
 * missed.
 *
 * `dangerouslySetInnerHTML` is correct here and not a shortcut: JSON-LD must be
 * raw text inside the script tag, and React would otherwise HTML-escape quotes
 * and break the JSON. `serializeJsonLd` neutralises the one genuinely dangerous
 * sequence (`</script>`).
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
