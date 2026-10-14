import { Building2, CircleAlert } from "lucide-react";
import { useMemo } from "react";

import { mempoolLinks } from "@/data/mempool";
import type { Block, TxSummary } from "@/data/types";
import { useClock } from "@/hooks/use-clock";
import type { Selection } from "@/hooks/use-selection";
import { BLOCK_VSIZE, SATS_PER_BTC, subsidyAt } from "@/lib/bitcoin";
import { feeColour } from "@/lib/fees";
import {
  formatAgo,
  formatAmount,
  formatBtc,
  formatBytes,
  formatDateTime,
  formatFeeRate,
  formatHeight,
  formatNumber,
  formatPercent,
  formatRate,
  formatUsdWhole,
  formatWeight,
  shortId,
} from "@/lib/format";
import { blockKey, txKey } from "@/lib/scene-key";
import { cn } from "@/lib/utils";
import { CONFIRMED_SHOWN } from "@/scene/slots";
import { useChainStore, useTip } from "@/stores/chain-store";
import { usePrice } from "@/stores/price-store";
import { show } from "@/stores/selection";
import { useSummary } from "@/stores/summary-store";
import { useViewActions, useViewStore } from "@/stores/view-store";

import {
  CloseAction,
  ColourDot,
  DetailBody,
  DetailHeader,
  DetailRows,
  DetailTop,
  FeeRange,
  FocusAction,
  LinkAction,
  LoadingRows,
  MonoBox,
  Note,
  Section,
  StatTiles,
  Status,
} from "./detail-parts";
import type { DetailRow } from "./detail-parts";

type BlockSelection = Extract<Selection, { kind: "block" }>;

/** Transactions listed among those that paid the most. */
const TOP_PAYERS = 5;
/** Weight of a full block: four units per virtual byte. */
const FULL_WEIGHT = BLOCK_VSIZE * 4;

const usdOf = (sats: number, price?: number) =>
  price === undefined
    ? undefined
    : formatUsdWhole((sats / SATS_PER_BTC) * price);

const withUsd = (amount: string, usd?: string) =>
  usd === undefined ? amount : `${amount} · ${usd}`;

const blockRows = (block: Block, price?: number): DetailRow[] => {
  const subsidy = subsidyAt(block.height);
  return [
    ["Reward", withUsd(formatBtc(block.reward), usdOf(block.reward, price))],
    ["New coins", formatBtc(subsidy)],
    ["Average fee rate", formatFeeRate(block.avgFeeRate)],
    [
      "Moved",
      block.totalOut === undefined ? undefined : formatBtc(block.totalOut),
    ],
    ["Size", formatBytes(block.size)],
    ["Weight", formatWeight(block.weight)],
    ["Mined", formatDateTime(block.time)],
    [
      "Template match",
      block.matchRate === undefined
        ? undefined
        : formatPercent(block.matchRate),
    ],
  ];
};

/** One of the block's transactions, picked from the list. */
const PayerRow = ({ tx }: { tx: TxSummary }) => {
  const key = txKey(tx.txid);
  const selected = useViewStore((state) => state.selected === key);
  const { hover, unhover } = useViewActions();
  const handleClick = () => {
    show(key);
  };
  const handleEnter = () => {
    hover(key);
  };
  const handleLeave = () => {
    unhover(key);
  };
  return (
    <li>
      <button
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors outline-none hover:bg-white focus-visible:bg-white",
          selected && "bg-white"
        )}
        onBlur={handleLeave}
        onClick={handleClick}
        onFocus={handleEnter}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        type="button"
      >
        <ColourDot colour={feeColour(tx.rate)} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">
          {shortId(tx.txid, 8, 8)}
        </span>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatRate(tx.rate)} sat/vB
        </span>
        <span className="w-24 shrink-0 text-right font-medium tabular-nums">
          {formatAmount(tx.fee)}
        </span>
      </button>
    </li>
  );
};

/** The transactions that paid the most, to jump to their buildings. */
const TopPayers = ({ txs }: { txs: readonly TxSummary[] }) => {
  const top = useMemo(
    () =>
      txs
        .filter((tx) => !tx.coinbase)
        .toSorted((a, b) => b.fee - a.fee)
        .slice(0, TOP_PAYERS),
    [txs]
  );
  if (top.length === 0) {
    return null;
  }
  return (
    <Section title="Biggest fees">
      <ul className="flex flex-col rounded-xl bg-slate-50 p-1 ring-1 ring-slate-100">
        {top.map((tx) => (
          <PayerRow key={tx.txid} tx={tx} />
        ))}
      </ul>
    </Section>
  );
};

/** Whether the block stands in the city (picked, even a sealed one opens). */
const cityNote = (place: number, loaded: number | undefined) => {
  if (place < 0 || place >= CONFIRMED_SHOWN) {
    return {
      Icon: CircleAlert,
      text: `Only the latest ${formatNumber(CONFIRMED_SHOWN)} blocks stand in the city.`,
    };
  }
  if (loaded === undefined) {
    return { Icon: Building2, text: "Loading its transactions into the city…" };
  }
  return {
    Icon: Building2,
    text: `Its city has ${formatNumber(loaded)} buildings, one per transaction: as wide as its size, as tall and as warm as its fee rate.`,
  };
};

/** One mined block: who mined it, what it paid and what it held. */
export const BlockDetailsView = ({
  selection,
}: {
  selection: BlockSelection;
}) => {
  const { block, error, hash, loading } = selection;
  const tip = useTip();
  const price = usePrice();
  const now = useClock(10_000);
  const place = useChainStore((state) =>
    state.blocks.findIndex((item) => item.id === hash)
  );
  // When this page saw it arrive, if it did: truer than its miner's clock.
  const arrived = useChainStore((state) => state.arrivals[hash]);
  const txs = useSummary(hash);
  const confirmations =
    block && tip ? Math.max(1, tip.height - block.height + 1) : undefined;
  const note = cityNote(place, txs?.length);

  return (
    <>
      <DetailTop>
        <DetailHeader
          actions={
            <>
              <FocusAction sceneKey={blockKey(hash)} />
              <LinkAction
                href={mempoolLinks.block(hash)}
                label="Open on mempool.space"
              />
              <CloseAction />
            </>
          }
          eyebrow="Block"
          subtitle={
            block
              ? `${block.pool?.name ?? "Unknown miner"} · ${formatAgo(arrived ?? block.time, now)}`
              : undefined
          }
          title={block ? formatHeight(block.height) : shortId(hash, 8, 8)}
        />
        {confirmations === undefined ? null : (
          <Status
            description={
              confirmations === 1
                ? "The newest block on the chain."
                : `${formatNumber(confirmations - 1)} more ${confirmations === 2 ? "block" : "blocks"} on top of it.`
            }
            tone="green"
          >
            {formatNumber(confirmations)}{" "}
            {confirmations === 1 ? "confirmation" : "confirmations"}
          </Status>
        )}
      </DetailTop>
      <DetailBody>
        {loading ? <LoadingRows /> : null}
        {error !== undefined && !block ? (
          <Note Icon={CircleAlert}>
            Could not load this block from mempool.space.
          </Note>
        ) : null}
        {block ? (
          <>
            <StatTiles
              stats={[
                {
                  hint: `${formatPercent((block.weight / FULL_WEIGHT) * 100, 0)} full`,
                  label: "Transactions",
                  value: formatNumber(block.txCount),
                },
                {
                  colour: feeColour(block.medianFee),
                  hint: "sat/vB",
                  label: "Median fee",
                  value: formatRate(block.medianFee),
                },
                {
                  hint: usdOf(block.totalFees, price),
                  label: "Fees",
                  value: formatBtc(block.totalFees),
                },
              ]}
            />
            <FeeRange feeRange={block.feeRange} median={block.medianFee} />
            <DetailRows rows={blockRows(block, price)} />
          </>
        ) : null}
        {txs ? <TopPayers txs={txs} /> : null}
        <Section title="Block hash">
          <MonoBox>{hash}</MonoBox>
        </Section>
        <Note Icon={note.Icon}>{note.text}</Note>
      </DetailBody>
    </>
  );
};
