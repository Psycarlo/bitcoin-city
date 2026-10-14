import { flushSync } from "react-dom";

import { useThemeStore } from "@/stores/theme-store";
import type { Theme } from "@/stores/theme-store";

const REVEAL_MS = 750;
const REVEAL_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

/** Where the reveal grows from, in viewport px. */
export interface Origin {
  x: number;
  y: number;
}

const reducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Grows the new theme out of the origin, and sinks the old one back a touch. */
const reveal = (x: number, y: number, radius: number) => {
  const root = document.documentElement;
  root.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: REVEAL_MS,
      easing: REVEAL_EASING,
      pseudoElement: "::view-transition-new(root)",
    }
  );
  root.animate(
    { filter: ["none", "blur(2px) brightness(0.9)"], scale: [1, 0.985] },
    {
      duration: REVEAL_MS,
      easing: REVEAL_EASING,
      pseudoElement: "::view-transition-old(root)",
    }
  );
};

/**
 * Switches the theme with a view transition: the new theme grows out of
 * `origin` as a circle over the old one, which sinks back a touch as it is
 * covered. Browsers without view transitions (or with reduced motion asked
 * for) switch at once.
 */
export const switchTheme = async (theme: Theme, origin?: Origin) => {
  const apply = () => {
    flushSync(() => {
      useThemeStore.getState().setTheme(theme);
    });
  };
  if (!document.startViewTransition || reducedMotion()) {
    apply();
    return;
  }
  const x = origin?.x ?? globalThis.innerWidth / 2;
  const y = origin?.y ?? 0;
  // Far enough to cover the farthest corner.
  const radius = Math.hypot(
    Math.max(x, globalThis.innerWidth - x),
    Math.max(y, globalThis.innerHeight - y)
  );
  const root = document.documentElement;
  root.dataset.themeSwitch = theme;
  const transition = document.startViewTransition(apply);
  try {
    await transition.ready;
    reveal(x, y, radius);
    await transition.finished;
  } catch {
    // Skipped (another one started): the theme is switched all the same.
  } finally {
    delete root.dataset.themeSwitch;
  }
};
