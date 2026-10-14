import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
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
import { paint, track } from "../paint";
import { usePalette } from "../palette";

/**
 * The price, as a skyline behind the chain: one tower per candle, newest on
 * the right, its crown spanning the open and close (green up, red down) and
 * its mast the high and low. A dashed line marks the latest trade.
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

/** The raised strip the skyline stands on, behind the oldest blocks. */
export const Terrace = () => (
  <mesh
    geometry={TERRACE_SLAB}
    material={TERRACE_MATERIALS}
    position={[0, PAD_TOP, TERRACE.centreZ]}
    receiveShadow
  />
);

interface Scale {
  candles?: readonly Candle[];
  high: number;
  low: number;
  /** Where the scale is going. */
  goalHigh: number;
  goalLow: number;
  /** The towers need placing again. */
  stale: boolean;
}

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
    stale: true,
  });
  const interval = useViewStore((state) => state.interval);
  const palette = usePalette();
  const linePoints = useMemo(
    () => [new Vector3(WEST - PITCH / 2, 0, 0), new Vector3(EAST + 12, 0, 0)],
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
    const all = usePriceStore.getState().candles[interval];
    if (all !== scale.candles) {
      const fresh = scale.candles === undefined;
      scale.candles = all;
      scale.stale = true;
      if (all && all.length > 0) {
        const range = rangeOf(all.slice(-COUNT));
        scale.goalHigh = range.high;
        scale.goalLow = range.low;
        if (fresh) {
          scale.high = range.high;
          scale.low = range.low;
        }
      }
    }
    const candles = scale.candles?.slice(-COUNT) ?? [];
    const snap = (scale.goalHigh - scale.goalLow) * 0.0005;
    const step = 1 - Math.exp(-RESCALE * Math.min(delta, MAX_STEP));
    const low = approach(scale.low, scale.goalLow, step, snap);
    const high = approach(scale.high, scale.goalHigh, step, snap);
    if (!scale.stale && low === scale.low && high === scale.high) {
      return;
    }
    scale.low = low;
    scale.high = high;
    scale.stale = false;
    const span = Math.max(high - low, Number.EPSILON);
    const yOf = (price: number) =>
      LOW_Y + ((price - low) / span) * (HIGH_Y - LOW_Y);

    const first = COUNT - candles.length;
    for (const [index, candle] of candles.entries()) {
      const x = WEST + (first + index + 0.5) * PITCH;
      const bottom = yOf(Math.min(candle.open, candle.close));
      const top = Math.max(
        yOf(Math.max(candle.open, candle.close)),
        bottom + SMALLEST_BODY
      );
      const colour = candle.close >= candle.open ? UP : DOWN;
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
      const mastLow = yOf(candle.low);
      masts.setMatrixAt(
        index,
        matrix.compose(
          where.set(x, mastLow, 0),
          upright,
          size.set(MAST, Math.max(yOf(candle.high) - mastLow, 0.1), MAST)
        )
      );
      masts.setColorAt(index, colour);
    }
    for (const mesh of [stems, masts, crowns]) {
      mesh.count = candles.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
    const latest = candles.at(-1);
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
