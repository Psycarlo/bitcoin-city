import { useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  MeshLambertMaterial,
  Vector3,
} from "three";
import type { Group, LineSegments, Mesh } from "three";

import type { SceneKey } from "@/lib/scene-key";
import { useViewStore } from "@/stores/view-store";

import { paint, paintGlow } from "./paint";
import { locate } from "./positions";

const TX_PREFIX = "tx:";
/** Room between a building and its outline. */
const OUTLINE_PAD = 1.2;
/** The pin over the picked building: a gem pointing down at it. */
const PIN_HEIGHT = 16;
/** It is never drawn smaller than this on screen (px)… */
const PIN_PX = 26;
/** …and floats this far above the roof (px), bobbing by this much (units). */
const PIN_GAP_PX = 10;
const BOB = 3;
const BOB_RATE = 3;
const SPIN_RATE = 1.2;
/** Drawn over the buildings, which would hide it in a dense city. */
const ON_TOP = 10;

const OUTLINE = new EdgesGeometry(
  new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
);
const OUTLINE_MATERIALS = {
  hovered: paint(new LineBasicMaterial(), "hover"),
  selected: paint(new LineBasicMaterial(), "selection"),
};
const PIN = new ConeGeometry(7, PIN_HEIGHT, 4)
  .rotateX(Math.PI)
  .translate(0, PIN_HEIGHT / 2, 0);
const PIN_MATERIAL = paintGlow(
  paint(
    new MeshLambertMaterial({ depthTest: false, emissiveIntensity: 0.3 }),
    "selection"
  ),
  "selection"
);

const centre = new Vector3();
const extent = new Vector3();

interface BuildingMarkerProps {
  sceneKey?: SceneKey;
  variant: keyof typeof OUTLINE_MATERIALS;
}

/** Outlines a transaction's building (and pins it, when picked), wherever it moves. */
const BuildingMarker = ({ sceneKey, variant }: BuildingMarkerProps) => {
  const groupRef = useRef<Group>(null);
  const outlineRef = useRef<LineSegments>(null);
  const pinRef = useRef<Mesh>(null);
  const boxRef = useRef(new Box3());

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    const outline = outlineRef.current;
    if (!group || !outline) {
      return;
    }
    const box = boxRef.current;
    const shown =
      sceneKey !== undefined &&
      sceneKey.startsWith(TX_PREFIX) &&
      locate(sceneKey, box);
    group.visible = shown;
    if (!shown) {
      return;
    }
    box.getCenter(centre);
    box.getSize(extent);
    outline.position.set(centre.x, box.min.y, centre.z);
    outline.scale.set(
      extent.x + OUTLINE_PAD * 2,
      extent.y + OUTLINE_PAD,
      extent.z + OUTLINE_PAD * 2
    );
    const pin = pinRef.current;
    if (pin) {
      const scale = Math.max(1, PIN_PX / (PIN_HEIGHT * camera.zoom));
      const time = clock.elapsedTime;
      pin.scale.setScalar(scale);
      pin.position.set(
        centre.x,
        box.max.y +
          PIN_GAP_PX / camera.zoom +
          (Math.sin(time * BOB_RATE) + 1) * BOB * scale,
        centre.z
      );
      pin.rotation.y = time * SPIN_RATE;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments
        geometry={OUTLINE}
        material={OUTLINE_MATERIALS[variant]}
        ref={outlineRef}
      />
      {variant === "selected" ? (
        <mesh
          geometry={PIN}
          material={PIN_MATERIAL}
          ref={pinRef}
          renderOrder={ON_TOP}
        />
      ) : null}
    </group>
  );
};

/** Marks the picked transaction, and the one under the pointer. */
export const Markers = () => {
  const selected = useViewStore((state) => state.selected);
  const hovered = useViewStore((state) => state.hovered);
  return (
    <>
      <BuildingMarker sceneKey={selected} variant="selected" />
      <BuildingMarker
        sceneKey={hovered === selected ? undefined : hovered}
        variant="hovered"
      />
    </>
  );
};

/** A pointing hand over anything that can be picked. */
export const PointerCursor = () => {
  useCursor(useViewStore((state) => state.hovered !== undefined));
  return null;
};
