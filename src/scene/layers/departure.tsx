import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import type { Block } from "@/data/types";

import { DOCK } from "../island-plan";
import { confirmedSlot, PAD_TOP, pathPoint } from "../layout";
import { invalidateShadows } from "../shadows";
import { addRipple, waterLevel } from "../water";
import { PlotPad } from "./plot";
import { Vault } from "./vault";

/**
 * The oldest block on show, pushed off the end of the chain by a new one,
 * leaves by the dock: it glides along the pier to its end, tips over the
 * edge, splashes into the sea and sinks out of sight.
 */

/** How long each part takes (s). */
const GLIDE = 2.6;
const TIP = 0.85;
const SINK = 3;
/** Older blocks leaving together set off this far apart (s). */
const STAGGER = 0.7;
/** How far it slides on as it tips, and how far it drops meanwhile. */
const TIP_SLIDE = 120;
const TIP_DROP = 34;
/** How far it leans over as it tips, then as it sinks (radians). */
const TIP_LEAN = 0.5;
const SINK_LEAN = 0.32;
/** How far it drifts on and down as it sinks. */
const SINK_DRIFT = 70;
const SINK_DEPTH = 300;
/** A frame longer than this (s) is taken as this, after the tab slept. */
const MAX_STEP = 0.1;

const easeInOut = (share: number) =>
  share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2;

export interface Departure {
  block: Block;
  /** Its place among the confirmed blocks before it left. */
  index: number;
  /** Which of those leaving together it is (0 first). */
  order: number;
}

interface DepartingPlotProps extends Departure {
  onGone: (id: string) => void;
}

/** A block on its way into the sea. */
const DepartingPlot = ({ block, index, onGone, order }: DepartingPlotProps) => {
  const groupRef = useRef<Group>(null);
  const timeRef = useRef(-order * STAGGER);
  const splashedRef = useRef(false);
  // Where it stood when it left.
  const from = useMemo(() => pathPoint(confirmedSlot(index)), [index]);
  // Which way the dock runs out, and the pier's end, where it tips over.
  const { out, pierEnd: edge } = DOCK;

  useLayoutEffect(() => {
    groupRef.current?.position.copy(from);
  }, [from]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    timeRef.current += Math.min(delta, MAX_STEP);
    const { current: time } = timeRef;
    if (time < 0) {
      return;
    }
    let { x, z } = from;
    let y = 0;
    let lean = 0;
    if (time < GLIDE) {
      // Along the path's line to the dock, then along the pier.
      const share = easeInOut(time / GLIDE);
      x = from.x + (edge - from.x) * share;
      z = from.z + (DOCK.centreZ - from.z) * share;
    } else if (time < GLIDE + TIP) {
      const share = (time - GLIDE) / TIP;
      x = edge + out * TIP_SLIDE * share;
      y = -TIP_DROP * share ** 2;
      lean = TIP_LEAN * share ** 2;
      z = DOCK.centreZ;
    } else {
      const share = Math.min((time - GLIDE - TIP) / SINK, 1);
      x = edge + out * (TIP_SLIDE + SINK_DRIFT * share);
      y = -TIP_DROP - SINK_DEPTH * share ** 1.6;
      lean = TIP_LEAN + SINK_LEAN * share;
      z = DOCK.centreZ;
      if (share >= 1) {
        onGone(block.id);
        return;
      }
    }
    // It meets the water: a splash, and the rings that follow.
    if (!splashedRef.current && y < waterLevel() + 8) {
      splashedRef.current = true;
      addRipple(x, z, 1);
      addRipple(x + out * 90, z - 60, 0.6);
      addRipple(x + out * 40, z + 80, 0.5);
    }
    group.position.set(x, y, z);
    // Its far side goes down first, over the edge.
    group.rotation.z = -out * lean;
    invalidateShadows();
  });

  return (
    <group ref={groupRef}>
      <PlotPad highlight={undefined} />
      <group position-y={PAD_TOP}>
        <Vault medianFee={block.medianFee} weight={block.weight} />
      </group>
    </group>
  );
};

/** The blocks on their way out. */
export const Departures = ({
  departures,
  onGone,
}: {
  departures: readonly Departure[];
  onGone: (id: string) => void;
}) =>
  departures.map((departure) => (
    <DepartingPlot key={departure.block.id} onGone={onGone} {...departure} />
  ));
