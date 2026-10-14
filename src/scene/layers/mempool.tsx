import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { BufferGeometry, InstancedMesh, Mesh } from "three";

import type { ProjectedBlock } from "@/data/types";
import { BLOCK_VSIZE } from "@/lib/bitcoin";
import { clamp } from "@/lib/collections";
import { feeColour } from "@/lib/fees";
import { formatFeeRate, formatNumber } from "@/lib/format";
import { projectedKey } from "@/lib/scene-key";
import { useChainStore } from "@/stores/chain-store";

import {
  PAD_TOP,
  pathPoint,
  PLOT,
  PROJECTED_SHOWN,
  projectedSlot,
  QUEUE_SLOT,
} from "../layout";
import { usePalette } from "../palette";
import { registerLocator } from "../positions";
import { invalidateShadows } from "../shadows";
import { useDisposable } from "../use-disposable";
import { LabelNote, PlotLabel, PlotPad } from "./plot";
import { plotBox, useHighlight, usePlotHandlers } from "./plot-state";

/** A block the mempool would fill later, as a see-through blueprint. */
const GHOST_WIDTH = PLOT * 0.84;
const GHOST_MIN_HEIGHT = 12;
const GHOST_HEIGHT_RANGE = 60;
/** Bands of the ghost's fee gradient, from its lowest rate (bottom) to its highest. */
const BANDS = 6;
const GHOST_OPACITY = 0.5;
/** How fast a ghost grows or shrinks to its fill (per second). */
const GROWTH = 4;
const LOWEST_RATE = 0.1;
const LABEL_GAP = 16;

/** The rest of the queue, stacked like pallets: one slab per block's worth (or share of it). */
const SLAB_WIDTH = PLOT * 0.7;
const SLAB_HEIGHT = 10;
const SLAB_GAP = 4;
const MAX_SLABS = 10;
/** Slabs lie a little askew, as stacked by hand (radians). */
const SLAB_SKEW = 0.06;

const GHOST_MATERIAL = new MeshLambertMaterial({
  depthWrite: false,
  opacity: GHOST_OPACITY,
  transparent: true,
  vertexColors: true,
});

const QUEUE_KEY = projectedKey(PROJECTED_SHOWN + 1);

const scratch = new Color();

/** Fee rate at a share of the way up a block's fee range, blended on a log scale. */
const rateAt = (range: readonly number[], share: number) => {
  if (range.length === 0) {
    return LOWEST_RATE;
  }
  const at = clamp(share, 0, 1) * (range.length - 1);
  const below = Math.floor(at);
  const low = Math.log(Math.max(LOWEST_RATE, range[below] ?? LOWEST_RATE));
  const high = Math.log(
    Math.max(
      LOWEST_RATE,
      range[Math.min(below + 1, range.length - 1)] ?? LOWEST_RATE
    )
  );
  return Math.exp(low + (high - low) * (at - below));
};

/** A unit box on the origin, in bands up its sides, with a colour per vertex. */
const createGhostGeometry = () => {
  const geometry = new BoxGeometry(1, 1, 1, 1, BANDS, 1);
  geometry.translate(0, 0.5, 0);
  const vertices = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "color",
    new Float32BufferAttribute(new Float32Array(vertices * 3), 3)
  );
  return geometry;
};

/** Colours a ghost by its fee range, cheapest at the bottom. */
const paintGhost = (geometry: BufferGeometry, range: readonly number[]) => {
  const positions = geometry.getAttribute("position");
  const colours = geometry.getAttribute("color");
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    scratch.set(feeColour(rateAt(range, positions.getY(vertex))));
    colours.setXYZ(vertex, scratch.r, scratch.g, scratch.b);
  }
  colours.needsUpdate = true;
};

const ghostHeight = (vsize: number) =>
  GHOST_MIN_HEIGHT + GHOST_HEIGHT_RANGE * clamp(vsize / BLOCK_VSIZE, 0.05, 1);

interface GhostPlotProps {
  block: ProjectedBlock | undefined;
  /** Place in the queue (1 is the block after the next one). */
  index: number;
}

/** A block the mempool would fill after the next one, at its place in the queue. */
const GhostPlot = ({ block, index }: GhostPlotProps) => {
  const key = projectedKey(index);
  const slot = projectedSlot(index);
  const position = useMemo(() => pathPoint(slot), [slot]);
  const geometry = useMemo(() => createGhostGeometry(), []);
  useDisposable(geometry);
  const meshRef = useRef<Mesh>(null);
  const heightRef = useRef(0);
  const highlight = useHighlight(key);
  const handlers = usePlotHandlers(key);
  const palette = usePalette();
  const goal = block ? ghostHeight(block.vsize) : 0;

  useLayoutEffect(() => {
    paintGhost(geometry, block?.feeRange ?? []);
  }, [block?.feeRange, geometry]);

  useEffect(
    () =>
      registerLocator((wanted, into) => wanted === key && plotBox(slot, into)),
    [key, slot]
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const height = heightRef.current;
    const next =
      Math.abs(goal - height) < 0.05
        ? goal
        : height +
          (goal - height) * (1 - Math.exp(-GROWTH * Math.min(delta, 0.1)));
    heightRef.current = next;
    mesh.visible = next > 0.5;
    mesh.scale.set(GHOST_WIDTH, Math.max(next, 0.5), GHOST_WIDTH);
  });

  const minutes = (index + 1) * 10;
  return (
    <group position={position} {...handlers}>
      <PlotPad highlight={highlight} />
      <group position-y={PAD_TOP}>
        <mesh
          geometry={geometry}
          material={GHOST_MATERIAL}
          ref={meshRef}
          renderOrder={1}
        >
          <Edges color={palette.projectedEdge} threshold={15} />
        </mesh>
        <PlotLabel
          colour={block ? feeColour(block.medianFee) : undefined}
          height={GHOST_MIN_HEIGHT + GHOST_HEIGHT_RANGE + LABEL_GAP}
          highlight={highlight}
          priority={40 - index}
          sceneKey={key}
        >
          In ~{minutes} min
          <LabelNote selected={highlight === "selected"}>
            {block ? `~${formatFeeRate(block.medianFee)}` : "Empty"}
          </LabelNote>
        </PlotLabel>
      </group>
    </group>
  );
};

/** Colour of each slab of the queue, its top one first in line. */
const slabColours = (queue: readonly ProjectedBlock[]) => {
  const total = queue.reduce((sum, block) => sum + block.vsize, 0);
  const slabs = Math.min(MAX_SLABS, Math.ceil(total / BLOCK_VSIZE));
  const share = total / Math.max(1, slabs);
  const colours: string[] = [];
  let entry = 0;
  let passed = 0;
  // From the front of the queue (the top of the stack) down.
  for (let slab = 0; slab < slabs; slab += 1) {
    const middle = (slab + 0.5) * share;
    while (
      entry < queue.length - 1 &&
      passed + (queue[entry]?.vsize ?? 0) < middle
    ) {
      passed += queue[entry]?.vsize ?? 0;
      entry += 1;
    }
    colours.push(feeColour(queue[entry]?.medianFee ?? LOWEST_RATE));
  }
  return { colours, total };
};

const SLAB = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const SLAB_MATERIAL = new MeshLambertMaterial();

/** What the mempool holds beyond the blocks shown, waiting at the back of the queue. */
const QueuePlot = ({ queue }: { queue: readonly ProjectedBlock[] }) => {
  const position = useMemo(() => pathPoint(QUEUE_SLOT), []);
  const meshRef = useRef<InstancedMesh>(null);
  const highlight = useHighlight(QUEUE_KEY);
  const handlers = usePlotHandlers(QUEUE_KEY);
  const { colours, total } = useMemo(() => slabColours(queue), [queue]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const matrix = new Matrix4();
    const turn = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const where = new Vector3();
    const size = new Vector3(SLAB_WIDTH, SLAB_HEIGHT, SLAB_WIDTH);
    const slabs = colours.length;
    for (const [order, colour] of colours.entries()) {
      // The front of the queue is on top.
      const level = slabs - 1 - order;
      turn.setFromAxisAngle(up, Math.sin(level * 2.3) * SLAB_SKEW);
      where.set(0, level * (SLAB_HEIGHT + SLAB_GAP), 0);
      mesh.setMatrixAt(order, matrix.compose(where, turn, size));
      mesh.setColorAt(order, scratch.set(colour));
    }
    mesh.count = slabs;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
    invalidateShadows();
  }, [colours]);

  useEffect(
    () =>
      registerLocator(
        (wanted, into) =>
          wanted.startsWith("projected:") &&
          Number(wanted.slice("projected:".length)) > PROJECTED_SHOWN &&
          plotBox(QUEUE_SLOT, into)
      ),
    []
  );

  const blocks = Math.ceil(total / BLOCK_VSIZE);
  const top = colours.length * (SLAB_HEIGHT + SLAB_GAP);
  return (
    <group position={position} {...handlers}>
      <PlotPad highlight={highlight} />
      <group position-y={PAD_TOP}>
        <instancedMesh
          args={[SLAB, SLAB_MATERIAL, MAX_SLABS]}
          castShadow
          receiveShadow
          ref={meshRef}
        />
        <PlotLabel
          colour={colours[0]}
          height={Math.max(top, SLAB_HEIGHT) + LABEL_GAP}
          highlight={highlight}
          priority={40 - PROJECTED_SHOWN - 1}
          sceneKey={QUEUE_KEY}
        >
          {blocks > 0 ? "Backlog" : "Backlog empty"}
          {blocks > 0 ? (
            <LabelNote selected={highlight === "selected"}>
              {formatNumber(blocks)} {blocks === 1 ? "block" : "blocks"}
            </LabelNote>
          ) : null}
        </PlotLabel>
      </group>
    </group>
  );
};

const GHOSTS = Array.from({ length: PROJECTED_SHOWN }, (_, index) => index + 1);

/** The mempool: the blocks it would fill after the next one, then the rest of its queue. */
export const MempoolLayer = () => {
  const projected = useChainStore((state) => state.projected);
  const queue = useMemo(
    () => projected.slice(PROJECTED_SHOWN + 1),
    [projected]
  );
  return (
    <>
      {GHOSTS.map((index) => (
        <GhostPlot block={projected[index]} index={index} key={index} />
      ))}
      <QueuePlot queue={queue} />
    </>
  );
};
