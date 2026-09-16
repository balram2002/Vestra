'use client';

import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { SeeLiveButton } from '@/components/live/see-live-button';
import { PriceBlock } from '@/components/commerce/price-block';
import { SizeGuide } from '@/components/product/size-guide';
import { WishlistButton } from '@/components/commerce/wishlist-button';
import { Button } from '@/components/ui/button';
import { ChipButton, ChipSwatch } from '@/components/ui/chip';
import { INVENTORY } from '@/config/business';
import type { SizeSystem } from '@/domain/attributes';
import { galleryAssets, showcaseVideo } from '@/domain/media';
import type { Media, ProductVariant } from '@/domain/types';
import { Carousel, CarouselItem, useSlideParallax } from '@/components/ui/carousel';
import { usePreferredSize } from '@/hooks/use-preferred-size';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import { addToBag } from '@/server/actions/cart';

/**
 * One gallery photograph, with pointer-tracked zoom.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A LENS
 * ---------------------------------------------------------------------------
 * The usual implementation floats a magnified square beside the image. It needs
 * a second copy of the photograph at a much larger size, it covers whatever is
 * next to it (which on this page is the price and the size picker), and it has
 * nothing sensible to do on a phone.
 *
 * This scales the image INSIDE its own frame instead, and moves its
 * transform-origin toward the cursor. One image, no extra request, no overlay
 * over the buy box, and the frame keeps its exact layout box so nothing on the
 * page moves.
 *
 * ---------------------------------------------------------------------------
 * THE MOTION
 * ---------------------------------------------------------------------------
 * The origin is driven by two springs from `lib/motion`, not written straight
 * from the pointer. Tracking a cursor exactly produces a second cursor: the
 * image snaps to every jitter of the hand and the effect feels nervous.
 * `spring.follow` is soft and heavily damped, so the image TRAILS the pointer
 * and settles — which is what reads as glass being moved over a print.
 *
 * Scale gets its own, stiffer spring so the zoom engages promptly while the
 * pan stays languid. One spring for both makes the entry feel sluggish.
 *
 * ---------------------------------------------------------------------------
 * WHEN IT DOES NOT RUN
 * ---------------------------------------------------------------------------
 *  - `pointerType === 'touch'`: a finger has no hover, and the carousel needs
 *    that gesture for swiping. Hijacking it would break the primary way anyone
 *    moves the gallery on the device most people use.
 *  - `prefers-reduced-motion`: the zoom is decoration, so it simply does not
 *    happen. The photograph is fully legible without it.
 */
function ZoomShot({ media, priority = false }: { media: Media; priority?: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const [zoomed, setZoomed] = useState(false);

  /*
   * Origin as a percentage, springed.
   *
   * Starting at the centre matters: if the springs began at 0,0 the first hover
   * would visibly whip the image in from the top-left corner before settling
   * under the cursor.
   */
  const originX = useSpring(50, spring.follow);
  const originY = useSpring(50, spring.follow);
  const scale = useSpring(1, spring.base);

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || reduced) return;
    const box = event.currentTarget.getBoundingClientRect();
    originX.set(((event.clientX - box.left) / box.width) * 100);
    originY.set(((event.clientY - box.top) / box.height) * 100);
  };

  const enter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || reduced) return;
    // Jump the origin to where the pointer entered rather than springing to it,
    // so the zoom opens under the cursor instead of sliding across to meet it.
    const box = event.currentTarget.getBoundingClientRect();
    originX.jump(((event.clientX - box.left) / box.width) * 100);
    originY.jump(((event.clientY - box.top) / box.height) * 100);
    scale.set(1.75);
    setZoomed(true);
  };

  const leave = () => {
    scale.set(1);
    originX.set(50);
    originY.set(50);
    setZoomed(false);
  };

  /*
   * Composed here rather than inline in `style`.
   *
   * `useMotionTemplate` is a hook, and a hook called inside a JSX expression is
   * a rule-of-hooks violation waiting for the first conditional render. It also
   * has to be a template rather than motion's own `originX`/`originY` props,
   * which take 0-1 fractions — `transform-origin` wants percentages, and the
   * springs are already in those units.
   */
  const origin = useMotionTemplate`${originX}% ${originY}%`;

  /*
   * 24px of counter-drift as the gallery is swiped — smaller than the hero's
   * 44px, and deliberately.
   *
   * This photograph is being STUDIED, not glanced at. A shopper checking a seam
   * does not want the garment sliding under their eye, so the drift is just
   * enough to give the swipe somewhere to come from.
   *
   * The layer is already `scale-105` at rest, which covers it: 5% of a 600px
   * well is 30px of headroom on each side.
   */
  const parallaxX = useSlideParallax(0);

  return (
    <div
      onPointerEnter={enter}
      onPointerMove={track}
      onPointerLeave={leave}
      className={cn(
        'bg-sunken relative h-[min(32svh,22rem)] min-h-56 w-full overflow-hidden rounded-2xl lg:h-[min(72dvh,44rem)]',
        // Only advertise the affordance where it exists.
        !reduced && 'lg:cursor-zoom-in',
      )}
    >
      <motion.div
        className="absolute inset-0 scale-105"
        style={{ scale, transformOrigin: origin, x: parallaxX }}
      >
        <Image
          src={media.url}
          alt={media.alt}
          fill
          // Only the first is the LCP candidate; the rest are a swipe away.
          priority={priority}
          sizes="(max-width: 64rem) 100vw, 46vw"
          className="object-contain"
        />
      </motion.div>

      {/*
        A quiet hint, and only while zoomed.

        Without it a shopper who moves the pointer over the photograph gets an
        unexplained effect; with it the interaction names itself. It fades with
        the zoom rather than sitting there permanently, because a permanent
        label over the merchandise is worse than no label.
      */}
      <span
        aria-hidden
        className={cn(
          'glass text-muted pointer-events-none absolute bottom-3 left-3 hidden rounded-full px-2.5 py-1',
          'text-2xs font-medium transition-opacity duration-(--duration-base) lg:block',
          zoomed ? 'opacity-100' : 'opacity-0',
        )}
      >
        Move to explore
      </span>
    </div>
  );
}

/**
 * Gallery and buy box, as one client island.
 *
 * They are combined because COLOUR IS SHARED STATE. Split apart, the gallery
 * has no way to know which colourway is selected and ends up showing every
 * shot of every colour at once — sixteen thumbnails for a four-colour style,
 * most of them for a garment the shopper is not looking at.
 *
 * Everything else on the product page stays a Server Component; this is the
 * only interactive region.
 */
export function ProductViewer({
  productId,
  title,
  variants,
  media,
  sizeOptions,
  sizeSystem,
  colorOptions,
  header,
  footer,
}: {
  productId: string;
  title: string;
  variants: ProductVariant[];
  /** Style-level media, used when a colour has none of its own. */
  media: Media[];
  sizeOptions: string[];
  /** The scale the sizes are on, so the shopper's usual size can be pointed out. */
  sizeSystem?: SizeSystem;
  colorOptions: Array<{ value: string; label: string; hex: string }>;
  /**
   * Server-rendered slots for the buy column. Brand, title, rating, seller and
   * policy blocks have no interactive state, so they stay Server Components and
   * are passed through rather than reimplemented on the client.
   */
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [color, setColor] = useState(colorOptions[0]?.value ?? '');
  const [size, setSize] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // The shopper's usual size on this product's scale, when they have told us
  // one and this product is made in it. A hint only: see `usePreferredSize`.
  const preferred = usePreferredSize(sizeSystem);
  const usualSize = preferred && sizeOptions.includes(preferred) ? preferred : null;

  const forColor = useMemo(
    () => variants.filter((v) => v.color === color && v.isActive),
    [variants, color],
  );

  const bySize = useMemo(() => new Map(forColor.map((v) => [v.size, v])), [forColor]);
  const selected = size ? (bySize.get(size) ?? null) : null;

  /** Only this colourway's shots, de-duplicated — variants share media. */
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const out: Media[] = [];
    for (const variant of forColor) {
      for (const item of variant.media) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
      }
    }
    // Photographs only. A video in this list would be handed to `ZoomShot`,
    // which renders an `<img>` — it belongs on its own slide, below.
    return galleryAssets(out.length > 0 ? out : media).slice(0, 8);
  }, [forColor, media]);

  /*
   * The product video, as the last slide.
   *
   * Last rather than first on purpose: the photographs are what a shopper came
   * to study, and a video that opens the gallery costs a tap before the
   * garment is even seen. It is a slide rather than a block further down the
   * page because that is where people already swipe for more of the product.
   */
  const video = useMemo(() => showcaseVideo(media), [media]);
  const slideCount = gallery.length + (video ? 1 : 0);

  // Quote the selected variant, or the cheapest available one before a choice
  // is made — never an average, which matches nothing actually on sale.
  const quoted =
    selected ??
    forColor.filter((v) => v.inventory.available > 0).sort((a, b) => a.sellingPrice - b.sellingPrice)[0] ??
    forColor[0];

  const discountPercent =
    quoted && quoted.mrp > quoted.sellingPrice
      ? Math.round(((quoted.mrp - quoted.sellingPrice) / quoted.mrp) * 100)
      : 0;

  const handleAdd = () => {
    if (!selected) {
      toast.error('Choose a size first');
      document.getElementById('size-options')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    startTransition(async () => {
      const result = await addToBag({ productId, variantId: selected.id, quantity: 1 });
      if (result.ok) {
        toast.success('Added to your bag', {
          action: { label: 'View bag', onClick: () => router.push('/bag') },
        });
      } else {
        toast.error(result.error ?? 'Could not add this to your bag.');
      }
    });
  };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 xl:gap-14">
      {/* ------------------------------------------------------- gallery */}

      {/*
        One gallery for every width.
        
        It used to be a tablist: a single large image, changed by clicking a
        thumbnail. That is a pointer interaction, and on a phone it meant the
        one thing everybody tries — swiping the photo — did nothing at all.
        
        Now the photos ARE a carousel, and the thumbnails drive it rather than
        replacing it. Swiping works, the desktop click still works, and there is
        one set of images in the DOM instead of a mobile copy and a desktop copy.
      */}
      <div className="min-w-0 flex flex-col-reverse gap-3 lg:sticky lg:top-[calc(var(--app-sticky-offset)+1rem)] lg:self-start lg:flex-row lg:gap-4">
        {gallery.length > 1 ? (
          <div
            aria-label={`${title} images`}
            role="group"
            className="scrollbar-none flex max-w-full gap-2 overflow-x-auto p-1 lg:max-h-[72dvh] lg:w-16 lg:shrink-0 lg:flex-col lg:overflow-y-auto"
          >
            {gallery.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show image ${index + 1}: ${item.alt}`}
                aria-current={index === shot}
                onClick={() => setShot(index)}
                className={cn(
                  'bg-sunken relative aspect-4/5 w-14 shrink-0 overflow-hidden rounded-md lg:w-full',
                  'transition-[outline-color,transform] duration-(--duration-base) ease-(--ease-out)',
                  'outline-2 outline-offset-2',
                  'motion-safe:hover:scale-[1.04] motion-safe:active:scale-95',
                  index === shot ? 'outline-ink' : 'outline-transparent hover:outline-line-bold',
                )}
              >
                <Image
                  src={item.thumbnailUrl}
                  alt=""
                  fill
                  sizes="72px"
                  loading="lazy"
                  className={cn(
                    'object-cover transition-opacity duration-(--duration-base)',
                    // The unselected shots recede rather than sitting at full
                    // strength — four equally bright thumbnails give the eye no
                    // clue which one is on screen.
                    index === shot ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}

        <Carousel
          label={`${title} photographs`}
          className="min-w-0 flex-1"
          contentClassName="gap-0 rounded-xl"
          dots={slideCount > 1}
          activeIndex={shot}
          onActiveChange={setShot}
        >
          {gallery.map((item, index) => (
            <CarouselItem
              key={item.id}
              index={index + 1}
              total={gallery.length}
              className="w-full"
              /*
               * Depth, and a smaller parallax than the hero's.
               *
               * A PDP gallery is one photograph at a time with no peek, so the
               * neighbours receding is what gives a swipe somewhere to come
               * from. The drift is 28px rather than 56: this image is being
               * STUDIED, not glanced at, and a shopper checking a seam does not
               * want the garment sliding under their eye.
               *
               * The drift itself is applied inside `ZoomShot`, on the image
               * layer — see `useSlideParallax`.
               */
              depth
            >
              {/*
                Shorter than 3:4 on a phone. A full-width 3:4 photo is 520px
                tall before the header and breadcrumb are counted, which put the
                title and the price below the fold on every phone made.
              */}
              <ZoomShot media={item} priority={index === 0} />
            </CarouselItem>
          ))}

          {video ? (
            <CarouselItem
              key={video.id}
              index={slideCount}
              total={slideCount}
              className="w-full"
              depth
            >
              {/*
                Controls, and no autoplay.

                A clip that starts itself inside a gallery someone is swiping
                through is noise they did not ask for, and on a phone it is
                their data. `preload="metadata"` fetches the first frames only,
                so the poster is real rather than a black rectangle.
              */}
              <video
                src={video.url}
                poster={video.thumbnailUrl !== video.url ? video.thumbnailUrl : undefined}
                controls
                playsInline
                preload="metadata"
                className="bg-sunken h-[min(32svh,22rem)] min-h-56 w-full rounded-2xl object-contain lg:h-[min(72dvh,44rem)]"
              >
                <track kind="captions" />
              </video>
            </CarouselItem>
          ) : null}
        </Carousel>
      </div>

      {/* ------------------------------------------------------ buy box */}

      <div className="bg-raised border-line min-w-0 rounded-3xl border p-4 shadow-sm sm:p-6 lg:self-start">
        {header}

        <div className="space-y-6">
          {quoted ? (
            <div>
              <PriceBlock
                sellingPrice={quoted.sellingPrice}
                mrp={quoted.mrp}
                discountPercent={discountPercent}
                size="xl"
              />
              <p className="text-faint mt-1 text-xs">Inclusive of all taxes</p>
            </div>
          ) : null}

          {colorOptions.length > 1 ? (
            <fieldset>
              <legend className="text-faint text-2xs font-semibold uppercase tracking-[0.14em]">
                Colour —{' '}
                <span className="text-ink normal-case tracking-normal">
                  {colorOptions.find((c) => c.value === color)?.label}
                </span>
              </legend>

              {/*
                The same `ChipSwatch` the filter rail uses.

                Two implementations of "a colour you can pick" is how the swatch
                on the listing page and the swatch on the product page end up
                different sizes with different selection rings — which reads as
                two different products having been designed by two people.
              */}
              <div className="mt-2 flex flex-wrap gap-1">
                {colorOptions.map((option) => (
                  <ChipSwatch
                    key={option.value}
                    hex={option.hex}
                    label={option.label}
                    active={option.value === color}
                    onClick={() => {
                      setColor(option.value);
                      // A new colour may not stock the chosen size, and its
                      // gallery is different, so both reset rather than
                      // silently pointing at something that no longer exists.
                      setSize(null);
                      setShot(0);
                    }}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset id="size-options" className="scroll-mt-32">
            <div className="flex items-baseline justify-between">
              <legend className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
                Size
              </legend>
              <SizeGuide sizes={sizeOptions} />
            </div>

            {/*
              A sold-out size stays visible and stays announceable.

              `ChipButton` sets `aria-disabled` rather than `disabled` for
              exactly this: "Size 32, unavailable" is information a shopper
              needs, and a truly disabled button is skipped by the keyboard
              entirely — so the one fact the chip exists to convey never reaches
              anyone browsing without a pointer.
            */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sizeOptions.map((option) => {
                const variant = bySize.get(option);
                const available = variant?.inventory.available ?? 0;
                const soldOut = !variant || available <= 0;

                return (
                  <ChipButton
                    key={option}
                    active={option === size}
                    unavailable={soldOut}
                    onClick={() => !soldOut && setSize(option)}
                    title={
                      option === usualSize
                        ? `${option} — your usual size${soldOut ? ', sold out' : ''}`
                        : soldOut
                          ? `${option} — sold out`
                          : option
                    }
                  >
                    {option}
                    {option === usualSize ? (
                      <>
                        <span
                          aria-hidden
                          className="bg-accent ml-1.5 inline-block size-1.5 rounded-full align-middle"
                        />
                        <span className="sr-only">, your usual size</span>
                      </>
                    ) : null}
                  </ChipButton>
                );
              })}
            </div>

            {/*
              The usual size, offered rather than chosen.

              Selecting it for them would be quicker and wrong: a copy of the
              preference left on a shared device must never be able to put
              somebody else's size in the bag. One tap is the whole cost.
            */}
            {usualSize && usualSize !== size ? (
              (bySize.get(usualSize)?.inventory.available ?? 0) > 0 ? (
                <button
                  type="button"
                  data-usual-size={usualSize}
                  onClick={() => setSize(usualSize)}
                  className="text-accent-ink mt-2.5 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline lg:min-h-0"
                >
                  <span aria-hidden className="bg-accent size-1.5 rounded-full" />
                  Your usual size, {usualSize}, is in stock. Select it
                </button>
              ) : (
                <p data-usual-size={usualSize} className="text-muted mt-2.5 flex items-center gap-1.5 text-xs">
                  <span aria-hidden className="border-line-strong size-1.5 rounded-full border" />
                  Your usual size, {usualSize}, is sold out in this colour
                </p>
              )
            ) : null}

            {selected && selected.inventory.available <= INVENTORY.urgencyThreshold ? (
              <p className="text-danger-600 mt-2.5 text-xs font-medium">
                Only {selected.inventory.available} left in size {selected.size}
              </p>
            ) : null}
          </fieldset>

          {/*
            The same action, pinned.
            
            On a phone the buy box sits below a full-width photograph, so the
            primary action on the page was always at least one scroll away — and
            gone again the moment someone read the description. This mirrors it
            at the bottom of the viewport, where every shopping app puts it, and
            carries the price so the decision and the button are in one place.
            
            It duplicates no logic: same handler, same disabled state, same
            pending flag. Only the position differs.
          */}
          <div
            className={cn(
              'glass border-line fixed inset-x-0 z-30 flex items-center gap-2 border-t px-3 py-2.5 lg:hidden',
              // Sits directly on top of the bottom navigation, using its own
              // token rather than a hardcoded 3.5rem — the two used to drift
              // apart every time the bar's height changed.
              'bottom-(--spacing-bottom-nav)',
            )}
          >
            {quoted ? (
              <div className="min-w-0 shrink-0">
                <PriceBlock
                  sellingPrice={quoted.sellingPrice}
                  mrp={quoted.mrp}
                  discountPercent={0}
                  size="md"
                />
                <p className="text-faint text-2xs leading-tight">
                  {size ? `Size ${size}` : 'Choose a size'}
                </p>
              </div>
            ) : null}

            {/* Keep the unfamiliar live option legible beside the purchase CTA. */}
            <SeeLiveButton
              productId={productId}
              variantId={selected?.id ?? null}
              sizeLabel={selected?.size ?? null}
              size="sm"
              variant="secondary"
              label="See it live"
              className="min-h-11 w-auto min-w-0 shrink-0 px-2.5 text-xs sm:px-4"
            />

            <Button size="cta" shape="pill" onClick={handleAdd} loading={pending} className="w-auto min-w-0 flex-1 px-2 text-xs sm:px-3 sm:text-sm">
              {!pending ? <ShoppingBag className="hidden size-4 min-[375px]:block" /> : null}
              Add to bag
            </Button>
          </div>

          {/*
            Exactly one Add to bag is VISIBLE at any width. The pinned bar owns
            the action on a phone, this row owns it from `lg` up — two visible
            copies of the same button is a control people press twice.
          */}
          <div className="hidden lg:block">
            <div className="flex gap-2.5">
              <Button
                size="cta"
                shape="pill"
                onClick={handleAdd}
                loading={pending}
                className="flex-1"
              >
                {!pending ? <ShoppingBag className="size-4" /> : null}
                Add to bag
              </Button>

              <WishlistButton
                productId={productId}
                productTitle={title}
                size="lg"
                variant="outline"
                className="size-12"
              />
            </div>

            {/*
              The second CTA sits BELOW the first, full width, not beside it.
              
              Side by side, two pill buttons of equal width read as a choice
              between equals — and they are not: one of them takes money and the
              other starts a conversation. Stacked, the hierarchy is stated by
              position and the live option still gets a full-width target, which
              it needs because it is the unfamiliar one.
            */}
            <SeeLiveButton
              productId={productId}
              variantId={selected?.id ?? null}
              sizeLabel={selected?.size ?? null}
              className="mt-2.5"
            />
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}
