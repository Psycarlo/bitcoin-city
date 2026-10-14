import {
  Bitcoin,
  ChevronDown,
  Gauge,
  Hourglass,
  Layers,
  Minus,
  Network,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useClock } from "@/hooks/use-clock";
import {
  BLOCK_VSIZE,
  PAYMENT_VSIZE,
  SATS_PER_BTC,
  TARGET_BLOCK_TIME,
} from "@/lib/bitcoin";
import {
  formatCompact,
  formatElapsed,
  formatFixed,
  formatHeight,
  formatRate,
  formatSignedPercent,
  formatUsdWhole,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useChainStore, useLastBlockTime, useTip } from "@/stores/chain-store";
import { usePrice, usePriceStore } from "@/stores/price-store";

import { NetworkDetailsView } from "./network-details";
import { Panel } from "./panel";

const PERCENT = 100;

/** Colour of the price as it last moved. */
const TREND_TEXT: Record<-1 | 0 | 1, string> = {
  [-1]: "text-rose-700 dark:text-rose-400",
  0: "",
  1: "text-emerald-700 dark:text-emerald-300",
};

const trendOf = (delta: number): { Icon: LucideIcon; className: string } => {
  if (delta > 0) {
    return {
      Icon: TrendingUp,
      className:
        "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    };
  }
  if (delta < 0) {
    return {
      Icon: TrendingDown,
      className:
        "bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400",
    };
  }
  return {
    Icon: Minus,
    className: "bg-muted-foreground/10 text-muted-foreground",
  };
};

const Chip = ({
  children,
  className = "bg-muted-foreground/10 text-muted-foreground",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium tabular-nums",
      className
    )}
    title={title}
  >
    {children}
  </span>
);

interface StatProps {
  Icon: LucideIcon;
  /** Under the figure, across the stat (a progress bar). */
  bar?: ReactNode;
  chip?: ReactNode;
  label: string;
  title?: string;
  unit?: string;
  /** Undefined while the first figures are on their way. */
  value?: string;
  valueClassName?: string;
}

/** One figure of the strip: what it is, the figure, and a word on it. */
const Stat = ({
  Icon,
  bar,
  chip,
  label,
  title,
  unit,
  value,
  valueClassName,
}: StatProps) => (
  <div
    className="relative flex shrink-0 items-center gap-2.5 px-3.5 py-2 sm:px-4"
    title={title}
  >
    <Icon className="text-primary size-4 shrink-0" />
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] leading-4 font-medium whitespace-nowrap">
        {label}
      </p>
      <div className="flex h-6 items-baseline gap-1.5">
        {value === undefined ? (
          <Skeleton className="h-4 w-14 self-center" />
        ) : (
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight whitespace-nowrap tabular-nums transition-colors duration-500",
              valueClassName
            )}
          >
            {value}
          </span>
        )}
        {unit && value !== undefined ? (
          <span className="text-muted-foreground text-[11px] font-medium">
            {unit}
          </span>
        ) : null}
        {chip}
      </div>
      {bar}
    </div>
  </div>
);

const PriceStat = () => {
  const price = usePrice();
  const ticker = usePriceStore((state) => state.ticker);
  const trend = usePriceStore((state) => state.trend);
  const change = ticker ? trendOf(ticker.changePercent) : undefined;
  return (
    <Stat
      chip={
        ticker && change ? (
          <Chip className={change.className}>
            <change.Icon className="size-3" />
            {formatSignedPercent(ticker.changePercent)}
          </Chip>
        ) : undefined
      }
      Icon={Bitcoin}
      label="Price"
      title={
        ticker
          ? `24h ${formatUsdWhole(ticker.low)} – ${formatUsdWhole(ticker.high)} · BTC/USDT on Binance`
          : "BTC/USDT on Binance"
      }
      value={price === undefined ? undefined : formatUsdWhole(price)}
      valueClassName={TREND_TEXT[trend]}
    />
  );
};

const LastBlockStat = () => {
  const tip = useTip();
  const lastBlock = useLastBlockTime();
  const now = useClock(1000);
  const elapsed = lastBlock === undefined ? 0 : Math.max(0, now - lastBlock);
  return (
    <Stat
      bar={
        <Progress
          aria-label="Time since the last block, against the 10 minute target"
          className="absolute inset-x-4 bottom-1 **:data-[slot=progress-track]:h-0.5"
          value={Math.min(PERCENT, (elapsed / TARGET_BLOCK_TIME) * PERCENT)}
        />
      }
      chip={tip ? <Chip>{formatHeight(tip.height + 1)}</Chip> : undefined}
      Icon={Hourglass}
      label="Since last block"
      value={tip ? formatElapsed(elapsed) : undefined}
    />
  );
};

const FeeStat = () => {
  const fees = useChainStore((state) => state.fees);
  const price = usePrice();
  const paymentUsd =
    fees && price !== undefined
      ? ((fees.fastest * PAYMENT_VSIZE) / SATS_PER_BTC) * price
      : undefined;
  return (
    <Stat
      chip={
        paymentUsd === undefined ? undefined : (
          <Chip title="A simple payment, in the next block">
            {formatUsdWhole(paymentUsd)}
          </Chip>
        )
      }
      Icon={Gauge}
      label="Next block fee"
      title={
        fees ? `Within an hour: ${formatRate(fees.hour)} sat/vB` : undefined
      }
      unit="sat/vB"
      value={fees ? formatRate(fees.fastest) : undefined}
    />
  );
};

const MempoolStat = () => {
  const mempool = useChainStore((state) => state.mempool);
  return (
    <Stat
      chip={
        mempool ? (
          <Chip title="Blocks it would take to clear">
            {formatFixed(mempool.vsize / BLOCK_VSIZE, 1)} blocks
          </Chip>
        ) : undefined
      }
      Icon={Layers}
      label="Mempool"
      unit="txs"
      value={mempool ? formatCompact(mempool.count) : undefined}
    />
  );
};

/** The network at large (hash rate, difficulty, halving, fees), on demand. */
const NetworkMenu = () => (
  <Popover>
    <PopoverTrigger
      render={
        <Button
          className="mr-2 h-9 shrink-0 gap-1.5 rounded-xl px-2.5"
          size="sm"
          variant="ghost"
        />
      }
    >
      <Network className="text-primary" />
      <span className="hidden sm:inline">Network</span>
      <ChevronDown className="text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent
      align="end"
      className="max-h-[min(36rem,calc(100dvh-10rem))] w-96 max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0"
      sideOffset={10}
    >
      <NetworkDetailsView />
    </PopoverContent>
  </Popover>
);

const Divider = () => <span className="bg-border/80 h-8 w-px shrink-0" />;

/** The headline figures in one slim strip: price, last block, fee and mempool. */
export const StatsStrip = ({ className }: { className?: string }) => (
  <Panel
    aria-label="Headline figures"
    className={cn(
      "flex w-fit max-w-full [scrollbar-width:none] items-center overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden",
      className
    )}
  >
    <PriceStat />
    <Divider />
    <LastBlockStat />
    <Divider />
    <FeeStat />
    <Divider />
    <MempoolStat />
    <Divider />
    <NetworkMenu />
  </Panel>
);
