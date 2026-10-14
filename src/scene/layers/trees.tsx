import { useEffect, useMemo } from "react";
import {
  CylinderGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";

import { createInstances, disposeInstances } from "../instances";
import type { Placement } from "../instances";
import { GAP, GRID_HALF_X, GRID_HALF_Z, PITCH, TERRACE, TILE } from "../layout";
import { PALETTE, TREE_CROWNS } from "../palette";

/** Lollipop trees, larger than life so they read from afar. */
const TRUNK_HEIGHT = 5;
const TRUNK_RADIUS = 0.9;
const CROWN_RADIUS = 6.5;
const SCALE = 2.2;
/** Spread of their sizes, either way. */
const SCALE_SPREAD = 0.2;
/** Trees of the border are scattered over a grid this fine… */
const SPACING = 38;
/** …about this many to a square. */
const DENSITY = 0.36;
/** Room kept from the edge of the table, so crowns do not hang over it. */
const EDGE = 24;
/** Room kept around the plots and the terrace. */
const CLEARANCE = 14;
/** Matches the ground's rounded corners. */
const CORNER_RADIUS = 72;
/** Trees at the crossings of the avenues are smaller, to fit. */
const CROSSING_SCALE = 1.5;
const SEED = 21_000_000;

/** Park–Miller's modulus (2^31 − 1, a prime) and multiplier. */
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

/** A small seeded random generator (Park–Miller), so the trees stay put. */
const randomFrom = (seed: number) => {
  let state = seed % MODULUS || 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
};

const CENTRE_X = (TILE.minX + TILE.maxX) / 2;
const CENTRE_Z = (TILE.minZ + TILE.maxZ) / 2;
const HALF_WIDTH = (TILE.maxX - TILE.minX) / 2;
const HALF_DEPTH = (TILE.maxZ - TILE.minZ) / 2;

/** Whether a point is on the table, `edge` in from its rounded rim. */
const onTable = (x: number, z: number, edge: number) => {
  const across = Math.max(
    Math.abs(x - CENTRE_X) - (HALF_WIDTH - CORNER_RADIUS),
    0
  );
  const along = Math.max(
    Math.abs(z - CENTRE_Z) - (HALF_DEPTH - CORNER_RADIUS),
    0
  );
  return (
    Math.abs(x - CENTRE_X) <= HALF_WIDTH - edge &&
    Math.abs(z - CENTRE_Z) <= HALF_DEPTH - edge &&
    Math.hypot(across, along) <= CORNER_RADIUS - edge
  );
};

/** Whether a point falls on the plots, the terrace or the ground between them. */
const built = (x: number, z: number) =>
  Math.abs(x) <= GRID_HALF_X + CLEARANCE &&
  z <= GRID_HALF_Z + CLEARANCE &&
  z >= TERRACE.centreZ - TERRACE.depth / 2 - CLEARANCE;

/** Trees scattered around the border, and one at each crossing of the avenues. */
const plantTrees = () => {
  const random = randomFrom(SEED);
  const trees: [x: number, z: number, scale: number][] = [];
  for (let z = TILE.minZ; z <= TILE.maxZ; z += SPACING) {
    for (let x = TILE.minX; x <= TILE.maxX; x += SPACING) {
      const treeX = x + (random() - 0.5) * SPACING;
      const treeZ = z + (random() - 0.5) * SPACING;
      const keep = random() < DENSITY;
      const scale = SCALE * (1 + (random() * 2 - 1) * SCALE_SPREAD);
      if (keep && onTable(treeX, treeZ, EDGE) && !built(treeX, treeZ)) {
        trees.push([treeX, treeZ, scale]);
      }
    }
  }
  // The avenues cross between the corners of four plots.
  const half = PITCH / 2;
  for (const x of [-3, -1, 1, 3].map((step) => step * half)) {
    for (const z of [-2, 0, 2].map((step) => step * half)) {
      const jitter = (random() - 0.5) * (GAP / 6);
      trees.push([
        x + jitter,
        z - jitter,
        CROSSING_SCALE * (0.9 + random() * 0.2),
      ]);
    }
  }
  return trees;
};

/** Decorative trees: a trunk and a faceted crown each, in two draw calls. */
export const Trees = () => {
  const meshes = useMemo(() => {
    const trunk = new CylinderGeometry(
      TRUNK_RADIUS * 0.75,
      TRUNK_RADIUS,
      TRUNK_HEIGHT,
      6
    );
    trunk.translate(0, TRUNK_HEIGHT / 2, 0);
    const crown = new IcosahedronGeometry(CROWN_RADIUS, 1);
    crown.translate(0, TRUNK_HEIGHT + CROWN_RADIUS * 0.7, 0);
    const placements = plantTrees().map(([x, z, scale], index): Placement => ({
      colour: TREE_CROWNS[index % TREE_CROWNS.length],
      position: [x, 0, z],
      rotationY: index,
      scale: [scale, scale, scale],
    }));
    return [
      createInstances(
        trunk,
        new MeshLambertMaterial({ color: PALETTE.trunk }),
        placements
      ),
      createInstances(
        crown,
        new MeshLambertMaterial({ color: "#ffffff", flatShading: true }),
        placements
      ),
    ];
  }, []);
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        disposeInstances(mesh);
      }
    },
    [meshes]
  );
  return (
    <group>
      {meshes.map((mesh) => (
        <primitive castShadow key={mesh.uuid} object={mesh} receiveShadow />
      ))}
    </group>
  );
};
