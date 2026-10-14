import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  Euler,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { InstancedMesh } from "three";

import { useChainStore } from "@/stores/chain-store";

import {
  CONFIRMED_SHOWN,
  NEXT_SLOT,
  PITCH,
  PLOT,
  pathDirection,
  pathPoint,
  QUEUE_SLOT,
  TIP_SLOT,
} from "../layout";
import { PALETTE } from "../palette";
import { invalidateShadows } from "../shadows";

/**
 * Each block is chained to the one before it, as on the blockchain: two
 * interlocked links in the avenue between their plots, one standing, one
 * lying, both stretched along the way. Before the next block, transactions
 * flow along the queue instead.
 */
const LINK = new TorusGeometry(13, 3.2, 8, 28);
const STRETCH = 1.4;
/** Each link's offset from the middle of the avenue, along the way. */
const OFFSET = 8.5;
const STANDING_HEIGHT = 18;
const LYING_HEIGHT = 16;
const LINK_MATERIAL = new MeshLambertMaterial({ color: PALETTE.link });
const LIVE_MATERIAL = new MeshLambertMaterial({
  color: PALETTE.linkLive,
  emissive: PALETTE.linkLive,
  emissiveIntensity: 0.2,
});
const LIVE_PULSE = 2.4;
const LIVE_GLOW = { max: 0.55, min: 0.1 } as const;
const CAPACITY = CONFIRMED_SHOWN * 2;

/** Transactions on their way to the next block, through each avenue of the queue. */
const DOT = new SphereGeometry(4.5, 12, 8);
const DOT_MATERIAL = new MeshLambertMaterial({
  color: PALETTE.linkLive,
  emissive: PALETTE.linkLive,
  emissiveIntensity: 0.35,
});
const DOTS_PER_GAP = 3;
const FLOW_GAPS = NEXT_SLOT - QUEUE_SLOT;
const DOTS = DOTS_PER_GAP * FLOW_GAPS;
/** How far the dots run, as a share of the way from one place to the next (centred on the avenue). */
const FLOW_SPAN = (PITCH - PLOT + 64) / PITCH;
/** Crossings of an avenue per second. */
const FLOW_SPEED = 0.45;
const DOT_HEIGHT = 14;

const matrix = new Matrix4();
const centre = new Vector3();
const direction = new Vector3();
const where = new Vector3();
const stretch = new Vector3(STRETCH, 1, 1);
const turn = new Euler(0, 0, 0, "YXZ");
const turned = new Quaternion();
const scale = new Vector3();
const none = new Quaternion();

/** The two links between a place and the next one, at `first` and `first + 1`. */
const placeLinks = (mesh: InstancedMesh, gap: number, first: number) => {
  pathPoint(gap + 0.5, centre);
  pathDirection(gap, direction);
  const yaw = Math.abs(direction.z) > Math.abs(direction.x) ? Math.PI / 2 : 0;
  for (const standing of [true, false]) {
    turn.set(standing ? 0 : Math.PI / 2, yaw, 0);
    turned.setFromEuler(turn);
    where
      .copy(centre)
      .addScaledVector(direction, standing ? -OFFSET : OFFSET)
      .setY(standing ? STANDING_HEIGHT : LYING_HEIGHT);
    mesh.setMatrixAt(
      first + (standing ? 0 : 1),
      matrix.compose(where, turned, stretch)
    );
  }
};

/** Links between the confirmed blocks on show. */
const ChainLinks = () => {
  const meshRef = useRef<InstancedMesh>(null);
  const shown = useChainStore((state) =>
    Math.min(state.blocks.length, CONFIRMED_SHOWN)
  );
  const gaps = Math.max(0, shown - 1);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    for (let gap = 0; gap < gaps; gap += 1) {
      placeLinks(mesh, TIP_SLOT + gap, gap * 2);
    }
    mesh.count = gaps * 2;
    mesh.instanceMatrix.needsUpdate = true;
    invalidateShadows();
  }, [gaps]);

  return (
    <instancedMesh
      args={[LINK, LINK_MATERIAL, CAPACITY]}
      castShadow
      frustumCulled={false}
      ref={meshRef}
    />
  );
};

/** The link from the next block to the newest: glowing, as it is being forged. */
const LiveLink = () => {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      placeLinks(mesh, NEXT_SLOT, 0);
      mesh.instanceMatrix.needsUpdate = true;
      invalidateShadows();
    }
  }, []);

  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * LIVE_PULSE) + 1) / 2;
    LIVE_MATERIAL.emissiveIntensity =
      LIVE_GLOW.min + (LIVE_GLOW.max - LIVE_GLOW.min) * wave;
  });

  return (
    <instancedMesh
      args={[LINK, LIVE_MATERIAL, 2]}
      castShadow
      frustumCulled={false}
      ref={meshRef}
    />
  );
};

/** Dots running through the avenues of the queue, towards the next block. */
const Flow = () => {
  const meshRef = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const time = clock.elapsedTime * FLOW_SPEED;
    for (let gap = 0; gap < FLOW_GAPS; gap += 1) {
      for (let dot = 0; dot < DOTS_PER_GAP; dot += 1) {
        // Staggered between avenues, so they do not march in step.
        const phase = (time + dot / DOTS_PER_GAP + gap * 0.37) % 1;
        pathPoint(QUEUE_SLOT + gap + 0.5 + (phase - 0.5) * FLOW_SPAN, where);
        where.y = DOT_HEIGHT;
        // Grows in and shrinks out at the ends of its run.
        const size = Math.sin(Math.PI * phase);
        scale.setScalar(Math.max(size, 0.001));
        mesh.setMatrixAt(
          gap * DOTS_PER_GAP + dot,
          matrix.compose(where, none, scale)
        );
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      args={[DOT, DOT_MATERIAL, DOTS]}
      frustumCulled={false}
      ref={meshRef}
    />
  );
};

/** Links along the chain and the flow of the queue. */
export const LinksLayer = () => {
  // The live link needs a newest block to reach.
  const hasTip = useChainStore((state) => state.blocks.length > 0);
  return (
    <>
      <ChainLinks />
      {hasTip ? <LiveLink /> : null}
      <Flow />
    </>
  );
};
