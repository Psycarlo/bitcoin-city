import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MeshBasicMaterial, MeshLambertMaterial } from "three";
import type { Group } from "three";

import type { Block, TxSummary } from "@/data/types";
import { feeColour } from "@/lib/fees";
import { formatFeeRate, formatHeight } from "@/lib/format";
import { blockKey, projectedKey } from "@/lib/scene-key";
import { useChainStore, useTip } from "@/stores/chain-store";
import { requestSummary, useSummary } from "@/stores/summary-store";
import { useViewStore } from "@/stores/view-store";

import { City } from "../city/city";
import { roundedSlab } from "../geometry";
import {
  CITIES_SHOWN,
  CONFIRMED_SHOWN,
  confirmedSlot,
  NEXT_SLOT,
  PAD_TOP,
  pathPoint,
  PLOT,
} from "../layout";
import { PALETTE } from "../palette";
import { registerLocator } from "../positions";
import { invalidateShadows } from "../shadows";
import { useDisposable } from "../use-disposable";
import { LabelNote, PlotLabel, PlotPad } from "./plot";
import { plotBox, useHighlight, usePlotHandlers } from "./plot-state";

/** A block found this recently (ms) glides in from the next block's plot. */
const ARRIVAL_WINDOW = 15_000;
/** How fast plots glide to their place (per second)… */
const GLIDE_RATE = 3;
/** …never slower than this (places per second). */
const MIN_GLIDE = 0.25;
/** A frame longer than this (s) is taken as this, after the tab slept. */
const MAX_STEP = 0.1;
/** Height of a city's label above the plot (clears all but the miner's tower). */
const CITY_LABEL_HEIGHT = 70;

/** A sealed block: a strongbox, as tall as the block is full. */
const VAULT_WIDTH = 260;
const VAULT_RADIUS = 20;
const VAULT_MIN_HEIGHT = 30;
const VAULT_HEIGHT_RANGE = 60;
/** Weight of a full block (weight units). */
const MAX_WEIGHT = 4_000_000;
const VAULT_SIDE = new MeshLambertMaterial({ color: PALETTE.vaultSide });

/** The next block's halo, breathing while it is mined. */
const HALO_WIDTH = 24;
const HALO = roundedSlab(
  PLOT + HALO_WIDTH * 2,
  PLOT + HALO_WIDTH * 2,
  28 + HALO_WIDTH,
  1
);
const HALO_MATERIAL = new MeshBasicMaterial({
  color: PALETTE.selection,
  depthWrite: false,
  opacity: 0.3,
  transparent: true,
});
const HALO_PULSE = 2.4;
const HALO_OPACITY = { max: 0.55, min: 0.12 } as const;

const NO_TXS: readonly TxSummary[] = [];

/** Id of the city of the block being mined on top of `tip` (it becomes that block's). */
const nextCityId = (tip: string) => `${tip}:next`;

/** Transactions of a confirmed block: its own list once loaded, else what the next block held. */
const useBlockTxs = (hash: string) => {
  const summary = useSummary(hash);
  const provisional = useChainStore((state) => state.provisional[hash]);
  return summary ?? provisional ?? NO_TXS;
};

interface VaultProps {
  medianFee: number;
  weight: number;
}

/** A block shown sealed: its fill as height, its median fee rate as colour. */
const Vault = ({ medianFee, weight }: VaultProps) => {
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

interface BlockPlotProps {
  block: Block;
  /** Place among the confirmed blocks (0 is the newest). */
  index: number;
}

/**
 * A confirmed block on its plot: a city of its transactions, or sealed
 * further back (it opens when picked). Each new block glides in from the
 * next block's plot, taking its city along, and pushes the others on.
 */
const BlockPlotView = ({ block, index }: BlockPlotProps) => {
  const { id } = block;
  const key = blockKey(id);
  const groupRef = useRef<Group>(null);
  const arrival = useChainStore((state) => state.arrivals[id]);
  const slotRef = useRef(confirmedSlot(index));
  const target = confirmedSlot(index);
  const highlight = useHighlight(key);
  const holdsPick = useViewStore((state) => state.txBlock === id);
  const open = index < CITIES_SHOWN || highlight === "selected" || holdsPick;
  const txs = useBlockTxs(id);
  const handlers = usePlotHandlers(key);

  useLayoutEffect(() => {
    // A block found moments ago starts on the next block's plot and glides on.
    const arrived = useChainStore.getState().arrivals[id];
    if (arrived !== undefined && Date.now() - arrived < ARRIVAL_WINDOW) {
      slotRef.current = NEXT_SLOT;
    }
    if (groupRef.current) {
      pathPoint(slotRef.current, groupRef.current.position);
    }
  }, [id]);

  useEffect(() => {
    if (open) {
      requestSummary(id);
    }
  }, [id, open]);

  useEffect(
    () =>
      registerLocator(
        (wanted, into) => wanted === key && plotBox(target, into)
      ),
    [key, target]
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    const gap = target - slotRef.current;
    if (!group || gap === 0) {
      return;
    }
    const step = Math.max(
      Math.abs(gap) * (1 - Math.exp(-GLIDE_RATE * Math.min(delta, MAX_STEP))),
      MIN_GLIDE * Math.min(delta, MAX_STEP)
    );
    slotRef.current =
      Math.abs(gap) <= step ? target : slotRef.current + Math.sign(gap) * step;
    pathPoint(slotRef.current, group.position);
    invalidateShadows();
  });

  const selected = highlight === "selected";
  return (
    <group ref={groupRef} {...handlers}>
      <PlotPad highlight={highlight} />
      <group position-y={PAD_TOP}>
        {open ? (
          <City
            adoptFrom={
              arrival !== undefined && block.previous
                ? nextCityId(block.previous)
                : undefined
            }
            id={key}
            txs={txs}
          />
        ) : (
          <Vault medianFee={block.medianFee} weight={block.weight} />
        )}
        <PlotLabel
          colour={feeColour(block.medianFee)}
          height={
            open ? CITY_LABEL_HEIGHT : VAULT_MIN_HEIGHT + VAULT_HEIGHT_RANGE
          }
          highlight={highlight}
          priority={index === 0 ? 65 : (open ? 50 : 30) - index}
          sceneKey={key}
        >
          {formatHeight(block.height)}
          {block.pool ? (
            <LabelNote selected={selected}>{block.pool.name}</LabelNote>
          ) : null}
        </PlotLabel>
      </group>
    </group>
  );
};

const BlockPlot = memo(BlockPlotView);

/** The next block's transactions, less those the newest block just took. */
const useNextBlockTxs = (tip: string | undefined) => {
  const txs = useChainStore((state) => state.nextBlock.txs);
  const confirmed = useBlockTxs(tip ?? "");
  const taken = useMemo(
    () => new Set(confirmed.map((tx) => tx.txid)),
    [confirmed]
  );
  return useMemo(() => {
    const list = [...txs.values()];
    return taken.size === 0 ? list : list.filter((tx) => !taken.has(tx.txid));
  }, [taken, txs]);
};

const NEXT_KEY = projectedKey(0);

/** The block being mined: the city mempool.space expects, ringed by a breathing halo. */
const NextBlockPlot = () => {
  const tip = useTip();
  const txs = useNextBlockTxs(tip?.id);
  const medianFee = useChainStore((state) => state.projected[0]?.medianFee);
  const highlight = useHighlight(NEXT_KEY);
  const handlers = usePlotHandlers(NEXT_KEY);
  const position = useMemo(() => pathPoint(NEXT_SLOT), []);

  useEffect(
    () =>
      registerLocator(
        (wanted, into) => wanted === NEXT_KEY && plotBox(NEXT_SLOT, into)
      ),
    []
  );

  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * HALO_PULSE) + 1) / 2;
    HALO_MATERIAL.opacity =
      HALO_OPACITY.min + (HALO_OPACITY.max - HALO_OPACITY.min) * wave;
  });

  return (
    <group position={position} {...handlers}>
      <mesh geometry={HALO} material={HALO_MATERIAL} position-y={1.5} />
      <PlotPad highlight={highlight} variant="next" />
      <group position-y={PAD_TOP}>
        {tip ? <City id={nextCityId(tip.id)} txs={txs} /> : null}
        <PlotLabel
          colour={medianFee === undefined ? undefined : feeColour(medianFee)}
          height={CITY_LABEL_HEIGHT}
          highlight={highlight}
          priority={70}
          sceneKey={NEXT_KEY}
        >
          Next block
          {medianFee === undefined ? null : (
            <LabelNote selected={highlight === "selected"}>
              ~{formatFeeRate(medianFee)}
            </LabelNote>
          )}
        </PlotLabel>
      </group>
    </group>
  );
};

/** The confirmed blocks, newest first along the path, and the next block. */
export const ChainLayer = () => {
  const blocks = useChainStore((state) => state.blocks);

  // The cities on show load their transactions, newest first.
  useEffect(() => {
    for (const block of blocks.slice(0, CITIES_SHOWN)) {
      requestSummary(block.id);
    }
  }, [blocks]);

  return (
    <>
      {blocks.slice(0, CONFIRMED_SHOWN).map((block, index) => (
        <BlockPlot block={block} index={index} key={block.id} />
      ))}
      <NextBlockPlot />
    </>
  );
};
