import type { Box3 } from "three";

import type { SceneKey } from "@/lib/scene-key";

/** Fills `into` with the world box of `key`, if it is on show; tells whether it is. */
export type Locator = (key: SceneKey, into: Box3) => boolean;

const locators = new Set<Locator>();

/**
 * Lets the camera and the selection marker find what a part of the scene
 * shows. Returns the function that takes it back.
 */
export const registerLocator = (locator: Locator) => {
  locators.add(locator);
  return () => {
    locators.delete(locator);
  };
};

/** Where `key` stands in the world, if anywhere. */
export const locate = (key: SceneKey, into: Box3) => {
  for (const locator of locators) {
    if (locator(key, into)) {
      return true;
    }
  }
  return false;
};
