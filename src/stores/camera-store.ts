import { create } from "zustand";

import type { SceneKey } from "@/lib/scene-key";

/** What the UI asks of the 3D view's camera. */
export type CameraCommand =
  | { key: SceneKey; kind: "focus" }
  | { kind: "home" }
  | { degrees: number; kind: "rotate" }
  | { factor: number; kind: "zoom" };

export interface IssuedCommand {
  command: CameraCommand;
  /** Tells apart two commands that are alike (pressing zoom twice). */
  id: number;
}

interface CameraStore {
  issued?: IssuedCommand;
  send: (command: CameraCommand) => void;
}

export const useCameraStore = create<CameraStore>()((set) => ({
  send: (command) => {
    set((state) => ({
      issued: { command, id: (state.issued?.id ?? 0) + 1 },
    }));
  },
}));

export const sendCameraCommand = (command: CameraCommand) => {
  useCameraStore.getState().send(command);
};
