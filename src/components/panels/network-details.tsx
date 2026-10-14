import { Progress } from "@/components/ui/progress";
import { useClock } from "@/hooks/use-clock";
import {
  PAYMENT_VSIZE,
  SATS_PER_BTC,
  TARGET_BLOCK_TIME,
  halvingOf,
} from "@/lib/bitcoin";
import { feeColour } from "@/lib/fees";
import {
  formatAgo,
  formatBtc,
  formatBytes,
  formatDifficulty,
  formatDuration,
  formatElapsed,
  formatFeeRate,
  formatHashrate,
  formatHeight,
  formatNumber,
  formatPercent,
  formatRate,
  formatSignedPercent,
  formatUsdWhole,
  formatVsize,
} from "@/lib/format";
import { useChainStore, useLastBlockTime, useTip } from "@/stores/chain-store";
import { usePrice } from "@/stores/price-store";
import { useSource } from "@/stores/source-store";

import {
  DetailBody,
  DetailHeader,
  DetailRows,
  DetailTop,
  Section,
  StatTiles,
} from "./detail-parts";
import type { DetailRow } from "./detail-parts";

const PERCENT = 100;

const usdOf = (sats: number, price?: number) =>
  price === undefined
    ? undefined
    : formatUsdWhole((sats / SATS_PER_BTC) * price);

/** A titled bar of how far along something is, with a line on what comes. */
const Milestone = ({
  detail,
  label,
  progress,
  title,
  value,
}: {
  detail?: string;
  label: string;
  /** 0–100. */
  progress: number;
  title: string;
  value: string;
}) => (
  <Section
    action={<span className="text-xs font-medium tabular-nums">{value}</span>}
    title={title}
  >
    <Progress
      aria-label={label}
      className="**:data-[slot=progress-track]:h-1.5"
      value={Math.min(PERCENT, Math.max(0, progress))}
    />
    {detail ? (
      <p className="text-muted-foreground mt-1.5 text-xs tabular-nums">
        {detail}
      </p>
    ) : null}
  </Section>
);

/** The fee to pay for each wait, and what a simple payment costs at it. */
const FeeEstimates = () => {
  const fees = useChainStore((state) => state.fees);
  const price = usePrice();
  if (!fees) {
    return null;
  }
  const payment = (rate: number) =>
    usdOf(rate * PAYMENT_VSIZE, price) ?? "sat/vB";
  return (
    <Section title="Fee to pay, by wait">
      <StatTiles
        className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-2"
        stats={[
          {
            colour: feeColour(fees.fastest),
            hint: payment(fees.fastest),
            label: "Next block",
            value: formatRate(fees.fastest),
          },
          {
            colour: feeColour(fees.halfHour),
            hint: payment(fees.halfHour),
            label: "30 min",
            value: formatRate(fees.halfHour),
          },
          {
            colour: feeColour(fees.hour),
            hint: payment(fees.hour),
            label: "1 hour",
            value: formatRate(fees.hour),
          },
          {
            colour: feeColour(fees.economy),
            hint: payment(fees.economy),
            label: "No hurry",
            value: formatRate(fees.economy),
          },
        ]}
      />
    </Section>
  );
};

/** The network at large: mining, the next milestones, fees and the mempool. */
export const NetworkDetailsView = () => {
  const tip = useTip();
  const lastBlock = useLastBlockTime();
  const hashrate = useChainStore((state) => state.hashrate);
  const difficulty = useChainStore((state) => state.difficulty);
  const mempool = useChainStore((state) => state.mempool);
  const incoming = useChainStore((state) => state.vBytesPerSecond);
  const price = usePrice();
  const { label } = useSource();
  const now = useClock(10_000);
  const halving = tip ? halvingOf(tip.height) : undefined;
  const blockTime = difficulty?.timeAvg ?? TARGET_BLOCK_TIME;

  const rows: DetailRow[] = [
    [
      "Mempool",
      mempool
        ? `${formatNumber(mempool.count)} txs · ${formatVsize(mempool.vsize)}`
        : undefined,
    ],
    [
      "Fees waiting",
      mempool
        ? `${formatBtc(mempool.totalFees)}${price === undefined ? "" : ` · ${usdOf(mempool.totalFees, price)}`}`
        : undefined,
    ],
    [
      "Memory used",
      mempool
        ? `${formatBytes(mempool.usage)} of ${formatBytes(mempool.maxUsage)}`
        : undefined,
    ],
    ["Cheapest accepted", mempool ? formatFeeRate(mempool.minFee) : undefined],
    [
      "Arriving",
      incoming === undefined ? undefined : `${formatNumber(incoming)} vB/s`,
    ],
  ];

  return (
    <>
      <DetailTop>
        <DetailHeader
          eyebrow="Network"
          subtitle={
            tip && lastBlock !== undefined
              ? `Block ${formatHeight(tip.height)} · ${formatAgo(lastBlock, now)}`
              : `Connecting to ${label}…`
          }
          title="Bitcoin"
        />
      </DetailTop>
      <DetailBody>
        <StatTiles
          stats={[
            {
              label: "Hash rate",
              value: hashrate ? formatHashrate(hashrate.current) : undefined,
            },
            {
              label: "Difficulty",
              value: hashrate
                ? formatDifficulty(hashrate.difficulty)
                : undefined,
            },
            {
              hint: "this period",
              label: "Block time",
              value: difficulty ? formatElapsed(difficulty.timeAvg) : undefined,
            },
          ]}
        />
        {difficulty ? (
          <Milestone
            detail={`At block ${formatHeight(difficulty.nextHeight)}, ${formatDuration(difficulty.remainingTime)} from now · last ${formatSignedPercent(difficulty.previousChange)}`}
            label="Progress through the difficulty period"
            progress={difficulty.progress}
            title="Difficulty adjustment"
            value={`${formatSignedPercent(difficulty.change)} expected`}
          />
        ) : null}
        {halving ? (
          <Milestone
            detail={`At block ${formatHeight(halving.next)}, ${formatDuration(halving.remaining * blockTime)} from now · reward to ${formatBtc(halving.subsidyAfter)}`}
            label="Progress through the halving epoch"
            progress={halving.progress * PERCENT}
            title="Next halving"
            value={`${formatNumber(halving.remaining)} blocks · ${formatPercent(halving.progress * PERCENT, 0)}`}
          />
        ) : null}
        <FeeEstimates />
        <DetailRows rows={rows} />
      </DetailBody>
    </>
  );
};
