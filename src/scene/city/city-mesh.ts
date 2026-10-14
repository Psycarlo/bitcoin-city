import {
  Box3,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Ray,
  Sphere,
  Vector3,
} from "three";
import type { Intersection, Raycaster } from "three";

import type { TxSummary } from "@/data/types";
import { clamp } from "@/lib/collections";
import { COINBASE_COLOUR, feeColour } from "@/lib/fees";

import { createBuildingGeometry } from "../geometry";
import { PLOT } from "../layout";
import { EMPTY, GridPacker, packSquares } from "./packer";

/** Width of the ground the buildings stand on (a border is left around them). */
export const CITY_WIDTH = PLOT - 32;
const HALF = CITY_WIDTH / 2;
/** Footprint of a cell in vbytes: a full block (1 MvB) fills 80 × 80 cells. */
const VSIZE_PER_CELL = 156.25;
/** Share of the grid the buildings fill when planned (the rest eases packing). */
const FILL = 0.88;
/** Smallest grid side, so near-empty blocks keep buildings of a usual size. */
const MIN_GRID = 80;
/** Room between neighbours, as a share of a cell. */
const STREET = 0.22;
const BASE_HEIGHT = 4;
const RATE_HEIGHT = 1.5;
const WIDTH_HEIGHT = 0.35;
/** Height of the coinbase transaction: the miner's tower. */
const COINBASE_HEIGHT = 84;
/** Side of the miner's tower, in cells, whatever its size: a landmark. */
const COINBASE_SIDE = 3;
/** No building is taller (for picking). */
export const MAX_HEIGHT = 120;
/** Lowest drawn height (a flat box would have no normals). */
const FLOOR = 0.05;
/** How fast buildings rise, sink and move (per second). */
const SPEED = 5;
/** A frame longer than this (s) is taken as this, after the tab slept. */
const MAX_STEP = 0.1;
/** Spread of the first rise across the city, north to south (s). */
const WAVE = 1.1;
/** Spread of the rise of buildings that come later, and of sinking ones (s). */
const JITTER = 0.35;
/** Close enough to the goal to stop there. */
const SNAP = 0.02;
const CAPACITY_STEP = 1024;
const MATRIX = 16;
const RGB = 3;

/** Shared by every city. */
const GEOMETRY = createBuildingGeometry();
const MATERIAL = new MeshLambertMaterial({ vertexColors: true });

const colours = new Map<string, Color>();
const colourOf = (hex: string) => {
  let colour = colours.get(hex);
  if (!colour) {
    colour = new Color(hex);
    colours.set(hex, colour);
  }
  return colour;
};

/** Side of a transaction's building, in cells. */
export const sideOf = (vsize: number) =>
  Math.max(1, Math.round(Math.sqrt(vsize / VSIZE_PER_CELL)));

/** Side of a transaction's building in the city, the coinbase's widened. */
const footprintOf = (tx: TxSummary) =>
  tx.coinbase ? Math.max(COINBASE_SIDE, sideOf(tx.vsize)) : sideOf(tx.vsize);

/** Height of a building: higher fee rates climb higher. */
export const heightOf = (rate: number, width: number) =>
  BASE_HEIGHT * (1 + RATE_HEIGHT * Math.log2(1 + Math.max(0, rate))) +
  WIDTH_HEIGHT * width;

/** The coinbase first, then by fee rate, highest first (as a miner would). */
const byPriority = (a: TxSummary, b: TxSummary) =>
  Number(b.coinbase ?? false) - Number(a.coinbase ?? false) ||
  b.rate - a.rate ||
  b.vsize - a.vsize;

const approach = (from: number, to: number, step: number) => {
  const next = from + (to - from) * step;
  return Math.abs(to - next) < SNAP ? to : next;
};

const grown = <T extends Float32Array | Int32Array | Uint8Array>(
  array: T,
  length: number
): T => {
  const next = new (array.constructor as new (length: number) => T)(length);
  next.set(array);
  return next;
};

// Scratch values for picking.
const inverse = new Matrix4();
const localRay = new Ray();
const bounds = new Box3();
const building = new Box3();
const entry = new Vector3();
const hit = new Vector3();

/** A walk through the grid's cells along a ray, nearest first (Amanatides–Woo). */
interface GridWalk {
  /** Distance along the ray across one cell, on each axis. */
  acrossColumn: number;
  acrossRow: number;
  column: number;
  /** Distance along the ray to where it entered the current cell. */
  distance: number;
  /** Distance along the ray to the next cell border, on each axis. */
  nextColumn: number;
  nextRow: number;
  row: number;
  stepColumn: number;
  stepRow: number;
}

/** Distance along the ray across a cell on an axis: never, if it runs along it. */
const acrossCell = (cell: number, direction: number) =>
  direction === 0 ? Number.POSITIVE_INFINITY : Math.abs(cell / direction);

/** Distance along the ray to the first cell border on an axis, from `at` (in cells). */
const toBorder = (
  at: number,
  index: number,
  direction: number,
  across: number
) => {
  if (direction === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (direction > 0 ? index + 1 - at : at - index) * across;
};

/** Starts a walk where the ray enters the grid (`start`, local space). */
const startWalk = (ray: Ray, start: Vector3, size: number): GridWalk => {
  const cell = CITY_WIDTH / size;
  const { direction, origin } = ray;
  const u = (start.x + HALF) / cell;
  const v = (start.z + HALF) / cell;
  const column = clamp(Math.floor(u), 0, size - 1);
  const row = clamp(Math.floor(v), 0, size - 1);
  const acrossColumn = acrossCell(cell, direction.x);
  const acrossRow = acrossCell(cell, direction.z);
  const distance = origin.distanceTo(start);
  return {
    acrossColumn,
    acrossRow,
    column,
    distance,
    nextColumn: distance + toBorder(u, column, direction.x, acrossColumn),
    nextRow: distance + toBorder(v, row, direction.z, acrossRow),
    row,
    stepColumn: direction.x > 0 ? 1 : -1,
    stepRow: direction.z > 0 ? 1 : -1,
  };
};

/** Moves the walk into the next cell the ray crosses. */
const stepWalk = (walk: GridWalk) => {
  if (walk.nextColumn < walk.nextRow) {
    walk.column += walk.stepColumn;
    walk.distance = walk.nextColumn;
    walk.nextColumn += walk.acrossColumn;
  } else {
    walk.row += walk.stepRow;
    walk.distance = walk.nextRow;
    walk.nextRow += walk.acrossRow;
  }
};

const inGrid = ({ column, row }: GridWalk, size: number) =>
  column >= 0 && column < size && row >= 0 && row < size;

/**
 * A block as a city: one building per transaction, its footprint by size,
 * its height and colour by fee rate, all in a single draw call. Buildings
 * rise when transactions come, sink when they go and move when the city is
 * planned anew; picking finds the building under the pointer through the
 * grid rather than testing each one.
 */
export class CityMesh extends InstancedMesh {
  private capacity = 0;
  /** Where each building is (x, z: its centre; w: its width; h: its height)… */
  private xs = new Float32Array(0);
  private zs = new Float32Array(0);
  private ws = new Float32Array(0);
  private hs = new Float32Array(0);
  /** …and where it is going. */
  private goalXs = new Float32Array(0);
  private goalZs = new Float32Array(0);
  private goalWs = new Float32Array(0);
  private goalHs = new Float32Array(0);
  /** Time left before it starts moving (s). */
  private waits = new Float32Array(0);
  /** Its top-left cell in the grid, `EMPTY` once it is going. */
  private cells = new Int32Array(0);
  private sides = new Int32Array(0);
  private dying = new Uint8Array(0);
  private txs: TxSummary[] = [];
  /** Building of each transaction on show (not those sinking). */
  private readonly lookup = new Map<string, number>();
  private packer = new GridPacker(MIN_GRID);
  private moving = false;

  constructor() {
    super(GEOMETRY, MATERIAL, CAPACITY_STEP);
    this.instanceMatrix.setUsage(DynamicDrawUsage);
    this.instanceColor = new InstancedBufferAttribute(
      new Float32Array(CAPACITY_STEP * RGB),
      RGB
    ).setUsage(DynamicDrawUsage);
    this.allocate(CAPACITY_STEP);
    this.count = 0;
    this.castShadow = true;
    this.receiveShadow = true;
    // Fixed, so it is never measured from thousands of buildings.
    this.boundingSphere = new Sphere(
      new Vector3(0, MAX_HEIGHT / 2, 0),
      Math.hypot(HALF * Math.SQRT2, MAX_HEIGHT / 2)
    );
  }

  /** Transactions on show. */
  get size() {
    return this.lookup.size;
  }

  /** The transaction of a building, unless it is on its way out. */
  txAt(instance: number) {
    return this.dying[instance] ? undefined : this.txs[instance];
  }

  /** A transaction on show, by txid. */
  find(txid: string) {
    const instance = this.lookup.get(txid);
    return instance === undefined ? undefined : this.txs[instance];
  }

  /**
   * Shows these transactions. The first time (or after the city emptied)
   * the city is planned and rises in a wave; later, new transactions rise
   * where there is room, gone ones sink and the others stay, unless the
   * city has to be planned anew (it is full, or the block's own list came
   * in with its coinbase).
   */
  setTxs(txs: readonly TxSummary[]) {
    if (this.lookup.size === 0) {
      this.plan(txs, true);
      return;
    }
    const wanted = new Map<string, TxSummary>();
    for (const tx of txs) {
      wanted.set(tx.txid, tx);
    }
    const added: TxSummary[] = [];
    for (const tx of wanted.values()) {
      const instance = this.lookup.get(tx.txid);
      if (instance === undefined) {
        added.push(tx);
      } else {
        this.restyle(instance, tx);
      }
    }
    if (added.some((tx) => tx.coinbase)) {
      this.plan(txs, false);
      return;
    }
    for (const [txid, instance] of this.lookup) {
      if (!wanted.has(txid)) {
        this.retire(instance);
      }
    }
    for (const tx of added.toSorted(byPriority)) {
      if (!this.spawn(tx)) {
        this.plan(txs, false);
        return;
      }
    }
    this.changed();
  }

  /**
   * Moves the buildings a step (call every frame). Returns whether anything
   * moved, which needs the shadows drawn again.
   */
  update(delta: number) {
    if (!this.moving) {
      return false;
    }
    const step = 1 - Math.exp(-SPEED * Math.min(delta, MAX_STEP));
    let moving = false;
    // Backwards, as a building that sank swaps with the last one.
    for (let instance = this.count - 1; instance >= 0; instance -= 1) {
      if (this.waits[instance] > 0) {
        this.waits[instance] -= delta;
        moving = true;
        continue;
      }
      this.xs[instance] = approach(
        this.xs[instance],
        this.goalXs[instance],
        step
      );
      this.zs[instance] = approach(
        this.zs[instance],
        this.goalZs[instance],
        step
      );
      this.ws[instance] = approach(
        this.ws[instance],
        this.goalWs[instance],
        step
      );
      this.hs[instance] = approach(
        this.hs[instance],
        this.goalHs[instance],
        step
      );
      if (this.dying[instance] && this.hs[instance] <= FLOOR) {
        this.release(instance);
        continue;
      }
      moving ||=
        this.xs[instance] !== this.goalXs[instance] ||
        this.zs[instance] !== this.goalZs[instance] ||
        this.ws[instance] !== this.goalWs[instance] ||
        this.hs[instance] !== this.goalHs[instance];
      this.writeMatrix(instance);
    }
    this.uploadMatrices();
    this.moving = moving;
    return true;
  }

  /** Fills `into` with a transaction's building, in the world; tells whether it is on show. */
  locate(txid: string, into: Box3) {
    const instance = this.lookup.get(txid);
    if (instance === undefined || !this.parent) {
      return false;
    }
    const half = this.ws[instance] / 2;
    const x = this.xs[instance];
    const z = this.zs[instance];
    into.min.set(x - half, 0, z - half);
    into.max.set(x + half, Math.max(this.hs[instance], 1), z + half);
    this.updateWorldMatrix(true, false);
    into.applyMatrix4(this.matrixWorld);
    return true;
  }

  /**
   * Finds the building under the ray by walking the grid cells it crosses,
   * nearest first, testing only the buildings that own them.
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]) {
    if (this.lookup.size === 0) {
      return;
    }
    inverse.copy(this.matrixWorld).invert();
    const ray = localRay.copy(raycaster.ray).applyMatrix4(inverse);
    bounds.min.set(-HALF, 0, -HALF);
    bounds.max.set(HALF, MAX_HEIGHT, HALF);
    if (!ray.intersectBox(bounds, entry)) {
      return;
    }
    const { distance, instance } = this.nearestHit(ray, entry);
    if (instance < 0) {
      return;
    }
    const point = hit
      .copy(ray.direction)
      .multiplyScalar(distance)
      .add(ray.origin)
      .applyMatrix4(this.matrixWorld)
      .clone();
    const reach = raycaster.ray.origin.distanceTo(point);
    if (reach < raycaster.near || reach > raycaster.far) {
      return;
    }
    intersects.push({
      distance: reach,
      instanceId: instance,
      object: this,
      point,
    });
  }

  /** The nearest building the ray hits (local space), from where it enters the grid. */
  private nearestHit(ray: Ray, start: Vector3) {
    const { owners, size } = this.packer;
    const walk = startWalk(ray, start, size);
    const { direction, origin } = ray;
    // Past the ground, nothing more can be hit.
    const ground =
      direction.y < 0 ? -origin.y / direction.y : Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    let found = -1;
    let tested = EMPTY;
    while (
      inGrid(walk, size) &&
      walk.distance < best &&
      walk.distance <= ground
    ) {
      const owner = owners[walk.row * size + walk.column] ?? EMPTY;
      if (owner !== EMPTY && owner !== tested) {
        tested = owner;
        const reach = this.hitDistance(owner, ray);
        if (reach < best) {
          best = reach;
          found = owner;
        }
      }
      stepWalk(walk);
    }
    return { distance: best, instance: found };
  }

  private hitDistance(instance: number, ray: Ray) {
    const half = this.ws[instance] / 2;
    const x = this.xs[instance];
    const z = this.zs[instance];
    building.min.set(x - half, 0, z - half);
    building.max.set(x + half, this.hs[instance], z + half);
    return ray.intersectBox(building, hit)
      ? ray.origin.distanceTo(hit)
      : Number.POSITIVE_INFINITY;
  }

  /** Plans the whole city anew, by priority: buildings on show move to their new place. */
  private plan(list: readonly TxSummary[], rise: boolean) {
    const txs = list.toSorted(byPriority);
    const wanted = new Set(txs.map((tx) => tx.txid));
    for (const [txid, instance] of this.lookup) {
      if (!wanted.has(txid)) {
        this.retire(instance);
      }
    }
    const fresh = new Set<number>();
    const instances = txs.map((tx) => {
      const known = this.lookup.get(tx.txid);
      if (known !== undefined) {
        this.txs[known] = tx;
        return known;
      }
      const created = this.create(tx);
      fresh.add(created);
      return created;
    });
    const sides = txs.map(footprintOf);
    const { cells, packer } = packSquares(sides, {
      fill: FILL,
      minSize: MIN_GRID,
      owners: instances,
    });
    this.packer = packer;
    for (const [order, instance] of instances.entries()) {
      this.cells[instance] = cells[order] ?? 0;
      this.sides[instance] = sides[order] ?? 1;
      this.aim(instance);
      if (fresh.has(instance)) {
        this.startAtGoal(instance);
        const row = Math.floor(this.cells[instance] / packer.size);
        this.waits[instance] = rise
          ? (row / packer.size) * WAVE + Math.random() * 0.15
          : Math.random() * JITTER;
      }
    }
    this.changed();
  }

  /** Adds a building where there is room; false if there is none. */
  private spawn(tx: TxSummary) {
    const side = footprintOf(tx);
    const cell = this.packer.find(side);
    if (cell < 0) {
      return false;
    }
    const instance = this.create(tx);
    this.packer.fill(cell, side, instance);
    this.cells[instance] = cell;
    this.sides[instance] = side;
    this.aim(instance);
    this.startAtGoal(instance);
    this.waits[instance] = Math.random() * JITTER;
    return true;
  }

  /** A new building, flat on the ground until it is placed. */
  private create(tx: TxSummary) {
    const instance = this.count;
    this.reserve(instance + 1);
    this.count = instance + 1;
    this.txs[instance] = tx;
    this.lookup.set(tx.txid, instance);
    this.dying[instance] = 0;
    this.waits[instance] = 0;
    this.cells[instance] = EMPTY;
    return instance;
  }

  private startAtGoal(instance: number) {
    this.xs[instance] = this.goalXs[instance];
    this.zs[instance] = this.goalZs[instance];
    this.ws[instance] = this.goalWs[instance];
    this.hs[instance] = FLOOR;
    this.writeMatrix(instance);
  }

  /** Sets where a building goes from its cells, and its height and colour from its transaction. */
  private aim(instance: number) {
    const { size } = this.packer;
    const cell = CITY_WIDTH / size;
    const side = this.sides[instance];
    const top = this.cells[instance];
    const row = Math.floor(top / size);
    const column = top % size;
    const width = side * cell - STREET * cell;
    this.goalXs[instance] = -HALF + (column + side / 2) * cell;
    this.goalZs[instance] = -HALF + (row + side / 2) * cell;
    this.goalWs[instance] = width;
    this.restyle(instance, this.txs[instance]);
  }

  /** Height and colour of a building, for its transaction's fee rate (which may change). */
  private restyle(instance: number, tx: TxSummary | undefined) {
    if (!tx) {
      return;
    }
    this.txs[instance] = tx;
    this.goalHs[instance] = tx.coinbase
      ? COINBASE_HEIGHT
      : heightOf(tx.rate, this.goalWs[instance]);
    const colour = colourOf(tx.coinbase ? COINBASE_COLOUR : feeColour(tx.rate));
    this.instanceColor?.setXYZ(instance, colour.r, colour.g, colour.b);
  }

  /** Lets a building sink; it goes once it is down, its cells free at once. */
  private retire(instance: number) {
    const tx = this.txs[instance];
    if (tx && this.lookup.get(tx.txid) === instance) {
      this.lookup.delete(tx.txid);
    }
    if (this.cells[instance] !== EMPTY) {
      this.packer.release(this.cells[instance], this.sides[instance]);
      this.cells[instance] = EMPTY;
    }
    this.dying[instance] = 1;
    this.goalHs[instance] = 0;
    this.waits[instance] = Math.random() * JITTER;
  }

  /** Drops a building, the last one taking its place. */
  private release(instance: number) {
    const last = this.count - 1;
    if (instance !== last) {
      for (const array of [
        this.xs,
        this.zs,
        this.ws,
        this.hs,
        this.goalXs,
        this.goalZs,
        this.goalWs,
        this.goalHs,
        this.waits,
        this.cells,
        this.sides,
        this.dying,
      ]) {
        array[instance] = array[last] ?? 0;
      }
      const moved = this.txs[last];
      if (moved) {
        this.txs[instance] = moved;
        if (this.lookup.get(moved.txid) === last) {
          this.lookup.set(moved.txid, instance);
        }
      }
      if (this.cells[instance] !== EMPTY) {
        this.packer.fill(this.cells[instance], this.sides[instance], instance);
      }
      const matrices = this.instanceMatrix.array;
      matrices.copyWithin(
        instance * MATRIX,
        last * MATRIX,
        (last + 1) * MATRIX
      );
      const tints = this.instanceColor?.array;
      tints?.copyWithin(instance * RGB, last * RGB, (last + 1) * RGB);
    }
    this.txs.length = last;
    this.count = last;
    if (this.instanceColor) {
      this.instanceColor.needsUpdate = true;
    }
  }

  private writeMatrix(instance: number) {
    const matrices = this.instanceMatrix.array;
    const offset = instance * MATRIX;
    const width = this.ws[instance];
    matrices.fill(0, offset, offset + MATRIX);
    matrices[offset] = width;
    matrices[offset + 5] = Math.max(FLOOR, this.hs[instance]);
    matrices[offset + 10] = width;
    matrices[offset + 12] = this.xs[instance];
    matrices[offset + 14] = this.zs[instance];
    matrices[offset + 15] = 1;
  }

  /** Sends only the buildings in use to the GPU. */
  private uploadMatrices() {
    const { instanceMatrix } = this;
    instanceMatrix.clearUpdateRanges();
    instanceMatrix.addUpdateRange(0, Math.max(1, this.count) * MATRIX);
    instanceMatrix.needsUpdate = true;
  }

  private changed() {
    for (let instance = 0; instance < this.count; instance += 1) {
      this.writeMatrix(instance);
    }
    this.uploadMatrices();
    if (this.instanceColor) {
      this.instanceColor.needsUpdate = true;
    }
    this.moving = true;
  }

  /** Makes room for `needed` buildings, in steps, keeping those there. */
  private reserve(needed: number) {
    if (needed <= this.capacity) {
      return;
    }
    const capacity =
      Math.ceil((needed * 1.25 + 256) / CAPACITY_STEP) * CAPACITY_STEP;
    this.allocate(capacity);
  }

  private allocate(capacity: number) {
    for (const key of [
      "xs",
      "zs",
      "ws",
      "hs",
      "goalXs",
      "goalZs",
      "goalWs",
      "goalHs",
      "waits",
    ] as const) {
      this[key] = grown(this[key], capacity);
    }
    this.cells = grown(this.cells, capacity);
    this.sides = grown(this.sides, capacity);
    this.dying = grown(this.dying, capacity);
    if (capacity > this.instanceMatrix.count) {
      const matrices = new InstancedBufferAttribute(
        new Float32Array(capacity * MATRIX),
        MATRIX
      ).setUsage(DynamicDrawUsage);
      matrices.array.set(this.instanceMatrix.array);
      const tints = new InstancedBufferAttribute(
        new Float32Array(capacity * RGB),
        RGB
      ).setUsage(DynamicDrawUsage);
      if (this.instanceColor) {
        tints.array.set(this.instanceColor.array);
      }
      // Frees the GPU buffers of the old attributes; new ones are made on the next draw.
      this.dispose();
      this.instanceMatrix = matrices;
      this.instanceColor = tints;
    }
    this.capacity = capacity;
  }
}
