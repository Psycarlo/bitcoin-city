import { useMemo } from "react";
import { MeshLambertMaterial } from "three";

import { feeColour } from "@/lib/fees";

import { roundedSlab } from "../geometry";
import { paint } from "../paint";
import { useDisposable } from "../use-disposable";

/** A sealed block: a strongbox, as tall as the block is full. */
const VAULT_WIDTH = 260;
const VAULT_RADIUS = 20;
export const VAULT_MIN_HEIGHT = 30;
export const VAULT_HEIGHT_RANGE = 60;
/** Weight of a full block (weight units). */
const MAX_WEIGHT = 4_000_000;
const VAULT_SIDE = paint(new MeshLambertMaterial(), "vaultSide");

interface VaultProps {
  medianFee: number;
  weight: number;
}

/** A block shown sealed: its fill as height, its median fee rate as colour. */
export const Vault = ({ medianFee, weight }: VaultProps) => {
  const height = Math.round(
    VAULT_MIN_HEIGHT + VAULT_HEIGHT_RANGE * Math.min(1, weight / MAX_WEIGHT)
  );
  const geometry = useMemo(
    () => roundedSlab(VAULT_WIDTH, VAULT_WIDTH, VAULT_RADIUS, height),
    [height]
  );
  const top = useMemo(
    () => new MeshLambertMaterial({ color: feeColour(medianFee) }),
    [medianFee]
  );
  const materials = useMemo(() => [top, VAULT_SIDE], [top]);
  useDisposable(geometry);
  useDisposable(top);
  // The slab hangs below its top, bevels included.
  const bevel = Math.min(VAULT_RADIUS / 4, height / 3);
  return (
    <mesh
      castShadow
      geometry={geometry}
      material={materials}
      position-y={height + bevel * 2}
      receiveShadow
    />
  );
};
