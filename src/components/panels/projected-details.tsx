import { Building2, Layers } from "lucide-react";

import type { ProjectedBlock } from "@/data/types";
import { useClock } from "@/hooks/use-clock";
import { BLOCK_VSIZE, SATS_PER_BTC } from "@/lib/bitcoin";
import { feeColour } from "@/lib/fees";
import {
  formatBtc,
  formatElapsed,
  formatFeeRate,
  formatHeight,
  formatNumber,
  formatRate,
  formatUsdWhole,
  formatVsize,
} from "@/lib/format";
import { projectedKey } from "@/lib/scene-key";
import type { Tone } from "@/lib/tone";
import { PROJECTED_SHOWN } from "@/scene/slots";
import { useChainStore, useLastBlockTime, useTip } from "@/stores/chain-store";
import { usePrice } from "@/stores/price-store";

import {
  CloseAction,
  DetailBody,
  DetailHeader,
  DetailRows,
  DetailTop,
  FeeRange,
  FocusAction,
  Note,
  StatTiles,
  Status,
} from "./detail-parts";
import type { DetailRow, Stat } from "./detail-parts";

/** Projected blocks shown on their own, the next one included; the rest is the backlog. */
const QUEUED = PROJECTED_SHOWN + 1;
const MINUTES_PER_BLOCK = 10;

const usdOf = (sats: number, price?: number) =>
  price === undefined
    ? undefined
    : formatUsdWhole((sats / SATS_PER_BTC) * price);

/** The figures shown for a projected block, or for the backlog summed. */
interface Figures {
  feeRange: readonly number[];
  fees?: number;
  txs?: number;
  vsize?: number;
}

const figuresOf = (block?: ProjectedBlock): Figures =>
  block
    ? {
        feeRange: block.feeRange,
        fees: block.totalFees,
        txs: block.txCount,
        vsize: block.vsize,
      }
    : { feeRange: [] };

/** The blocks of the backlog, summed into one. */
const sumBlocks = (blocks: readonly ProjectedBlock[]): Figures => {
  let fees = 0;
  let txs = 0;
  let vsize = 0;
  for (const block of blocks) {
    fees += block.totalFees;
    txs += block.txCount;
    vsize += block.vsize;
  }
  const cheapest = blocks.at(-1)?.feeRange[0];
  const dearest = blocks[0]?.feeRange.at(-1);
  return {
    feeRange:
      cheapest === undefined || dearest === undefined
        ? []
        : [cheapest, dearest],
    fees,
    txs,
    vsize,
  };
};

const projectedStats = (
  { feeRange, fees, txs, vsize }: Figures,
  block: ProjectedBlock | undefined,
  price: number | undefined
): Stat[] => {
  const [from] = feeRange;
  return [
    {
      hint: vsize === undefined ? undefined : formatVsize(vsize),
      label: "Transactions",
      value: txs === undefined ? undefined : formatNumber(txs),
    },
    block
      ? {
          colour: feeColour(block.medianFee),
          hint: "sat/vB",
          label: "Median fee",
          value: formatRate(block.medianFee),
        }
      : {
          colour: from === undefined ? undefined : feeColour(from),
          hint: "sat/vB",
          label: "From",
          value: from === undefined ? undefined : formatRate(from),
        },
    {
      hint: fees === undefined ? undefined : usdOf(fees, price),
      label: "Fees",
      value: fees === undefined ? undefined : formatBtc(fees),
    },
  ];
};

interface RowContext {
  /** When the newest block was found (ms). */
  lastBlock?: number;
  minFee?: number;
  now: number;
}

const projectedRows = (
  index: number,
  { vsize }: Figures,
  { lastBlock, minFee, now }: RowContext
): DetailRow[] => {
  const backlog = index >= QUEUED;
  const deep = vsize === undefined ? 0 : Math.ceil(vsize / BLOCK_VSIZE);
  return [
    [
      "Since last block",
      index === 0 && lastBlock !== undefined
        ? formatElapsed(Math.max(0, now - lastBlock))
        : undefined,
    ],
    [
      "Blocks deep",
      backlog && deep > 0
        ? `${formatNumber(deep)} · ~${formatNumber(deep * MINUTES_PER_BLOCK)} min`
        : undefined,
    ],
    [
      "Mempool takes from",
      backlog && minFee !== undefined ? formatFeeRate(minFee) : undefined,
    ],
  ];
};

interface Copy {
  description: string;
  eyebrow: string;
  label: string;
  title: string;
  tone: Tone;
}

const copyOf = (index: number, height?: number): Copy => {
  const at = (offset: number) =>
    height === undefined ? undefined : formatHeight(height + offset);
  if (index === 0) {
    return {
      description:
        "What miners are most likely working on: the mempool's best-paying transactions, as mempool.space sees it.",
      eyebrow: "Mining now",
      label: "Next block",
      title: at(1) ?? "Next block",
      tone: "amber",
    };
  }
  if (index < QUEUED) {
    return {
      description: `Would fill block ${at(index + 1) ?? `+${index + 1}`}, unless better-paying transactions turn up first.`,
      eyebrow: "Mempool",
      label: "Waiting",
      title: `In ~${(index + 1) * MINUTES_PER_BLOCK} min`,
      tone: "blue",
    };
  }
  return {
    description:
      "Paying too little for the next few blocks. These wait for quieter times, or drop out when the mempool fills up.",
    eyebrow: "Mempool",
    label: "Backlog",
    title: "Backlog",
    tone: "slate",
  };
};

const NextBlockNote = () => {
  const tracked = useChainStore((state) => state.nextBlock.txs.size);
  return (
    <Note Icon={Building2}>
      {formatNumber(tracked)} buildings stand on its plot, one per transaction.
      They rise as transactions arrive and leave with the block when it is
      found.
    </Note>
  );
};

/** A block the mempool would fill: the next one, a later one, or the backlog. */
export const ProjectedDetailsView = ({ index }: { index: number }) => {
  const tip = useTip();
  const lastBlock = useLastBlockTime();
  const projected = useChainStore((state) => state.projected);
  const minFee = useChainStore((state) => state.mempool?.minFee);
  const price = usePrice();
  // Only the next block's view shows a running clock.
  const now = useClock(index === 0 ? 1000 : 60_000);
  const backlog = index >= QUEUED;
  const place = backlog ? QUEUED : index;
  const block = backlog ? undefined : projected[index];
  const figures = backlog
    ? sumBlocks(projected.slice(QUEUED))
    : figuresOf(block);
  const copy = copyOf(place, tip?.height);
  const rows = projectedRows(index, figures, {
    lastBlock,
    minFee,
    now,
  });

  return (
    <>
      <DetailTop>
        <DetailHeader
          actions={
            <>
              <FocusAction sceneKey={projectedKey(place)} />
              <CloseAction />
            </>
          }
          eyebrow={copy.eyebrow}
          subtitle={
            figures.txs === undefined
              ? "The mempool is empty"
              : `${formatNumber(figures.txs)} transactions waiting`
          }
          title={copy.title}
        />
        <Status description={copy.description} tone={copy.tone}>
          {copy.label}
        </Status>
      </DetailTop>
      <DetailBody>
        <StatTiles stats={projectedStats(figures, block, price)} />
        <FeeRange feeRange={figures.feeRange} median={block?.medianFee} />
        <DetailRows rows={rows} />
        {index === 0 ? <NextBlockNote /> : null}
        {index > 0 ? (
          <Note Icon={Layers}>
            {backlog
              ? "The stack of slabs at the front of the table: one per block's worth, the best-paying on top."
              : "A glass block on the path: it fills with the mempool and grows as more transactions pay enough to make it in."}
          </Note>
        ) : null}
      </DetailBody>
    </>
  );
};
