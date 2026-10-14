import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

import { ISLAND, WATER_Y } from "../layout";
import { stepWater, WATER_MATERIAL, WATER_PLANE } from "../water";

/** The sea around the island (see `water.ts`), its tide and waves kept moving. */
export const Water = () => {
  const meshRef = useRef<Mesh>(null);
  useFrame(({ camera, clock }) => {
    const level = stepWater(clock.elapsedTime, camera.zoom);
    if (meshRef.current) {
      meshRef.current.position.y = level;
    }
  });
  return (
    <mesh
      geometry={WATER_PLANE}
      material={WATER_MATERIAL}
      position={[ISLAND.centreX, WATER_Y, ISLAND.centreZ]}
      ref={meshRef}
    />
  );
};
