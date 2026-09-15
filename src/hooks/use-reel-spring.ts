'use client';
import { useCallback, useEffect, useRef } from 'react';

/** Integrate a damped spring in pixels/seconds. Bound the time step after a
 * background tab or slow frame so the spring cannot explode. */
export function reelSpringStep(position: number, velocity: number, target: number, dt: number) {
  const step = Math.min(dt, 1 / 60);
  const nextVelocity = velocity + ((target - position) * 210 - velocity * 29) * step;
  return { position: position + nextVelocity * step, velocity: nextVelocity };
}

export function useReelSpring(count: number, reduced: boolean) {
  const viewport = useRef<HTMLDivElement>(null);
  const navigateRef = useRef<(index: number) => void>(() => {});
  const goTo = useCallback((index: number) => navigateRef.current(index), []);
  useEffect(() => {
    const node = viewport.current;
    if (!node || count === 0) return;
    let frame = 0, index = 0, wheel = 0, wheelAt = 0;
    let startY = 0, startX = 0, origin = 0, started = 0, dragging = false;
    const clamp = (n: number) => Math.max(0, Math.min(count - 1, n));
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const go = (next: number, velocity = 0) => {
      stop(); index = clamp(next);
      const target = index * node.clientHeight;
      if (reduced) { node.scrollTop = target; return; }
      let position = node.scrollTop, previous = performance.now();
      const tick = (now: number) => {
        const result = reelSpringStep(position, velocity, target, (now - previous) / 1000);
        position = result.position; velocity = result.velocity; previous = now;
        node.scrollTop = position;
        if (Math.abs(position - target) < 0.5 && Math.abs(velocity) < 1) { node.scrollTop = target; frame = 0; }
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    navigateRef.current = go;
    const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button, a, input, textarea, [role="dialog"]'));
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || interactive(event.target)) { dragging = false; return; }
      stop(); dragging = true;
      startY = event.touches[0]!.clientY; startX = event.touches[0]!.clientX;
      origin = node.scrollTop; started = event.timeStamp;
    };
    const touchMove = (event: TouchEvent) => {
      if (!dragging) return;
      if (event.touches.length !== 1) { dragging = false; go(index); return; }
      const dy = startY - event.touches[0]!.clientY;
      const dx = startX - event.touches[0]!.clientX;
      if (Math.abs(dx) > Math.abs(dy) * 1.5) return;
      event.preventDefault();
      node.scrollTop = origin + dy;
    };
    const touchEnd = (event: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      const dy = startY - (event.changedTouches[0]?.clientY ?? startY);
      const speed = dy / Math.max(1, event.timeStamp - started);
      const advance = Math.abs(dy) > node.clientHeight * 0.18 || (Math.abs(dy) > 28 && Math.abs(speed) > 0.35);
      go(advance ? index + Math.sign(dy) : index, speed * 1000);
    };
    const cancel = () => { dragging = false; go(index); };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 650) return;
      wheel += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      if (Math.abs(wheel) >= 45) { go(index + Math.sign(wheel)); wheelAt = now; wheel = 0; }
    };
    const onKey = (event: KeyboardEvent) => {
      if (interactive(event.target)) return;
      const next = event.key === 'ArrowDown' || event.key === 'PageDown' ? index + 1 : event.key === 'ArrowUp' || event.key === 'PageUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
      if (next !== null) { event.preventDefault(); go(next); }
    };
    const resize = new ResizeObserver(() => { stop(); node.scrollTop = index * node.clientHeight; });
    resize.observe(node);
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: false });
    node.addEventListener('touchend', touchEnd, { passive: true });
    node.addEventListener('touchcancel', cancel, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('keydown', onKey);
    node.dataset.reelReady = 'true';
    return () => {
      delete node.dataset.reelReady;
      stop(); resize.disconnect(); navigateRef.current = () => {};
      node.removeEventListener('touchstart', touchStart); node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('touchend', touchEnd); node.removeEventListener('touchcancel', cancel);
      node.removeEventListener('wheel', onWheel); node.removeEventListener('keydown', onKey);
    };
  }, [count, reduced]);
  return { viewport, goTo };
}
