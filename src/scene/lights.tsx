import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import type { DirectionalLight } from "three";

import { clamp } from "@/lib/collections";
import { useTheme } from "@/stores/theme-store";
import type { Theme } from "@/stores/theme-store";

import { TILE } from "./layout";
import { invalidateShadows } from "./shadows";

/** Where the sun shines from (south-west, high up), as a direction. */
const SUN = new Vector3(-0.6, 0.8, 0.5).normalize();
const SUN_DISTANCE = 5000;
/** Daylight, or a cool moon over a dim sky. */
const LIGHTING: Record<
  Theme,
  {
    ground: string;
    sky: string;
    skyIntensity: number;
    sun: string;
    sunIntensity: number;
  }
> = {
  dark: {
    ground: "#0b1220",
    sky: "#9fb6e6",
    skyIntensity: 1.05,
    sun: "#c9d8ff",
    sunIntensity: 1.3,
  },
  light: {
    ground: "#cbd5e1",
    sky: "#ffffff",
    skyIntensity: 1.45,
    sun: "#ffffff",
    sunIntensity: 2.2,
  },
};
const SHADOW_MAP_SIZE = 4096;
/**
 * The shadows cover what is in view, and a margin: close up, the shadow map
 * spreads over less ground, so the buildings' shadows stay crisp.
 */
const VIEW_SHARE = 0.75;
const MARGIN = 200;
const MIN_REACH = 350;
/** Enough for the whole table, wherever the view is. */
const MAX_REACH = 2150;
/** The shadows are fitted again once the view moves this share of their reach… */
const MOVE_SHARE = 0.25;
/** …or needs a reach this much larger or smaller. */
const RESIZE_SHARE = 0.15;

const TABLE_CENTRE = new Vector3(
  (TILE.minX + TILE.maxX) / 2,
  0,
  (TILE.minZ + TILE.maxZ) / 2
);
const target = new Vector3();

interface Fit {
  reach: number;
  x: number;
  z: number;
}

/** Soft light from the sky, and a sun (or moon) whose shadows follow the view. */
export const Lights = () => {
  const lighting = LIGHTING[useTheme()];
  const lightRef = useRef<DirectionalLight>(null);
  const fitRef = useRef<Fit>({ reach: 0, x: 0, z: 0 });

  useFrame(({ camera, controls, size }) => {
    const light = lightRef.current;
    if (!light) {
      return;
    }
    const rig = controls as CameraControlsImpl | null;
    if (rig && "getTarget" in rig) {
      rig.getTarget(target);
    } else {
      target.copy(TABLE_CENTRE);
    }
    target.y = 0;
    const reach = clamp(
      (Math.hypot(size.width, size.height) / Math.max(camera.zoom, 0.01)) *
        VIEW_SHARE +
        MARGIN,
      MIN_REACH,
      MAX_REACH
    );
    const fit = fitRef.current;
    const moved = Math.hypot(target.x - fit.x, target.z - fit.z);
    if (
      fit.reach > 0 &&
      moved < fit.reach * MOVE_SHARE &&
      Math.abs(reach - fit.reach) < fit.reach * RESIZE_SHARE
    ) {
      return;
    }
    fitRef.current = { reach, x: target.x, z: target.z };
    light.position.copy(target).addScaledVector(SUN, SUN_DISTANCE);
    light.target.position.copy(target);
    light.target.updateMatrixWorld();
    const shadow = light.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.far = SUN_DISTANCE + reach * 2;
    shadow.updateProjectionMatrix();
    invalidateShadows();
  });

  return (
    <>
      <hemisphereLight
        color={lighting.sky}
        groundColor={lighting.ground}
        intensity={lighting.skyIntensity}
      />
      <directionalLight
        castShadow
        color={lighting.sun}
        intensity={lighting.sunIntensity}
        ref={lightRef}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-normalBias={1.5}
      />
    </>
  );
};
