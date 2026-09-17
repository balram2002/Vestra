'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { Banner, HomeSectionConfig } from '@/domain/types';
import { cn } from '@/lib/cn';

const DURATION = 5200;
type Layout = NonNullable<HomeSectionConfig['layoutDesktop']>;

/** Desktop has its own composition and motion; the mobile carousel is untouched. */
export function DesktopHeroCarousel({ banners, layout }: { banners: Banner[]; layout: Layout }) {
  const shown = banners.slice(0, 5);
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visible, setVisible] = useState(true);
  const viewport = useRef<HTMLElement>(null);
  const [cycle, setCycle] = useState(0);
  const count = shown.length;

  useEffect(() => {
    if (count < 2 || !visible || reduced) return;
    const timer = window.setTimeout(() => {
      setDirection(1);
      setIndex((current) => (current + 1) % count);
      setCycle((current) => current + 1);
    }, DURATION);
    return () => window.clearTimeout(timer);
  }, [count, index, visible, reduced, cycle]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden), { threshold: 0.2 });
    if (viewport.current) observer.observe(viewport.current);
    return () => { document.removeEventListener('visibilitychange', onVisibility); observer.disconnect(); };
  }, []);

  if (!count) return null;
  const active = shown[index];
  const navigate = (next: number) => {
    setDirection(next >= index ? 1 : -1);
    setIndex((next + count) % count);
    setCycle((current) => current + 1);
  };

  return (
    <section ref={viewport} className="gutter shell-max pt-5" aria-roledescription="carousel" aria-label="Featured collections" onKeyDown={(event) => {
      if (event.key === 'ArrowRight') navigate(index + 1);
      if (event.key === 'ArrowLeft') navigate(index - 1);
    }}>
      <div className={cn('relative isolate overflow-hidden rounded-[2rem] bg-[#181c22] text-white shadow-xl', layout === 'MOSAIC' ? 'min-h-[34rem]' : 'min-h-[min(38rem,66vh)]')}>
        <AnimatePresence mode="sync" custom={direction} initial={false}>
          <motion.div
            key={active.id}
            custom={direction}
            initial={reduced ? false : { opacity: 0, x: direction * 72, scale: 1.025 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, x: direction * -56, scale: 0.985 }}
            transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
            className={cn('absolute inset-0', layout === 'DEFAULT' && 'grid grid-cols-[44%_56%]', layout === 'FEATURED' && 'grid grid-cols-[52%_48%]', layout === 'MOSAIC' && 'grid grid-cols-[1fr_1.1fr]')}
          >
            {layout === 'FEATURED' ? <div className="absolute inset-0"><Image src={active.imageUrl} alt={active.alt} fill priority={index === 0} sizes="100vw" className="object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" /></div> : null}
            <div className={cn('relative z-10 flex flex-col justify-center px-12 py-16 xl:px-20', layout === 'FEATURED' && 'col-span-2 max-w-[56rem]', layout === 'MOSAIC' && 'order-2 bg-[#181c22]')}>
              <motion.p initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }} className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{active.eyebrow || 'The edit'}</motion.p>
              <motion.h2 initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }} className="font-display mt-5 max-w-[11ch] text-5xl font-semibold leading-[1.05] tracking-tight text-white xl:text-7xl">{active.headline || active.name}</motion.h2>
              {active.subheadline ? <motion.p initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }} className="mt-6 max-w-md text-base leading-relaxed text-white/80 xl:text-lg">{active.subheadline}</motion.p> : null}
              <div className="mt-9"><Link href={active.href} className="inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-7 text-sm font-semibold text-[#181c22] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">{active.ctaLabel || 'Explore collection'}<ArrowRight className="size-4" aria-hidden /></Link></div>
            </div>
            {layout !== 'FEATURED' ? <div className={cn('relative min-h-full overflow-hidden', layout === 'MOSAIC' && 'order-1 m-4 rounded-[1.3rem]')}><Image src={active.imageUrl} alt={active.alt} fill priority={index === 0} sizes="(max-width: 1280px) 56vw, 760px" className="object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-[#181c22]/20 to-transparent" /></div> : null}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-7 right-7 z-20 flex items-center gap-2">
          <button type="button" aria-label="Previous slide" onClick={() => navigate(index - 1)} className="grid size-11 place-items-center rounded-full border border-white/40 bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/50"><ChevronLeft className="size-5" /></button>
          <button type="button" aria-label="Next slide" onClick={() => navigate(index + 1)} className="grid size-11 place-items-center rounded-full border border-white/40 bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/50"><ChevronRight className="size-5" /></button>
        </div>
      </div>
      {count > 1 ? <div className="mt-4 flex items-center justify-center gap-2" aria-label="Choose a slide">{shown.map((banner, slide) => <button key={banner.id} type="button" aria-label={`Go to slide ${slide + 1} of ${count}`} aria-current={slide === index ? 'true' : undefined} onClick={() => navigate(slide)} className={cn('relative h-2 overflow-hidden rounded-full bg-line-strong transition-[width] duration-300', slide === index ? 'w-12' : 'w-3 hover:w-5')}><span key={`${cycle}-${index}`} className={cn('absolute inset-y-0 left-0 bg-ink', slide === index && !reduced && 'hero-progress-fill', (!visible || reduced) && 'paused')} style={{ animationDuration: `${DURATION}ms` }} /></button>)}</div> : null}
    </section>
  );
}
