import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Reveal } from '@/components/ui/reveal';
import type { HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Editorial, and the call to action.
 *
 * One component for both, because they are the same object with different
 * weights: a headline, a paragraph, optionally a picture, optionally a button.
 * Splitting them would give an editor two entries in the "add a section" menu
 * that differ only in whether they filled in the image.
 *
 * THREE LAYOUTS, and each is a genuinely different shape rather than a
 * restyling:
 *
 *   SPLIT   picture beside the words. The default when there is a picture --
 *           it is the one that can carry a long paragraph.
 *   BANNER  words over the picture. For a statement with one line of copy;
 *           anything longer is unreadable over photography at phone width.
 *   PLAIN   no picture at all. A band of type, which is what a call to action
 *           usually should be -- a picture behind a button competes with it.
 *
 * With no image the layout falls back to PLAIN however it was set, because a
 * split with an empty half is a broken page rather than a design.
 */
export function Editorial({ section }: { section: HomeSection }) {
  const { title, subtitle, href, ctaLabel, config } = section;
  const body = config.body ?? subtitle ?? null;
  const image = config.imageUrl ?? null;
  const layout = image ? (config.layout === 'BANNER' ? 'BANNER' : 'SPLIT') : 'PLAIN';

  // The dark and accent grounds carry their own text colours; the light one
  // uses the page's, so it reads as part of the page rather than a card on it.
  const theme = config.theme ?? 'light';
  const ground =
    theme === 'dark'
      ? 'bg-inverse text-on-inverse'
      : theme === 'accent'
        ? 'bg-accent-soft text-ink'
        : 'bg-raised text-ink border-line border';

  if (!title && !body && !image) return null;

  if (layout === 'BANNER' && image) {
    return (
      <Reveal as="section" className="gutter shell-max py-8 sm:py-12">
        <div className="relative isolate overflow-hidden rounded-2xl">
          <Image
            src={image}
            alt={title ?? ''}
            width={1600}
            height={700}
            className="aspect-4/5 w-full object-cover sm:aspect-21/9"
          />
          <div aria-hidden className="scrim absolute inset-0 sm:hidden" />
          <div aria-hidden className="scrim-start absolute inset-0 hidden sm:block" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:max-w-xl sm:justify-center sm:p-12">
            {title ? (
              <h2 className="headline text-3xl text-white sm:text-4xl lg:text-5xl">{title}</h2>
            ) : null}
            {body ? <p className="mt-3 max-w-md text-sm text-white/85">{body}</p> : null}
            {href && ctaLabel ? <Cta href={href} label={ctaLabel} onDark /> : null}
          </div>
        </div>
      </Reveal>
    );
  }

  if (layout === 'SPLIT' && image) {
    return (
      <Reveal as="section" className="gutter shell-max py-10 sm:py-14">
        <div
          className={cn(
            'grid items-center gap-6 overflow-hidden rounded-2xl sm:gap-10 lg:grid-cols-2',
            ground,
          )}
        >
          <Image
            src={image}
            alt={title ?? ''}
            width={1200}
            height={900}
            className="aspect-4/3 h-full w-full object-cover lg:aspect-auto"
          />
          <div className="p-6 sm:p-10">
            {title ? <h2 className="headline text-2xl sm:text-3xl">{title}</h2> : null}
            {body ? <p className="mt-3 text-sm opacity-90">{body}</p> : null}
            {href && ctaLabel ? <Cta href={href} label={ctaLabel} onDark={theme === 'dark'} /> : null}
          </div>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal as="section" className="gutter shell-max py-10 sm:py-14">
      <div className={cn('rounded-2xl px-6 py-10 text-center sm:px-10 sm:py-14', ground)}>
        {title ? <h2 className="headline text-2xl sm:text-3xl">{title}</h2> : null}
        {body ? <p className="mx-auto mt-3 max-w-xl text-sm opacity-90">{body}</p> : null}
        {href && ctaLabel ? (
          <div className="flex justify-center">
            <Cta href={href} label={ctaLabel} onDark={theme === 'dark'} />
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

function Cta({ href, label, onDark }: { href: string; label: string; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'group mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full px-6 text-sm font-semibold',
        'transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:scale-[1.03]',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        onDark ? 'bg-white text-black' : 'bg-ink text-canvas',
      )}
    >
      {label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
