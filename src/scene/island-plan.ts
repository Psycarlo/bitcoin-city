import {
  COLUMNS,
  GAP,
  GRID_HALF_X,
  GRID_HALF_Z,
  pathPoint,
  PITCH,
  PLOT,
  RING_ROAD,
  ROWS,
  SHORE_OUT,
  SLOTS,
  TERRACE,
  TILE,
} from "./layout";

/**
 * What stands on the island besides the blocks: roads between and around the
 * plots, a dock where old blocks leave, and gardens in the grass.
 */

/** Height of the roads' surface above the grass. */
export const ROAD_Y = 0.6;

/** The paved area: the plots' grid and its ring road. */
export const PAVED = {
  halfX: GRID_HALF_X + RING_ROAD,
  halfZ: GRID_HALF_Z + RING_ROAD,
} as const;

/** Middle lines of the avenues between the plots, across (x) and along (z). */
export const AVENUES_X = Array.from(
  { length: COLUMNS - 1 },
  (_, index) => (index + 1 - COLUMNS / 2) * PITCH
);
export const AVENUES_Z = Array.from(
  { length: ROWS - 1 },
  (_, index) => (index + 1 - ROWS / 2) * PITCH
);

/** Middle lines of the ring road. */
export const RING_X = GRID_HALF_X + RING_ROAD / 2;
export const RING_Z = GRID_HALF_Z + RING_ROAD / 2;

/** Where the avenues cross: a small roundabout each. */
export const CROSSINGS = AVENUES_X.flatMap((x) =>
  AVENUES_Z.map((z) => [x, z] as const)
);
export const ROUNDABOUT_RADIUS = GAP * 0.32;

/** The last place on the path, where the oldest block on show stands. */
const LAST = pathPoint(SLOTS - 1);
/** Which way the path runs out from it: off the island's side. */
const OUT = Math.sign(LAST.x) || -1;
const SHORE = OUT > 0 ? TILE.maxX : TILE.minX;
/** How far the pier reaches past the waterline. */
const PIER_REACH = 130;

/**
 * The dock the oldest block leaves from: a road from the ring road to the
 * shore, carrying on as a pier over the sea, as wide as a plot.
 */
export const DOCK = {
  centreZ: LAST.z,
  /** Where the road leaves the ring road. */
  from: OUT * PAVED.halfX,
  /** Which way it runs (−1 west, 1 east). */
  out: OUT,
  /** End of the pier, out over the water. */
  pierEnd: SHORE + OUT * (SHORE_OUT + PIER_REACH),
  /** Where the grass ends. */
  shore: SHORE,
  width: PLOT + 28,
} as const;

/** The piles under the pier, in pairs along its sides. */
export const PILE_RADIUS = 5;
const PILE_SPACING = 46;
export const PILES: readonly (readonly [x: number, z: number])[] = (() => {
  const piles: [number, number][] = [];
  const edge = DOCK.width / 2 - PILE_RADIUS - 4;
  const reach = Math.abs(DOCK.pierEnd - DOCK.shore);
  for (let along = PILE_SPACING; along <= reach; along += PILE_SPACING) {
    const x = DOCK.shore + DOCK.out * along;
    piles.push([x, DOCK.centreZ - edge], [x, DOCK.centreZ + edge]);
  }
  return piles;
})();

/** A flower bed, hedged, in the grass. */
export interface Garden {
  depth: number;
  width: number;
  x: number;
  z: number;
}

const SOUTH = (GRID_HALF_Z + RING_ROAD + TILE.maxZ) / 2;
const EAST = (GRID_HALF_X + RING_ROAD + TILE.maxX) / 2;
const NORTH = (TERRACE.centreZ - TERRACE.depth / 2 + TILE.minZ) / 2;

export const GARDENS: readonly Garden[] = [
  { depth: 54, width: 150, x: -620, z: SOUTH },
  { depth: 54, width: 110, x: 40, z: SOUTH + 6 },
  { depth: 54, width: 150, x: 640, z: SOUTH - 4 },
  { depth: 130, width: 56, x: EAST, z: -420 },
  { depth: 110, width: 56, x: EAST + 4, z: 380 },
  { depth: 120, width: 56, x: -EAST, z: 260 },
  { depth: 60, width: 170, x: -380, z: NORTH },
  { depth: 60, width: 130, x: 460, z: NORTH + 8 },
];

/** Whether a point falls within `margin` of a garden. */
export const inGarden = (x: number, z: number, margin = 0) =>
  GARDENS.some(
    (garden) =>
      Math.abs(x - garden.x) <= garden.width / 2 + margin &&
      Math.abs(z - garden.z) <= garden.depth / 2 + margin
  );

/** Whether a point falls within `margin` of the dock's road. */
export const onDock = (x: number, z: number, margin = 0) =>
  Math.abs(z - DOCK.centreZ) <= DOCK.width / 2 + margin &&
  x * DOCK.out >= Math.abs(DOCK.from) - margin;
