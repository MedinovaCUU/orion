import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

// Places a fixed card next to what was double-clicked, like Apple Calendar: to the right of it, or to the
// left when there is no room, with the arrow pointing at its middle.
export default function useAnchoredPopover(ref: RefObject<HTMLElement | null>, anchor: DOMRect) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const gap = 10;
    const right = anchor.right + gap + box.width <= window.innerWidth - 8;
    const left = right ? anchor.right + gap : Math.max(8, anchor.left - gap - box.width);
    const top = Math.max(8, Math.min(anchor.top + anchor.height / 2 - 60, window.innerHeight - box.height - 8));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.dataset.side = right ? 'right' : 'left';
    element.style.setProperty('--arrow-top', `${Math.max(18, Math.min(box.height - 18, anchor.top + anchor.height / 2 - top))}px`);
    element.style.visibility = 'visible';
  }, [anchor, ref]);
}
