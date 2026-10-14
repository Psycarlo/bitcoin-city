import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Group } from "three";

import type { TxSummary } from "@/data/types";
import { txKey } from "@/lib/scene-key";
import type { SceneKey } from "@/lib/scene-key";
import { useViewActions } from "@/stores/view-store";

import { registerLocator } from "../positions";
import { invalidateShadows } from "../shadows";
import { useCity } from "./city-pool";

/** Farther than this (px) between press and release, a click was a drag. */
const CLICK_TOLERANCE = 4;
const TX_PREFIX = "tx:";

interface CityProps {
  /** Id of a city to take over, buildings and all, if this one is new. */
  adoptFrom?: string;
  id: string;
  txs: readonly TxSummary[];
}

/**
 * A block's transactions as a city on its plot (the group's origin is the
 * plot's centre, on its top). Hovering a building names it; clicking picks
 * its transaction.
 */
export const City = ({ adoptFrom, id, txs }: CityProps) => {
  const city = useCity(id, adoptFrom);
  const groupRef = useRef<Group>(null);
  /** The building under the pointer (its transaction's key). */
  const pointedRef = useRef<SceneKey | null>(null);
  const { hover, select, unhover } = useViewActions();

  // The city is drawn by three.js alone (it is shared and handed over
  // between plots); the group passes its pointer events on.
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    group.add(city);
    invalidateShadows();
    return () => {
      group.remove(city);
      invalidateShadows();
    };
  }, [city]);

  useEffect(() => {
    city.setTxs(txs);
  }, [city, txs]);

  useEffect(
    () =>
      registerLocator(
        (key, into) =>
          key.startsWith(TX_PREFIX) &&
          city.locate(key.slice(TX_PREFIX.length), into)
      ),
    [city]
  );

  useFrame((_, delta) => {
    if (city.update(delta)) {
      invalidateShadows();
    }
  });

  const txOf = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.object === city && event.instanceId !== undefined
      ? city.txAt(event.instanceId)
      : undefined;

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const tx = txOf(event);
    if (!tx) {
      return;
    }
    event.stopPropagation();
    const key = txKey(tx.txid);
    if (pointedRef.current !== key) {
      pointedRef.current = key;
      hover(key);
    }
  };

  const handlePointerOut = () => {
    if (pointedRef.current) {
      unhover(pointedRef.current);
      pointedRef.current = null;
    }
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const tx = txOf(event);
    if (!tx) {
      return;
    }
    event.stopPropagation();
    if (event.delta <= CLICK_TOLERANCE) {
      select(txKey(tx.txid));
    }
  };

  return (
    <group
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      ref={groupRef}
    />
  );
};
