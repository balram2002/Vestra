'use client';
import { useDrag } from '@use-gesture/react';

export interface EdgeSwipeOptions {
  onOpen?: () => void;
  onClose?: () => void;
  isOpen?: boolean;
  edge?: number;
  distance?: number;
  maxWidth?: number;
  enabled?: boolean;
}
function ownsGesture(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    if (node.matches('[data-no-swipe], input, textarea, select, [role="slider"]')) return true;
    const style = getComputedStyle(node);
    if (style.touchAction.includes('pan-x') || style.touchAction === 'none') return true;
    if (['auto', 'scroll'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
    node = node.parentElement;
  }
  return false;
}
/** Touch events survive native scrolling; controls and carousels own their gestures. */
export function useEdgeSwipe({ onOpen, onClose, isOpen = false, edge = 28,
  distance = 64, maxWidth = 1024, enabled = true }: EdgeSwipeOptions): void {
  useDrag(({ first, last, initial, movement: [dx, dy], elapsedTime, event, memo }) => {
    const allowed = first
      ? window.innerWidth < maxWidth && (isOpen || initial[0] <= edge) && !ownsGesture(event.target)
      : memo;
    if (last && allowed && elapsedTime < 700 && Math.abs(dx) >= distance && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (!isOpen && dx > 0) onOpen?.();
      else if (isOpen && dx < 0) onClose?.();
    }
    return allowed;
  }, { target: typeof document === 'undefined' ? undefined : document, enabled,
    pointer: { touch: true, mouse: false }, eventOptions: { passive: true }, filterTaps: true });
}
