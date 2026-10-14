import { useMemo } from "react";
import { MeshLambertMaterial } from "three";

import { roundedSlab } from "../geometry";
import { TILE } from "../layout";
import { PALETTE } from "../palette";
import { createSoftShadowTexture, SHADOW_INSET } from "../textures";
import { useDisposable } from "../use-disposable";

const THICKNESS = 48;
const CORNER_RADIUS = 72;
/** The shadow's solid core, relative to the tile. */
const SHADOW_CORE = 0.92;
/** How far below the tile the shadow falls. */
const SHADOW_DROP = 140;
const SHADOW_OPACITY = 0.2;

const WIDTH = TILE.maxX - TILE.minX;
const DEPTH = TILE.maxZ - TILE.minZ;
const CENTRE_X = (TILE.minX + TILE.maxX) / 2;
const CENTRE_Z = (TILE.minZ + TILE.maxZ) / 2;

/** The table the world stands on, and its soft shadow. */
export const Ground = () => {
  const slab = useMemo(
    () => roundedSlab(WIDTH, DEPTH, CORNER_RADIUS, THICKNESS),
    []
  );
  const materials = useMemo(
    () => [
      new MeshLambertMaterial({ color: PALETTE.land }),
      new MeshLambertMaterial({ color: PALETTE.slabSide }),
    ],
    []
  );
  const shadow = useMemo(() => createSoftShadowTexture(), []);
  useDisposable(slab);
  useDisposable(materials);
  useDisposable(shadow);

  const spread = SHADOW_CORE / (1 - SHADOW_INSET * 2);
  return (
    <group>
      <mesh
        geometry={slab}
        material={materials}
        position={[CENTRE_X, 0, CENTRE_Z]}
        receiveShadow
      />
      <mesh
        position={[CENTRE_X, -THICKNESS - SHADOW_DROP, CENTRE_Z]}
        renderOrder={-1}
        rotation-x={-Math.PI / 2}
      >
        <planeGeometry args={[WIDTH * spread, DEPTH * spread]} />
        <meshBasicMaterial
          color={PALETTE.shadow}
          depthWrite={false}
          map={shadow}
          opacity={SHADOW_OPACITY}
          transparent
        />
      </mesh>
    </group>
  );
};
