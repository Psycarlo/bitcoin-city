import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";

let stale = true;

/**
 * Asks for the shadows to be drawn again, as something that casts them moved
 * or changed. They are only drawn when asked, which saves drawing the whole
 * city twice on every frame.
 */
export const invalidateShadows = () => {
  stale = true;
};

/**
 * Draws the shadow map only when something asked for it (in the same frame,
 * or the one before for parts that update after this one). Mount once inside
 * the canvas.
 */
export const ShadowUpdater = () => {
  const getState = useThree((state) => state.get);
  useLayoutEffect(() => {
    const { shadowMap } = getState().gl;
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    return () => {
      shadowMap.autoUpdate = true;
    };
  }, [getState]);
  useFrame(({ gl }) => {
    if (stale) {
      stale = false;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
};
