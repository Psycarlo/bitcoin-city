import type { SceneKey } from "@/lib/scene-key";

import { sendCameraCommand } from "./camera-store";
import { useViewStore } from "./view-store";

/** Picks a block or transaction and brings it into view. */
export const show = (key: SceneKey) => {
  useViewStore.getState().actions.select(key);
  sendCameraCommand({ key, kind: "focus" });
};

export const clearSelection = () => {
  useViewStore.getState().actions.select();
};
