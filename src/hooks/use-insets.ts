import { useCallback, useState } from "react";

import type { Insets } from "@/scene/camera-rig";

const sameInsets = (a: Insets, b: Insets) =>
  a.bottom === b.bottom &&
  a.left === b.left &&
  a.right === b.right &&
  a.top === b.top;

/**
 * How far an element sits from each edge of its positioned parent, kept up
 * to date as either changes size. Given the room the panels leave free, it
 * tells how much they take. Returns the insets (the initial ones until the
 * element is measured) and the ref to attach.
 */
export const useInsets = (initial: Insets) => {
  const [insets, setInsets] = useState(initial);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    const frame = element.offsetParent ?? document.documentElement;
    const measure = () => {
      const outer = frame.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      const next = {
        bottom: Math.round(outer.bottom - inner.bottom),
        left: Math.round(inner.left - outer.left),
        right: Math.round(outer.right - inner.right),
        top: Math.round(inner.top - outer.top),
      };
      setInsets((previous) => (sameInsets(previous, next) ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [insets, ref] as const;
};
