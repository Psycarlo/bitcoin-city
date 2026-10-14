import { Box3, Vector3 } from "three";

import { COLUMNS, NEXT_SLOT, QUEUE_SLOT, ROWS, SLOTS, TIP_SLOT } from "./slots";

export {
  CITIES_SHOWN,
  COLUMNS,
  CONFIRMED_SHOWN,
  NEXT_SLOT,
  PROJECTED_SHOWN,
  QUEUE_SLOT,
  ROWS,
  SLOTS,
  TIP_SLOT,
} from "./slots";

/**
 * Where everything stands in the world (units are arbitrary; a plot is 400
 * across). x points east, y up and z south, towards the camera at home.
 *
 * Blocks stand on square plots along a path that snakes from the front of
 * the table to the back: the mempool's queue, the blocks it would fill, the
 * next block, then the confirmed blocks, newest first. Behind them all, the
 * price stands as a skyline of candles.
 */

/** Side of a block's plot. */
export const PLOT = 400;
/** Avenue between two plots. */
export const GAP = 56;
/** From one plot's centre to the next. */
export const PITCH = PLOT + GAP;
/** Height of the plots' top above the ground. */
export const PAD_TOP = 8;

/** Half the width (x) and depth (z) of the plots' grid, to their outer edges. */
export const GRID_HALF_X = ((COLUMNS - 1) / 2) * PITCH + PLOT / 2;
export const GRID_HALF_Z = ((ROWS - 1) / 2) * PITCH + PLOT / 2;

const TERRACE_GAP = 80;
const TERRACE_DEPTH = 300;

/** The skyline's terrace, behind the oldest blocks, as wide as the grid. */
export const TERRACE = {
  centreZ: -GRID_HALF_Z - TERRACE_GAP - TERRACE_DEPTH / 2,
  depth: TERRACE_DEPTH,
  width: GRID_HALF_X * 2,
} as const;

/** Highest point of the skyline (its price label included). */
export const SKYLINE_TOP = 420;

/** Border of ground around the grid and the terrace. */
export const MARGIN = 150;

/** The table everything stands on. */
export const TILE = {
  maxX: GRID_HALF_X + MARGIN,
  maxZ: GRID_HALF_Z + MARGIN,
  minX: -GRID_HALF_X - MARGIN,
  minZ: TERRACE.centreZ - TERRACE.depth / 2 - MARGIN,
} as const;

/** Points the home view keeps in sight: the table's corners and the skyline's top. */
export const HOME_POINTS: readonly Vector3[] = [
  new Vector3(TILE.minX, 0, TILE.minZ),
  new Vector3(TILE.maxX, 0, TILE.minZ),
  new Vector3(TILE.minX, 0, TILE.maxZ),
  new Vector3(TILE.maxX, 0, TILE.maxZ),
  new Vector3(-GRID_HALF_X, SKYLINE_TOP, TERRACE.centreZ),
  new Vector3(GRID_HALF_X, SKYLINE_TOP, TERRACE.centreZ),
];

/** Room to roam around the table before the camera is held back. */
const ROAM = 600;

/** Where the camera may look. */
export const CAMERA_BOUNDS = new Box3(
  new Vector3(TILE.minX - ROAM, -ROAM, TILE.minZ - ROAM),
  new Vector3(TILE.maxX + ROAM, ROAM * 2, TILE.maxZ + ROAM)
);

/** Place of a projected block (0 is the next one); those far back share the queue's. */
export const projectedSlot = (index: number) =>
  Math.max(QUEUE_SLOT, NEXT_SLOT - index);

/** Place of a confirmed block (0 is the newest). */
export const confirmedSlot = (index: number) => TIP_SLOT + index;

/** Centre of a whole place, snaking from the front row to the back one. */
const slotCentre = (slot: number, into: Vector3) => {
  const fromFront = Math.floor(slot / COLUMNS);
  const step = slot % COLUMNS;
  const column = fromFront % 2 === 0 ? step : COLUMNS - 1 - step;
  const row = ROWS - 1 - fromFront;
  return into.set(
    (column - (COLUMNS - 1) / 2) * PITCH,
    0,
    (row - (ROWS - 1) / 2) * PITCH
  );
};

const from = new Vector3();
const to = new Vector3();

/**
 * Centre of a place on the path, on the ground. A fraction falls between two
 * places (for blocks moving along) and the path goes on straight past either
 * end.
 */
export const pathPoint = (slot: number, into = new Vector3()) => {
  const base = Math.min(Math.max(Math.floor(slot), 0), SLOTS - 2);
  slotCentre(base, from);
  slotCentre(base + 1, to);
  return into.lerpVectors(from, to, slot - base);
};

/** Way the path goes from a place to the next (a unit vector). */
export const pathDirection = (slot: number, into = new Vector3()) => {
  const base = Math.min(Math.max(Math.floor(slot), 0), SLOTS - 2);
  slotCentre(base, from);
  slotCentre(base + 1, to);
  return into.subVectors(to, from).normalize();
};
