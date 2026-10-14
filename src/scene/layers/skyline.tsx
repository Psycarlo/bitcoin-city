import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { Group, InstancedMesh } from "three";

import type { Candle } from "@/data/types";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrice, usePriceStore } from "@/stores/price-store";
import { useViewStore } from "@/stores/view-store";

import { COVERED_CLASSES, declutterRef } from "../declutter";
import { roundedSlab } from "../geometry";
import { SceneHtml } from "../html-layer";
import { PAD_TOP, TERRACE } from "../layout";
import { onPalette, paint, track } from "../paint";
import { usePalette } from "../palette";

/**
 * The price, as a skyline behind the chain: one tower per candle, newest on
 * the right, its crown spanning the open and close (green up, red down) and
 * its mast the high and low. A dashed line marks the latest trade. Towers
 * ease to each trade, slide west as a candle opens and the new one rises.
 */
const COUNT = 60;
/** Room at the west end for the pair's sign, and at the east for the price. */
const WEST = -TERRACE.width / 2 + 70;
const EAST = TERRACE.width / 2 - 190;
const PITCH = (EAST - WEST) / COUNT;
const TOWER = PITCH * 0.64;
const MAST = 2.5;
/** Heights of the lowest and highest prices on show. */
const LOW_Y = 40;
const HIGH_Y = 360;
/** Room left above and below the prices on show, as a share of their range. */
const RANGE_PAD = 0.06;
/** How fast the scale follows the prices (per second). */
const RESCALE = 3;
/**
 * How fast the towers and the price line follow the trades, slide west as a
 * candle opens, and a new tower rises (per second).
 */
const FOLLOW = 8;
/** Close enough to stop easing: a slide (units) and a rise (share). */
const SLIDE_SNAP = 0.05;
const RISE_SNAP = 0.001;
const MAX_STEP = 0.1;
const SMALLEST_BODY = 1.5;
const LINE_DASH = { gap: 8, size: 12 } as const;
const HTML_Z: [number, number] = [30, 20];
/**
 * Which sign gives way when it would sit on a label (see `declutterRef`): the
 * price only to the next and newest blocks' (or one pointed at or picked),
 * the pair's name to all of them.
 */
const PRICE_PRIORITY = 60;
const PAIR_PRIORITY = 10;

const TERRACE_SLAB = roundedSlab(TERRACE.width, TERRACE.depth, 48, PAD_TOP);
const TERRACE_MATERIALS = [
  paint(new MeshLambertMaterial(), "terrace"),
  paint(new MeshLambertMaterial(), "padSide"),
];

const UNIT = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const STEM_MATERIAL = paint(new MeshLambertMaterial(), "candleStem");
const CROWN_MATERIAL = new MeshLambertMaterial();
const UP = track(new Color(), "candleUp");
const DOWN = track(new Color(), "candleDown");

const matrix = new Matrix4();
const where = new Vector3();
const size = new Vector3();
const upright = new Quaternion();
const reducedMotion = globalThis.matchMedia?.(
  "(prefers-reduced-motion: reduce)"
);

/** The raised strip the skyline stands on, behind the oldest blocks. */
export const Terrace = () => (
  <mesh
    geometry={TERRACE_SLAB}
    material={TERRACE_MATERIALS}
    position={[0, PAD_TOP, TERRACE.centreZ]}
    receiveShadow
  />
);

const rangeOf = (candles: readonly Candle[]) => {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    low = Math.min(low, candle.low);
    high = Math.max(high, candle.high);
  }
  const pad = Math.max(high - low, high * 0.0005) * RANGE_PAD;
  return { high: high + pad, low: low - pad };
};

const approach = (from: number, to: number, step: number, snap: number) => {
  const next = from + (to - from) * step;
  return Math.abs(to - next) < snap ? to : next;
};

/** What a tower shows: its candle's prices as they ease in, and how far it has risen. */
interface Tower {
  close: number;
  high: number;
  low: number;
  open: number;
  /** 0 when its candle just opened, 1 once it stands. */
  rise: number;
  time: number;
}

interface Scale {
  candles?: readonly Candle[];
  high: number;
  low: number;
  /** Where the scale is going. */
  goalHigh: number;
  goalLow: number;
  /** How far east of their places the towers stand (units), as a candle opens. */
  slide: number;
  /** The towers need placing again. */
  stale: boolean;
  /** The towers as drawn, oldest first, one per candle on show. */
  towers: Tower[];
}

const towerOf = (candle: Candle, rise: number): Tower => ({
  close: candle.close,
  high: candle.high,
  low: candle.low,
  open: candle.open,
  rise,
  time: candle.time,
});

/**
 * Carries the towers over to the candles now on show. Within an interval
 * they keep what they show and slide west as a candle opens, the new one
 * rising beside them; on another interval each tower turns into the one now
 * in its place. The first candles stand at once.
 */
const realign = (scale: Scale, candles: readonly Candle[]) => {
  const { towers } = scale;
  const newest = towers.at(-1)?.time;
  const place =
    newest === undefined
      ? -1
      : candles.findIndex((candle) => candle.time === newest);
  if (place >= 0) {
    const byTime = new Map(towers.map((tower) => [tower.time, tower]));
    scale.towers = candles.map(
      (candle, index) =>
        byTime.get(candle.time) ?? towerOf(candle, index > place ? 0 : 1)
    );
    scale.slide += (candles.length - 1 - place) * PITCH;
    return;
  }
  // Lined up from the east, where the newest stand.
  const shift = candles.length - towers.length;
  scale.towers = candles.map((candle, index) => {
    const before = towers[index - shift];
    if (before) {
      return { ...before, time: candle.time };
    }
    return towerOf(candle, towers.length > 0 ? 0 : 1);
  });
};

/** Eases a tower towards its candle; whether it moved. */
const easeTower = (
  tower: Tower,
  candle: Candle,
  step: number,
  snap: number
) => {
  const { close, high, low, open, rise } = tower;
  tower.open = approach(open, candle.open, step, snap);
  tower.close = approach(close, candle.close, step, snap);
  tower.high = approach(high, candle.high, step, snap);
  tower.low = approach(low, candle.low, step, snap);
  tower.rise = approach(rise, 1, step, RISE_SNAP);
  return (
    tower.open !== open ||
    tower.close !== close ||
    tower.high !== high ||
    tower.low !== low ||
    tower.rise !== rise
  );
};

/** Picks up new candles: the scale sets off for their range, the towers line up with them. */
const takeCandles = (scale: Scale, all: readonly Candle[] | undefined) => {
  if (all === scale.candles) {
    return;
  }
  const fresh = scale.candles === undefined;
  scale.candles = all;
  scale.stale = true;
  const candles = all?.slice(-COUNT) ?? [];
  realign(scale, candles);
  if (candles.length === 0) {
    return;
  }
  const range = rangeOf(candles);
  scale.goalHigh = range.high;
  scale.goalLow = range.low;
  if (fresh) {
    scale.high = range.high;
    scale.low = range.low;
  }
};

/** Eases the scale, the slide and each tower a frame on; whether anything moved. */
const ease = (scale: Scale, rescale: number, follow: number) => {
  const snap = (scale.goalHigh - scale.goalLow) * 0.0005;
  const { high, low, slide, towers } = scale;
  scale.low = approach(low, scale.goalLow, rescale, snap);
  scale.high = approach(high, scale.goalHigh, rescale, snap);
  scale.slide = approach(slide, 0, follow, SLIDE_SNAP);
  let moved = scale.low !== low || scale.high !== high || scale.slide !== slide;
  const all = scale.candles ?? [];
  const offset = all.length - towers.length;
  for (const [index, tower] of towers.entries()) {
    const candle = all[offset + index];
    if (candle && easeTower(tower, candle, follow, snap)) {
      moved = true;
    }
  }
  return moved;
};

const PriceTag = () => {
  const price = usePrice();
  const trend = usePriceStore((state) => state.trend);
  return (
    <div
      className={cn(
        "bg-card/95 text-foreground ring-foreground/10 flex -translate-y-1/2 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11px] font-semibold whitespace-nowrap tabular-nums shadow-md ring-1 transition-opacity duration-200",
        COVERED_CLASSES
      )}
      data-priority={PRICE_PRIORITY}
      ref={declutterRef}
    >
      <span
        className={cn(
          "ring-card/70 size-2 rounded-full ring-2",
          trend < 0 ? "bg-rose-500" : "bg-emerald-500"
        )}
      />
      {formatUsd(price)}
    </div>
  );
};

const PairSign = () => {
  const interval = useViewStore((state) => state.interval);
  return (
    <div
      className={cn(
        "bg-card/80 text-muted-foreground ring-foreground/5 -translate-x-full -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap shadow-sm ring-1 transition-opacity duration-200",
        COVERED_CLASSES
      )}
      data-priority={PAIR_PRIORITY}
      ref={declutterRef}
    >
      BTC/USDT · {interval}
    </div>
  );
};

/** The candles of the chosen interval, as towers, and the latest price. */
export const Skyline = () => {
  const stemsRef = useRef<InstancedMesh>(null);
  const mastsRef = useRef<InstancedMesh>(null);
  const crownsRef = useRef<InstancedMesh>(null);
  const lineRef = useRef<Group>(null);
  const scaleRef = useRef<Scale>({
    goalHigh: 1,
    goalLow: 0,
    high: 1,
    low: 0,
    slide: 0,
    stale: true,
    towers: [],
  });
  const interval = useViewStore((state) => state.interval);
  const palette = usePalette();
  const linePoints = useMemo(
    () => [new Vector3(WEST - PITCH / 2, 0, 0), new Vector3(EAST + 12, 0, 0)],
    []
  );

  // Instance colours are copies: a new theme paints them again.
  useEffect(
    () =>
      onPalette(() => {
        scaleRef.current.stale = true;
      }),
    []
  );

  useFrame((_, delta) => {
    const stems = stemsRef.current;
    const masts = mastsRef.current;
    const crowns = crownsRef.current;
    const line = lineRef.current;
    if (!stems || !masts || !crowns || !line) {
      return;
    }
    const scale = scaleRef.current;
    takeCandles(scale, usePriceStore.getState().candles[interval]);
    const seconds = Math.min(delta, MAX_STEP);
    const still = reducedMotion?.matches ?? false;
    const moved = ease(
      scale,
      still ? 1 : 1 - Math.exp(-RESCALE * seconds),
      still ? 1 : 1 - Math.exp(-FOLLOW * seconds)
    );
    if (!(moved || scale.stale)) {
      return;
    }
    scale.stale = false;
    const { high, low, slide, towers } = scale;
    const span = Math.max(high - low, Number.EPSILON);
    const yOf = (price: number) =>
      LOW_Y + ((price - low) / span) * (HIGH_Y - LOW_Y);

    const first = COUNT - towers.length;
    for (const [index, tower] of towers.entries()) {
      const x = WEST + (first + index + 0.5) * PITCH + slide;
      const { rise } = tower;
      const bottom = yOf(Math.min(tower.open, tower.close)) * rise;
      const top = Math.max(
        yOf(Math.max(tower.open, tower.close)) * rise,
        bottom + SMALLEST_BODY * rise
      );
      const colour = tower.close >= tower.open ? UP : DOWN;
      stems.setMatrixAt(
        index,
        matrix.compose(
          where.set(x, 0, 0),
          upright,
          size.set(TOWER, Math.max(bottom, 0.1), TOWER)
        )
      );
      crowns.setMatrixAt(
        index,
        matrix.compose(
          where.set(x, bottom, 0),
          upright,
          size.set(TOWER, top - bottom, TOWER)
        )
      );
      crowns.setColorAt(index, colour);
      const mastLow = yOf(tower.low) * rise;
      masts.setMatrixAt(
        index,
        matrix.compose(
          where.set(x, mastLow, 0),
          upright,
          size.set(MAST, Math.max(yOf(tower.high) * rise - mastLow, 0.1), MAST)
        )
      );
      masts.setColorAt(index, colour);
    }
    for (const mesh of [stems, masts, crowns]) {
      mesh.count = towers.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
    // The line keeps to the price, not to a tower still rising.
    const latest = towers.at(-1);
    line.visible = latest !== undefined;
    if (latest) {
      line.position.y = yOf(latest.close);
    }
  });

  return (
    <group position={[0, PAD_TOP, TERRACE.centreZ]}>
      <instancedMesh
        args={[UNIT, STEM_MATERIAL, COUNT]}
        frustumCulled={false}
        receiveShadow
        ref={stemsRef}
      />
      <instancedMesh
        args={[UNIT, CROWN_MATERIAL, COUNT]}
        frustumCulled={false}
        ref={mastsRef}
      />
      <instancedMesh
        args={[UNIT, CROWN_MATERIAL, COUNT]}
        frustumCulled={false}
        ref={crownsRef}
      />
      <group position-z={TOWER} ref={lineRef} visible={false}>
        <Line
          color={palette.selection}
          dashed
          dashSize={LINE_DASH.size}
          gapSize={LINE_DASH.gap}
          lineWidth={1.5}
          points={linePoints}
        />
        <SceneHtml
          pointerEvents="none"
          position-x={EAST + 18}
          zIndexRange={HTML_Z}
        >
          <PriceTag />
        </SceneHtml>
      </group>
      <SceneHtml
        pointerEvents="none"
        position={[WEST - PITCH / 2 - 8, LOW_Y, 0]}
        zIndexRange={HTML_Z}
      >
        <PairSign />
      </SceneHtml>
    </group>
  );
};
