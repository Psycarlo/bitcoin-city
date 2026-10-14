import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

import { declutterLabels } from "./declutter";

/** How often the labels are checked for overlaps (s). */
const INTERVAL = 0.1;

/**
 * Keeps the scene's labels from piling up on each other as the camera and
 * the traffic move. Mount once inside the canvas.
 */
export const LabelDeclutter = () => {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current >= INTERVAL) {
      elapsed.current = 0;
      declutterLabels();
    }
  });
  return null;
};
