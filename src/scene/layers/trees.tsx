import { useEffect, useMemo } from "react";
import {
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";

import { getTheme } from "@/stores/theme-store";

import { createInstances, disposeInstances } from "../instances";
import type { Placement } from "../instances";
import { CROSSINGS, inGarden, onDock, PAVED, ROAD_Y } from "../island-plan";
import { TERRACE, TILE, TILE_RADIUS } from "../layout";
import { onPalette, paint } from "../paint";
import { TREE_CROWNS } from "../palette";

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
/** Room kept around the roads, the terrace, the dock and the gardens. */
const CLEARANCE = 14;
/** Matches the grass's rounded corners. */
const CORNER_RADIUS = TILE_RADIUS;
/** Trees on the roundabouts are smaller, to fit. */
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

/** Whether a point falls on the roads, the terrace or the ground between them, the dock or a garden. */
const built = (x: number, z: number) =>
  (Math.abs(x) <= PAVED.halfX + CLEARANCE &&
    z <= PAVED.halfZ + CLEARANCE &&
    z >= TERRACE.centreZ - TERRACE.depth / 2 - CLEARANCE) ||
  onDock(x, z, CLEARANCE) ||
  inGarden(x, z, CLEARANCE);

/** Trees scattered around the border, and one on each roundabout. */
const plantTrees = () => {
  const random = randomFrom(SEED);
  const trees: [x: number, z: number, scale: number, y: number][] = [];
  for (let z = TILE.minZ; z <= TILE.maxZ; z += SPACING) {
    for (let x = TILE.minX; x <= TILE.maxX; x += SPACING) {
      const treeX = x + (random() - 0.5) * SPACING;
      const treeZ = z + (random() - 0.5) * SPACING;
      const keep = random() < DENSITY;
      const scale = SCALE * (1 + (random() * 2 - 1) * SCALE_SPREAD);
      if (keep && onTable(treeX, treeZ, EDGE) && !built(treeX, treeZ)) {
        trees.push([treeX, treeZ, scale, 0]);
      }
    }
  }
  // On the roundabouts' grass, above the road.
  for (const [x, z] of CROSSINGS) {
    trees.push([x, z, CROSSING_SCALE * (0.9 + random() * 0.2), ROAD_Y + 2]);
  }
  return trees;
};

/** Shared by the trunks for as long as the page lives (it follows the theme). */
const TRUNK_MATERIAL = paint(new MeshLambertMaterial(), "trunk");

/** Decorative trees: a trunk and a faceted crown each, in two draw calls. */
export const Trees = () => {
  const [trunks, crowns] = useMemo(() => {
    const trunk = new CylinderGeometry(
      TRUNK_RADIUS * 0.75,
      TRUNK_RADIUS,
      TRUNK_HEIGHT,
      6
    );
    trunk.translate(0, TRUNK_HEIGHT / 2, 0);
    const crown = new IcosahedronGeometry(CROWN_RADIUS, 1);
    crown.translate(0, TRUNK_HEIGHT + CROWN_RADIUS * 0.7, 0);
    const placements = plantTrees().map(
      ([x, z, scale, y], index): Placement => ({
        position: [x, y, z],
        rotationY: index,
        scale: [scale, scale, scale],
      })
    );
    return [
      createInstances(trunk, TRUNK_MATERIAL, placements),
      createInstances(
        crown,
        new MeshLambertMaterial({ color: "#ffffff", flatShading: true }),
        placements
      ),
    ] as const;
  }, []);

  useEffect(
    () =>
      onPalette(() => {
        const tints = TREE_CROWNS[getTheme()];
        const colour = new Color();
        for (let index = 0; index < crowns.count; index += 1) {
          crowns.setColorAt(index, colour.set(tints[index % tints.length]));
        }
        if (crowns.instanceColor) {
          crowns.instanceColor.needsUpdate = true;
        }
      }),
    [crowns]
  );
  useEffect(
    () => () => {
      // The trunks' material is shared: only their geometry goes.
      trunks.geometry.dispose();
      trunks.dispose();
      disposeInstances(crowns);
    },
    [crowns, trunks]
  );
  return (
    <group>
      <primitive castShadow object={trunks} receiveShadow />
      <primitive castShadow object={crowns} receiveShadow />
    </group>
  );
};
