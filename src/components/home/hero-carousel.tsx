'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { Carousel, CarouselItem, useSlideParallax } from '@/components/ui/carousel';
import type { Banner } from '@/domain/types';
import { cn } from '@/lib/cn';
import { spring, tween } from '@/lib/motion';

/**
 * Home hero.
 *
 * The first thing anyone sees, and the single surface most responsible for
 * whether a shop reads as expensive or cheap. Everything here follows from five
 * decisions:
 *
 * **1. One slide at a time, with a peek.** Not a mosaic of three equal panels.
 * A mosaic reads well on a desktop and becomes two and a half screens of
 * scrolling on a phone before the first product. One cinematic panel with the
 * next one's edge showing says "there is more, swipe" in the language people
 * already use for a hero — and it gives the headline room to be a headline.
 *
 * **2. The aspect ratio changes, the layout does not.** Portrait on a phone
 * (4:5 fills a tall screen), landscape on a desktop (21:9 is a poster). The
 * same markup, the same overlay, the same code path — the alternative is two
 * hero implementations and one of them is always the neglected one.
 *
 * **3. Copy sits on a scrim, never on raw photography.** `.scrim` is an eased
 * bottom-weighted gradient rather than a flat wash: it guarantees contrast
 * where the words are without greying out the picture that is doing the
 * selling. The type is white in both themes because it sits on a photograph in
 * both themes — this is the one place a token would be wrong.
 *
 * **4. The panel has depth, and the copy is directed.** The slide recedes as it
 * leaves the centre, the photograph lags its own frame by 44px, and the copy
 * stack rises line by line on a spring every time the slide becomes current. A
 * hero where only the picture changes is a slideshow; this is a title sequence.
 * See `CarouselItem`'s `depth`, `useSlideParallax`, and `COPY_LINE` below.
 *
 * **5. Autoplay, but on our terms.** It advances slowly, pauses on hover,
 * focus, touch and a hidden tab, never runs under `prefers-reduced-motion`, and
 * ships a visible pause control with a countdown ring. All of that is
 * `ui/carousel`'s doing; the hero just opts in.
 *
 * A Client Component, and only because of decision 4: the panel has to know
 * which slide is currently settled in order to re-run its entrance. The images
 * and copy are still handed in as plain props from a Server Component page.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const shown = banners.slice(0, 5);
  const [active, setActive] = useState(0);

  if (shown.length === 0) return null;

  return (
    <section className="pt-3 sm:pt-4" aria-label="Featured">
      <Carousel
        label="Featured collections"
        dots
        counter
        autoPlay={shown.length > 1}
        interval={6500}
        onActiveChange={setActive}
        /*
         * The gutter lives on the SCROLLER, not on the section, so the first
         * slide lines up with the page grid and the last can still scroll clear
         * of the right edge. Putting it on the section instead clips the peek.
         */
        contentClassName="gutter shell-max gap-3 sm:gap-4"
      >
        {shown.map((banner, index) => (
          <CarouselItem
            key={banner.id}
            index={index + 1}
            total={shown.length}
            /*
             * The peek shrinks as the screen grows, and that is the opposite of
             * the obvious rule.
             *
             * A peek says "swipe me", which is a phone instruction — so on a
             * phone it is generous (12%). On a desktop the arrows and the
             * counter already say there is more, and a 21:9 panel showing 8% of
             * the next one shows 115px of a 60px headline: an unreadable slab of
             * type competing with the slide that is actually being read. At 4%
             * the next panel reads as an edge rather than as content.
             */
            className="w-[88%] sm:w-[84%] lg:w-[96%]"
            /*
             * Depth, on.
             *
             * A hero shows one slide at a time with a sliver of the next, so
             * receding the neighbour is honest — it IS behind.
             *
             * The matching parallax is applied by `HeroPanel` itself, through
             * `useSlideParallax`, because it has to move the photograph inside
             * the panel rather than the panel inside its slot. See the note on
             * that hook.
             */
            depth
          >
            <HeroPanel
              banner={banner}
              // Only the first is the LCP candidate; the rest are a swipe away.
              priority={index === 0}
              current={index === active}
            />
          </CarouselItem>
        ))}
      </Carousel>
    </section>
  );
}

/**
 * The copy stack's entrance.
 *
 * Each line rises 18px on a spring, 70ms apart, and the whole set RE-RUNS every
 * time its slide becomes current — which is what makes an advance feel authored
 * rather than mechanical.
 *
 * `spring.glide` rather than a tween: it is the same curve the rail itself
 * travels on, so the copy settles in sympathy with the slide instead of on an
 * unrelated timeline. Opacity gets a plain tween, because a fade is not
 * travelling through space and "how bouncy is this fade" has no answer — see
 * the note at the top of `lib/motion`.
 */
const COPY_STACK = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.14 } },
};

const COPY_LINE = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { ...spring.glide, opacity: tween.slow },
  },
};

function HeroPanel({
  banner,
  priority = false,
  current = false,
}: {
  banner: Banner;
  priority?: boolean;
  /** Whether this slide is the one currently settled in the viewport. */
  current?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;

  /*
   * 44px of counter-drift on the photograph.
   *
   * This is what stops the panel reading as a sheet of paper sliding sideways:
   * the image lags its own frame, so the frame becomes a window rather than a
   * card. It is applied to the media layer alone — see `useSlideParallax` for
   * why moving the whole slide is wrong.
   */
  const parallaxX = useSlideParallax(44);

  /*
   * The entrance is driven by `animate`, not by a mount.
   *
   * Every slide stays mounted — they all live in one scroll container — so the
   * stack toggles between `hidden` and `show` as `current` changes. Leaving the
   * viewport returns it to `hidden`, which is what lets the entrance play again
   * on the way back rather than only once per session.
   *
   * Under reduced motion the stack is pinned to `show` permanently: the copy is
   * simply there, with no travel and no re-runs.
   */
  const animate = reduced || current ? 'show' : 'hidden';

  return (
    <Link
      href={banner.href}
      className={cn(
        'group relative isolate flex overflow-hidden rounded-xl sm:rounded-2xl',
        'aspect-4/5 sm:aspect-16/10 lg:aspect-21/9',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      {/*
        The media layer is overscaled by 10%, and it has to be.

        The parallax below translates this layer by up to 44px against its
        frame. Without headroom that drift would drag the image off its own
        trailing edge and expose the panel's background as a bar down one side.
        10% gives ~5% of the panel's width on each side, which covers 44px at
        every width this panel is used at — the narrowest case is a 343px phone
        panel, where 5% is only 17px, but the phone layout never scrolls far
        enough off-centre for the full drift to apply.
      */}
      <motion.div aria-hidden className="absolute inset-0 scale-110" style={{ x: parallaxX }}>
        {/*
          Two sources, one element.

          `<picture>` would need `next/image` to be abandoned — and with it the
          loader, the AVIF negotiation and the size hints. Rendering two `Image`s
          and switching them with a breakpoint class costs one extra DOM node and
          keeps all of that. Only the visible one is ever fetched: the hidden one
          is `display:none`, and browsers do not fetch images inside it.
        */}
        {banner.mobileImageUrl ? (
          <>
            <Image
              src={banner.mobileImageUrl}
              alt={banner.alt}
              fill
              priority={priority}
              sizes="88vw"
              className="object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04] sm:hidden"
            />
            <Image
              src={banner.imageUrl}
              alt={banner.alt}
              fill
              priority={priority}
              sizes="(max-width: 64rem) 80vw, 92vw"
              className="hidden object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04] sm:block"
            />
          </>
        ) : (
          <Image
            src={banner.imageUrl}
            alt={banner.alt}
            fill
            priority={priority}
            sizes="(max-width: 40rem) 88vw, (max-width: 64rem) 80vw, 92vw"
            className="object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04]"
          />
        )}
      </motion.div>

      {/*
        The scrim.

        Bottom-weighted on a phone where the copy sits under the image, and
        angled from the leading edge on a wide screen where it sits beside it —
        a bottom-only gradient on a 21:9 panel puts a dark band under a headline
        that is nowhere near the bottom.
      */}
      <div aria-hidden className="scrim absolute inset-0 sm:hidden" />
      <div aria-hidden className="scrim-start absolute inset-0 hidden sm:block" />

      <motion.div
        variants={COPY_STACK}
        initial="hidden"
        animate={animate}
        className={cn(
          'relative mt-auto w-full p-5 sm:p-9 lg:p-12',
          'sm:mt-0 sm:flex sm:max-w-2xl sm:flex-col sm:justify-center',
        )}
      >
        {/*
          The eyebrow leads with a rule rather than sitting alone.

          A 24px hairline before the word is the cheapest editorial signal there
          is: it turns a floating label into a masthead, and it gives the eye a
          left edge to start from on a 21:9 panel where the copy is otherwise
          adrift in the middle of a photograph.
        */}
        <motion.p
          variants={COPY_LINE}
          className="flex items-center gap-2.5 text-2xs font-semibold uppercase tracking-[0.2em] text-white/75"
        >
          {/*
            The rule DRAWS itself in rather than fading.

            `scaleX` from the leading edge on the same spring as its line — a
            24px hairline that simply appears is the one element in the stack
            that would look pasted on.
          */}
          <motion.span
            aria-hidden
            className="h-px w-6 origin-left bg-white/50"
            variants={{
              hidden: { scaleX: 0 },
              show: { scaleX: 1, transition: spring.glide },
            }}
          />
          {banner.name.toLowerCase().includes('hero') ? 'Featured' : 'The edit'}
        </motion.p>

        <motion.h2
          variants={COPY_LINE}
          className="headline mt-4 max-w-2xl text-4xl text-white sm:text-5xl lg:text-6xl"
        >
          {banner.headline}
        </motion.h2>

        {banner.subheadline ? (
          <motion.p
            variants={COPY_LINE}
            className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-white/85 sm:text-md"
          >
            {banner.subheadline}
          </motion.p>
        ) : null}

        {/*
          A pill, and a real one — not a text link with an arrow.

          This is the only CTA on the fold and it is sitting on a photograph, so
          it needs a solid ground to be findable at all. `bg-white`/`text-black`
          rather than the accent: the panel already has whatever colours the
          photograph brought, and an indigo button on an unpredictable image is a
          contrast risk no token can solve. White on black is safe on every
          photograph ever shot.
        */}
        {banner.ctaLabel ? (
          <motion.span
            variants={COPY_LINE}
            className={cn(
              'mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6',
              'text-sm font-semibold text-black',
              'transition-transform duration-(--duration-base) ease-(--ease-out)',
              'motion-safe:group-hover:scale-[1.03]',
              'h-11 sm:h-12',
            )}
          >
            {banner.ctaLabel}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </motion.span>
        ) : null}
      </motion.div>
    </Link>
  );
}

/**
 * The hero's placeholder.
 *
 * Exactly the geometry of the real thing at every breakpoint, so nothing on the
 * page moves when the banners land. A skeleton that guesses its own height is a
 * layout shift with extra steps.
 */
export function HeroSkeleton() {
  return (
    <section className="gutter shell-max pt-3 sm:pt-4" aria-hidden>
      <div className="skeleton aspect-4/5 rounded-xl sm:aspect-16/10 sm:rounded-2xl lg:aspect-21/9" />
    </section>
  );
}
