import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Box3 } from "three";
import type { Group } from "three";

import type { TxSummary } from "@/data/types";
import { SATS_PER_BTC } from "@/lib/bitcoin";
import { COINBASE_COLOUR, feeColour } from "@/lib/fees";
import {
  formatAmount,
  formatFeeRate,
  formatUsdWhole,
  formatVsize,
  shortId,
} from "@/lib/format";
import { parseKey } from "@/lib/scene-key";
import type { SceneKey } from "@/lib/scene-key";
import { usePrice } from "@/stores/price-store";
import { useViewStore } from "@/stores/view-store";

import { findInCities } from "./city/city-pool";
import { SceneHtml } from "./html-layer";
import { locate } from "./positions";

const Z_RANGE: [number, number] = [60, 50];

const box = new Box3();

const usdOf = (sats: number, price: number | undefined) =>
  price === undefined
    ? undefined
    : formatUsdWhole((sats / SATS_PER_BTC) * price);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-foreground font-medium tabular-nums">{value}</dd>
  </div>
);

const withUsd = (amount: string, usd: string | undefined) =>
  usd === undefined ? amount : `${amount} · ${usd}`;

/** What the card says about a transaction. */
const CardBody = ({ tx }: { tx: TxSummary }) => {
  const usd = usePrice();
  const colour = tx.coinbase ? COINBASE_COLOUR : feeColour(tx.rate);
  return (
    <div className="bg-card/95 ring-foreground/10 w-52 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl p-2.5 text-[11px] shadow-lg ring-1 shadow-black/10 backdrop-blur-md">
      <p className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
        <span
          className="ring-card size-2.5 shrink-0 rounded-full ring-2"
          style={{ backgroundColor: colour }}
        />
        {tx.coinbase ? "Coinbase · miner's reward" : formatFeeRate(tx.rate)}
      </p>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        {tx.coinbase ? null : (
          <Row
            label="Fee"
            value={withUsd(formatAmount(tx.fee), usdOf(tx.fee, usd))}
          />
        )}
        <Row label="Size" value={formatVsize(tx.vsize)} />
        <Row
          label={tx.coinbase ? "Paid out" : "Moves"}
          value={withUsd(formatAmount(tx.value), usdOf(tx.value, usd))}
        />
      </dl>
      <p className="text-muted-foreground/70 mt-1.5 font-mono text-[10px]">
        {shortId(tx.txid, 8, 8)}
      </p>
    </div>
  );
};

/** Follows a transaction's building, its roof's middle. */
const Anchor = ({
  children,
  sceneKey,
}: {
  children: React.ReactNode;
  sceneKey: SceneKey;
}) => {
  const groupRef = useRef<Group>(null);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    group.visible = locate(sceneKey, box);
    if (group.visible) {
      group.position.set(
        (box.min.x + box.max.x) / 2,
        box.max.y,
        (box.min.z + box.max.z) / 2
      );
    }
  });
  return <group ref={groupRef}>{children}</group>;
};

/** A card over the building under the pointer, with what its transaction pays and moves. */
export const HoverCard = () => {
  const hovered = useViewStore((state) => state.hovered);
  const parsed = hovered ? parseKey(hovered) : undefined;
  const tx = parsed?.kind === "tx" ? findInCities(parsed.txid) : undefined;
  if (!hovered || !tx) {
    return null;
  }
  return (
    <Anchor sceneKey={hovered}>
      <SceneHtml pointerEvents="none" zIndexRange={Z_RANGE}>
        <CardBody tx={tx} />
      </SceneHtml>
    </Anchor>
  );
};
