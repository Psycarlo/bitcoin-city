import type { ThreeEvent } from "@react-three/fiber";
import type { Box3 } from "three";

import type { SceneKey } from "@/lib/scene-key";
import { useViewActions, useViewStore } from "@/stores/view-store";
import type { ViewStore } from "@/stores/view-store";

import { pathPoint, PLOT } from "../layout";

/** Farther than this (px) between press and release, a click was a drag. */
export const CLICK_TOLERANCE = 4;
/** Height of what stands on a plot, for bringing it into view. */
const CONTENT_HEIGHT = 80;

export type Highlight = "hovered" | "selected" | undefined;

/** Whether something is picked or under the pointer (picked first). */
export const highlightOf = (state: ViewStore, key: SceneKey): Highlight => {
  if (state.selected === key) {
    return "selected";
  }
  return state.hovered === key ? "hovered" : undefined;
};

export const useHighlight = (key: SceneKey) =>
  useViewStore((state) => highlightOf(state, key));

/** Fills `into` with a plot and what stands on it, at a place on the path. */
export const plotBox = (slot: number, into: Box3) => {
  const centre = pathPoint(slot);
  into.min.set(centre.x - PLOT / 2, 0, centre.z - PLOT / 2);
  into.max.set(centre.x + PLOT / 2, CONTENT_HEIGHT, centre.z + PLOT / 2);
  return true;
};

/**
 * Pointer handlers of a plot: pointing names it, clicking picks it. The
 * buildings of a city stop the events they take, so a plot only gets those
 * that miss them.
 */
export const usePlotHandlers = (key: SceneKey) => {
  const { hover, select, unhover } = useViewActions();
  return {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (event.delta <= CLICK_TOLERANCE) {
        select(key);
      }
    },
    onPointerOut: () => {
      unhover(key);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      hover(key);
    },
  };
};
