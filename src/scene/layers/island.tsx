import { useEffect } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";

import { roundedSlab, shoreSlab } from "../geometry";
import {
  AVENUES_X,
  AVENUES_Z,
  CROSSINGS,
  DOCK,
  GARDENS,
  PAVED,
  PILE_RADIUS,
  PILES,
  RING_X,
  RING_Z,
  ROAD_Y,
  ROUNDABOUT_RADIUS,
} from "../island-plan";
import {
  BEACH_DROP,
  BEACH_FLAT,
  BEACH_SLOPE,
  GAP,
  GRASS_DEPTH,
  GRID_HALF_X,
  GRID_HALF_Z,
  ISLAND,
  TILE_RADIUS,
} from "../layout";
import { onPalette, paint } from "../paint";
import type { Palette } from "../palette";
import { invalidateShadows } from "../shadows";

/**
 * The island everything stands on: a lawn on a sandy shore that slopes into
 * the sea, paved between the plots with avenues and a ring road (roundabouts
 * where avenues cross), a dock out to sea at the end of the chain, and
 * flower beds in the grass. Built once: it never changes, only its colours.
 */

const WIDTH = ISLAND.halfX * 2;
const DEPTH = ISLAND.halfZ * 2;
/** How far the sand reaches under the sea. */
const SAND_DEPTH = 70;

const DASH_LENGTH = 18;
const DASH_GAP = 16;
const DASH_WIDTH = 2.2;
const DASH_HEIGHT = 0.3;
/** Dashes stop this far short of a crossing. */
const DASH_CLEAR = GAP / 2 + 8;

const DECK_THICKNESS = 4;
/** The pier's boards, across it, with a gap between each. */
const BOARD_WIDTH = 15;
const BOARD_GAP = 2.5;
const BOARD_HEIGHT = 1.4;
const PILE_DEPTH = 70;

const HEDGE_HEIGHT = 7;
const FLOWER_RADIUS = 3.6;
const FLOWER_SPACING = 9;
const BED_INSET = 8;

/** Park–Miller's modulus (2^31 − 1) and multiplier, for flowers that stay put. */
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

const randomFrom = (seed: number) => {
  let state = seed % MODULUS || 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
};

const lambert = () => new MeshLambertMaterial();
const GRASS = paint(lambert(), "grass");
const GRASS_SIDE = paint(lambert(), "grassSide");
const SAND = paint(lambert(), "beach");
const ROAD = paint(lambert(), "road");
const LANE = paint(lambert(), "lane");
const PIER = paint(lambert(), "pier");
const PILE = paint(lambert(), "trunk");
const HEDGE = paint(lambert(), "hedge");

const LAWN = roundedSlab(WIDTH, DEPTH, TILE_RADIUS, GRASS_DEPTH);
const SHORE = shoreSlab(
  WIDTH + BEACH_FLAT * 2,
  DEPTH + BEACH_FLAT * 2,
  TILE_RADIUS + BEACH_FLAT,
  { drop: BEACH_DROP, slope: BEACH_SLOPE, thickness: SAND_DEPTH }
);
const PAVING = roundedSlab(PAVED.halfX * 2, PAVED.halfZ * 2, 36, 1);

const matrix = new Matrix4();
const upright = new Quaternion();
const turned = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2
);
const where = new Vector3();
const size = new Vector3();

/** Whether a point on a line is clear of the roads crossing it. */
const clearOf = (at: number, crossings: readonly number[]) =>
  crossings.every((crossing) => Math.abs(at - crossing) > DASH_CLEAR);

/** Dashes down the middle of every road, stopping short of the crossings. */
const createLanes = () => {
  const dashes: [x: number, z: number, along: "x" | "z"][] = [];
  const pitch = DASH_LENGTH + DASH_GAP;
  // Lines along z (the avenues across the grid, and the ring's east and west sides).
  for (const x of [...AVENUES_X, -RING_X, RING_X]) {
    const ring = Math.abs(x) === RING_X;
    const crossings = ring ? AVENUES_Z : [...AVENUES_Z, -RING_Z, RING_Z];
    const dock = ring && Math.sign(x) === DOCK.out;
    for (let z = -GRID_HALF_Z; z <= GRID_HALF_Z; z += pitch) {
      const inDock = dock && Math.abs(z - DOCK.centreZ) < DOCK.width / 2 + 6;
      if (clearOf(z, crossings) && !inDock) {
        dashes.push([x, z, "z"]);
      }
    }
  }
  // Down the middle of the dock's road, out to the shore.
  for (
    let x = DOCK.from + DOCK.out * DASH_CLEAR;
    Math.abs(x) < Math.abs(DOCK.shore) - DASH_LENGTH;
    x += DOCK.out * pitch
  ) {
    dashes.push([x, DOCK.centreZ, "x"]);
  }
  // Lines along x (the avenues along the grid, and the ring's north and south sides).
  for (const z of [...AVENUES_Z, -RING_Z, RING_Z]) {
    const ring = Math.abs(z) === RING_Z;
    const crossings = ring ? AVENUES_X : [...AVENUES_X, -RING_X, RING_X];
    for (let x = -GRID_HALF_X; x <= GRID_HALF_X; x += pitch) {
      if (clearOf(x, crossings)) {
        dashes.push([x, z, "x"]);
      }
    }
  }
  const mesh = new InstancedMesh(
    new BoxGeometry(DASH_LENGTH, DASH_HEIGHT, DASH_WIDTH),
    LANE,
    dashes.length
  );
  for (const [index, [x, z, along]] of dashes.entries()) {
    mesh.setMatrixAt(
      index,
      matrix.compose(
        where.set(x, ROAD_Y + DASH_HEIGHT / 2, z),
        along === "x" ? upright : turned,
        size.set(1, 1, 1)
      )
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
};

/** A disc of grass at each crossing of the avenues. */
const createRoundabouts = () => {
  const mesh = new InstancedMesh(
    new CylinderGeometry(ROUNDABOUT_RADIUS, ROUNDABOUT_RADIUS + 1.5, 2, 24),
    GRASS,
    CROSSINGS.length
  );
  for (const [index, [x, z]] of CROSSINGS.entries()) {
    mesh.setMatrixAt(
      index,
      matrix.compose(where.set(x, ROAD_Y + 1, z), upright, size.set(1, 1, 1))
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
};

/** The dock: its road across the grass, the pier's boards out over the sea, and its piles. */
const createDock = () => {
  const roadLength = Math.abs(DOCK.shore - DOCK.from);
  const unit = new BoxGeometry(1, 1, 1);
  const road = new InstancedMesh(unit, ROAD, 1);
  road.setMatrixAt(
    0,
    matrix.compose(
      where.set((DOCK.from + DOCK.shore) / 2, ROAD_Y - 0.5, DOCK.centreZ),
      upright,
      size.set(roadLength, 1, DOCK.width)
    )
  );
  // A beam under the boards, then the boards across it.
  const reach = Math.abs(DOCK.pierEnd - DOCK.shore);
  const boards = Math.floor(reach / (BOARD_WIDTH + BOARD_GAP));
  const deck = new InstancedMesh(unit, PIER, boards + 1);
  deck.setMatrixAt(
    0,
    matrix.compose(
      where.set(
        (DOCK.shore + DOCK.pierEnd) / 2,
        ROAD_Y - BOARD_HEIGHT - DECK_THICKNESS / 2,
        DOCK.centreZ
      ),
      upright,
      size.set(reach, DECK_THICKNESS, DOCK.width - 24)
    )
  );
  for (let board = 0; board < boards; board += 1) {
    const along =
      BOARD_GAP + board * (BOARD_WIDTH + BOARD_GAP) + BOARD_WIDTH / 2;
    deck.setMatrixAt(
      board + 1,
      matrix.compose(
        where.set(
          DOCK.shore + DOCK.out * along,
          ROAD_Y - BOARD_HEIGHT / 2,
          DOCK.centreZ
        ),
        upright,
        size.set(BOARD_WIDTH, BOARD_HEIGHT, DOCK.width)
      )
    );
  }
  const pile = new InstancedMesh(
    new CylinderGeometry(PILE_RADIUS, PILE_RADIUS, PILE_DEPTH, 10),
    PILE,
    PILES.length
  );
  // Their tops tuck under the beam.
  const pileTop = ROAD_Y - BOARD_HEIGHT - DECK_THICKNESS / 2;
  for (const [index, [x, z]] of PILES.entries()) {
    pile.setMatrixAt(
      index,
      matrix.compose(
        where.set(x, pileTop - PILE_DEPTH / 2, z),
        upright,
        size.set(1, 1, 1)
      )
    );
  }
  for (const mesh of [road, deck, pile]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
  }
  deck.castShadow = true;
  pile.castShadow = true;
  return [road, deck, pile];
};

/** Hedged flower beds, the hedges in one draw call and the flowers in another. */
const createGardens = () => {
  const hedges = new InstancedMesh(
    new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    HEDGE,
    GARDENS.length
  );
  const blooms: [x: number, z: number, scale: number][] = [];
  const random = randomFrom(2_100_000);
  for (const [index, garden] of GARDENS.entries()) {
    hedges.setMatrixAt(
      index,
      matrix.compose(
        where.set(garden.x, 0, garden.z),
        upright,
        size.set(garden.width, HEDGE_HEIGHT, garden.depth)
      )
    );
    const halfWidth = garden.width / 2 - BED_INSET;
    const halfDepth = garden.depth / 2 - BED_INSET;
    for (let x = -halfWidth; x <= halfWidth; x += FLOWER_SPACING) {
      for (let z = -halfDepth; z <= halfDepth; z += FLOWER_SPACING) {
        blooms.push([
          garden.x + x + (random() - 0.5) * 3,
          garden.z + z + (random() - 0.5) * 3,
          0.7 + random() * 0.6,
        ]);
      }
    }
  }
  const flowers = new InstancedMesh(
    new IcosahedronGeometry(FLOWER_RADIUS, 0),
    new MeshLambertMaterial({ flatShading: true }),
    blooms.length
  );
  for (const [index, [x, z, scale]] of blooms.entries()) {
    flowers.setMatrixAt(
      index,
      matrix.compose(
        where.set(x, HEDGE_HEIGHT + FLOWER_RADIUS * 0.4, z),
        upright,
        size.setScalar(scale)
      )
    );
  }
  for (const mesh of [hedges, flowers]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
  }
  hedges.castShadow = true;
  const colour = new Color();
  const paintFlowers = (palette: Palette) => {
    const tints = [palette.flower, palette.flowerAlt, palette.flower];
    for (let index = 0; index < blooms.length; index += 1) {
      flowers.setColorAt(index, colour.set(tints[index % tints.length]));
    }
    if (flowers.instanceColor) {
      flowers.instanceColor.needsUpdate = true;
    }
  };
  return { meshes: [hedges, flowers], paintFlowers };
};

const LANES = createLanes();
const ROUNDABOUTS = createRoundabouts();
const DOCK_PARTS = createDock();
const GARDEN_PARTS = createGardens();
const PARTS = [LANES, ROUNDABOUTS, ...DOCK_PARTS, ...GARDEN_PARTS.meshes];

export const Island = () => {
  useEffect(() => onPalette(GARDEN_PARTS.paintFlowers), []);
  useEffect(() => {
    invalidateShadows();
  }, []);
  return (
    <group>
      <mesh
        geometry={LAWN}
        material={[GRASS, GRASS_SIDE]}
        position={[ISLAND.centreX, 0, ISLAND.centreZ]}
        receiveShadow
      />
      <mesh
        geometry={SHORE}
        material={SAND}
        position={[ISLAND.centreX, -GRASS_DEPTH, ISLAND.centreZ]}
        receiveShadow
      />
      <mesh
        geometry={PAVING}
        material={ROAD}
        position-y={ROAD_Y}
        receiveShadow
      />
      {PARTS.map((part) => (
        <primitive key={part.uuid} object={part} />
      ))}
    </group>
  );
};
