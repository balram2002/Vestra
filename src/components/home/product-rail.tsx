import { ProductCard } from '@/components/commerce/product-card';
import { Carousel, CarouselItem } from '@/components/ui/carousel';
import type { HomeSection, ProductSummary } from '@/domain/types';

import { Section } from './section';

/**
 * Product rail.
 *
 * The most-repeated section on the home page, so the decisions here are made
 * once and inherited five times.
 *
 * **Slide width is a fraction, not a pixel count.** `46%` on a phone means two
 * cards plus a visible sliver of the third — and that sliver is the entire
 * affordance. A row that ends flush at the viewport edge looks like the whole
 * set, and nobody swipes it. The reference hard-codes `min-width: 318px`, which
 * shows 1.1 cards on a 360px phone and 4.5 on a desktop; a fraction shows the
 * right number at every width without a media query.
 *
 * **A progress bar, not dots.** Twenty dots under a rail is not an indicator,
 * it is a second row of controls. The bar says how far along the row is, which
 * is the only thing anyone actually reads off a rail.
 *
 * **The rail bleeds; the heading does not.** The section keeps the page gutter
 * for its title and hands the scroller a gutter of its own, so cards run off
 * both edges of a phone while the heading stays on the grid with every other
 * section.
 */
export function ProductRail({
  section,
  products,
  /** Set on the first rail above the fold so its images are not lazy-loaded. */
  priority = false,
}: {
  section: HomeSection;
  products: ProductSummary[];
  priority?: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <Section
      title={section.title}
      subtitle={section.subtitle}
      href={section.href}
      flush
    >
      <Carousel
        label={section.title ?? 'Products'}
        progress
        fadeEdges
        /*
         * The arrows fade in on hover here, unlike the hero's.
         *
         * A rail is merchandise, and two permanent glass discs sitting over the
         * product photography are two pieces of chrome the shopper did not ask
         * for. On a hero the arrows are the primary way anyone moves it; on a
         * rail the thumb and the trackpad already are, so the arrows can wait
         * until a pointer shows up. Keyboard focus brings them straight back.
         */
        revealArrows
        contentClassName="gutter shell-max gap-3 sm:gap-4"
      >
        {products.map((product, index) => (
          <CarouselItem
            key={product.id}
            index={index + 1}
            total={products.length}
            className="w-[46%] sm:w-[31%] lg:w-[23%] xl:w-[18.5%]"
            /*
             * No `depth`, and no parallax either.
             *
             * A rail shows four cards at once and all four are equally
             * shoppable. Receding and dimming three of them — right for a hero,
             * where the neighbours genuinely are behind — makes a product row
             * look half-loaded. And the card is a Server Component that owns its
             * own image well, so there is no media layer here for a parallax to
             * take hold of without turning every card into a client island.
             *
             * The rail's motion is the spring on the scroll itself, which is
             * where it belongs.
             */
          >
            {/*
              Only the first two are eager, and only on a priority rail. A
              `priority` image is a preload hint — marking twenty of them tells
              the browser everything is urgent, which is the same as telling it
              nothing is.
            */}
            <ProductCard product={product} priority={priority && index < 2} />
          </CarouselItem>
        ))}
      </Carousel>
    </Section>
  );
}
