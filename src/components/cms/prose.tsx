import { Fragment } from 'react';

/**
 * Minimal markdown renderer for CMS content.
 *
 * Hand-written rather than pulling in a markdown library, for two reasons: the
 * content here uses a deliberately small subset (headings, paragraphs, lists,
 * bold, links), and a renderer that only knows that subset cannot be made to
 * emit raw HTML — there is no `dangerouslySetInnerHTML` anywhere in this file,
 * so a compromised CMS record cannot inject script into the page.
 *
 * Everything is rendered as React elements, which React escapes by definition.
 */

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; text: string };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');

  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'ul', items: list });
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'h3', text: line.slice(4) });
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'h2', text: line.slice(3) });
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }

    // A list item wrapped onto a second line belongs to the item above it.
    if (list.length > 0) {
      list[list.length - 1] += ` ${line}`;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** Inline `**bold**` and `*emphasis*`, rendered as elements, never as HTML. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="text-ink font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function Prose({ markdown }: { markdown: string }) {
  const blocks = parse(markdown);

  return (
    <div className="max-w-2xl">
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        switch (block.kind) {
          case 'h2':
            return (
              <h2 key={key} className="font-display text-ink mt-8 text-lg first:mt-0">
                {inline(block.text, key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} className="text-ink mt-6 text-sm font-semibold">
                {inline(block.text, key)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={key} className="text-muted mt-3 list-disc space-y-1.5 pl-5 text-sm">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>
                ))}
              </ul>
            );
          case 'p':
            return (
              <p key={key} className="text-muted mt-3 text-pretty text-sm leading-relaxed">
                {inline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
