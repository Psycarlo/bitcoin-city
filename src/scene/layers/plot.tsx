import { useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { MeshLambertMaterial } from "three";

import type { SceneKey } from "@/lib/scene-key";
import { cn } from "@/lib/utils";
import { useViewActions, useViewStore } from "@/stores/view-store";

import { COVERED_CLASSES, declutterRef } from "../declutter";
import { roundedSlab } from "../geometry";
import { SceneHtml } from "../html-layer";
import { PAD_TOP, PLOT } from "../layout";
import { PALETTE } from "../palette";
import { CLICK_TOLERANCE } from "./plot-state";
import type { Highlight } from "./plot-state";

const PAD_RADIUS = 28;
const RIM_WIDTH = 14;
const Z_RANGE: [number, number] = [40, 21];

/** Shared by every plot, for as long as the page lives. */
const PAD = roundedSlab(PLOT, PLOT, PAD_RADIUS, PAD_TOP);
const RIM = roundedSlab(
  PLOT + RIM_WIDTH * 2,
  PLOT + RIM_WIDTH * 2,
  PAD_RADIUS + RIM_WIDTH,
  PAD_TOP / 2
);
const PAD_SIDE = new MeshLambertMaterial({ color: PALETTE.padSide });
const PAD_MATERIALS = {
  next: [new MeshLambertMaterial({ color: PALETTE.padNext }), PAD_SIDE],
  plain: [new MeshLambertMaterial({ color: PALETTE.pad }), PAD_SIDE],
};
const RIM_MATERIALS = {
  hovered: new MeshLambertMaterial({ color: PALETTE.hover }),
  selected: new MeshLambertMaterial({ color: PALETTE.selection }),
};

interface PlotPadProps {
  highlight: Highlight;
  variant?: keyof typeof PAD_MATERIALS;
}

/** The raised square a block stands on, ringed when picked or pointed at. */
export const PlotPad = ({ highlight, variant = "plain" }: PlotPadProps) => (
  <>
    <mesh
      geometry={PAD}
      material={PAD_MATERIALS[variant]}
      position-y={PAD_TOP}
      receiveShadow
    />
    {highlight ? (
      <mesh
        geometry={RIM}
        material={RIM_MATERIALS[highlight]}
        position-y={PAD_TOP - 1}
      />
    ) : null}
  </>
);

interface PlotLabelProps {
  children: ReactNode;
  /** Colour of the dot ahead of the text (a fee rate's). */
  colour?: string;
  /** Height of the label's anchor above the plot. */
  height: number;
  highlight: Highlight;
  /** Which label stays when two would overlap (higher wins). */
  priority: number;
  sceneKey: SceneKey;
}

const PRIORITY = { hovered: 90, selected: 100 } as const;

/** Pill above a plot naming what stands on it. Clicking picks it. */
export const PlotLabel = ({
  children,
  colour,
  height,
  highlight,
  priority,
  sceneKey,
}: PlotLabelProps) => {
  const shown = useViewStore((state) => state.toggles.labels);
  const { hover, select, unhover } = useViewActions();
  // Where the pointer went down: a drag that ends on the label picks nothing.
  const downRef = useRef({ x: 0, y: 0 });
  if (!shown && !highlight) {
    return null;
  }
  const selected = highlight === "selected";
  const handlePointerDown = (event: PointerEvent) => {
    downRef.current = { x: event.clientX, y: event.clientY };
  };
  const handleClick = (event: MouseEvent) => {
    const { x, y } = downRef.current;
    // A click from the keyboard has no pointer (`detail` 0).
    const dragged =
      event.detail > 0 &&
      Math.hypot(event.clientX - x, event.clientY - y) > CLICK_TOLERANCE;
    if (!dragged) {
      select(sceneKey);
    }
  };
  const handlePointerEnter = () => {
    hover(sceneKey);
  };
  const handlePointerLeave = () => {
    unhover(sceneKey);
  };
  return (
    <SceneHtml position-y={height} zIndexRange={Z_RANGE}>
      <button
        className={cn(
          "pointer-events-auto flex -translate-x-1/2 -translate-y-[calc(100%+10px)] cursor-pointer items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11px] font-semibold whitespace-nowrap shadow-md ring-1 transition duration-200",
          COVERED_CLASSES,
          selected
            ? "bg-primary text-primary-foreground ring-primary"
            : "bg-white/95 text-slate-800 ring-slate-900/10 hover:bg-white"
        )}
        data-priority={highlight ? PRIORITY[highlight] : priority}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        ref={declutterRef}
        type="button"
      >
        {colour ? (
          <span
            className="size-2 rounded-full ring-2 ring-white/70"
            style={{ backgroundColor: colour }}
          />
        ) : null}
        {children}
      </button>
    </SceneHtml>
  );
};

/** Quieter part of a label's text. */
export const LabelNote = ({
  children,
  selected,
}: {
  children: ReactNode;
  selected: boolean;
}) => (
  <span
    className={cn(
      "font-medium",
      selected ? "text-primary-foreground/80" : "text-slate-500"
    )}
  >
    {children}
  </span>
);
