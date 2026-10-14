import {
  Bitcoin,
  Gauge,
  Hourglass,
  Layers,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
  formatNumber,
  formatRate,
  formatSignedPercent,
  formatUsdWhole,
  formatVsize,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useChainStore, useLastBlockTime, useTip } from "@/stores/chain-store";
import { usePrice, usePriceStore } from "@/stores/price-store";

import { Panel } from "./panel";

const PERCENT = 100;

/** Colour of the price as it last moved. */
const TREND_TEXT: Record<-1 | 0 | 1, string> = {
  [-1]: "text-rose-700",
  0: "",
  1: "text-emerald-700",
};

interface Trend {
  Icon: LucideIcon;
  className: string;
}

const trendOf = (delta: number): Trend => {
  if (delta > 0) {
    return {
      Icon: TrendingUp,
      className: "bg-emerald-500/12 text-emerald-700",
    };
  }
  if (delta < 0) {
    return { Icon: TrendingDown, className: "bg-rose-500/10 text-rose-700" };
  }
  return { Icon: Minus, className: "bg-slate-500/10 text-slate-600" };
};

const Chip = ({
  children,
  className = "bg-slate-500/10 text-slate-600",
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

interface KpiCardProps {
  Icon: LucideIcon;
  chip?: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Title on phones, where three cards share one row. */
  shortTitle?: string;
  subtitle?: string;
  title: string;
  unit?: string;
  /** Undefined while the first figures are on their way. */
  value?: string;
  valueClassName?: string;
}

const KpiCard = ({
  Icon,
  chip,
  className,
  footer,
  shortTitle,
  subtitle,
  title,
  unit,
  value,
  valueClassName,
}: KpiCardProps) => (
  <Panel className={cn("flex min-w-0 items-start gap-3 p-3 sm:p-4", className)}>
    <span className="bg-primary/10 text-primary hidden size-10 shrink-0 items-center justify-center rounded-xl min-[1800px]:flex">
      <Icon className="size-5" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex h-5 items-center justify-between gap-2">
        <h2 className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Icon className="text-primary size-3.5 shrink-0 min-[1800px]:hidden" />
          <span className="truncate sm:hidden">{shortTitle ?? title}</span>
          <span className="hidden truncate sm:inline">{title}</span>
        </h2>
        {chip ? <span className="hidden xl:contents">{chip}</span> : null}
      </div>
      <div className="mt-1 flex h-7 items-baseline gap-1 sm:h-8">
        {value === undefined ? (
          <Skeleton className="h-6 w-16 self-center sm:h-7" />
        ) : (
          <span
            className={cn(
              "truncate text-lg font-semibold tracking-tight tabular-nums transition-colors duration-500 sm:text-2xl",
              valueClassName
            )}
          >
            {value}
          </span>
        )}
        {unit && value !== undefined ? (
          <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
            {unit}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="text-muted-foreground hidden truncate text-xs sm:block">
          {subtitle}
        </p>
      ) : null}
      {footer}
    </div>
  </Panel>
);

const PriceCard = () => {
  const price = usePrice();
  const ticker = usePriceStore((state) => state.ticker);
  const trend = usePriceStore((state) => state.trend);
  const change = ticker ? trendOf(ticker.changePercent) : undefined;
  return (
    <KpiCard
      chip={
        ticker && change ? (
          <Chip className={change.className} title="Over the last 24 hours">
            <change.Icon className="size-3" />
            {formatSignedPercent(ticker.changePercent)}
          </Chip>
        ) : undefined
      }
      Icon={Bitcoin}
      shortTitle="Price"
      subtitle={
        ticker
          ? `24h ${formatUsdWhole(ticker.low)} – ${formatUsdWhole(ticker.high)}`
          : "BTC/USDT on Binance"
      }
      title="Bitcoin price"
      value={price === undefined ? undefined : formatUsdWhole(price)}
      valueClassName={TREND_TEXT[trend]}
    />
  );
};

const NextBlockCard = () => {
  const tip = useTip();
  const lastBlock = useLastBlockTime();
  const waiting = useChainStore((state) => state.nextBlock.txs.size);
  const now = useClock(1000);
  const elapsed = lastBlock === undefined ? 0 : Math.max(0, now - lastBlock);
  return (
    <KpiCard
      chip={tip ? <Chip>{formatHeight(tip.height + 1)}</Chip> : undefined}
      footer={
        <Progress
          aria-label="Time since the last block, against the 10 minute target"
          className="mt-2 **:data-[slot=progress-track]:h-1.5"
          value={Math.min(PERCENT, (elapsed / TARGET_BLOCK_TIME) * PERCENT)}
        />
      }
      Icon={Hourglass}
      shortTitle="Last block"
      subtitle={
        waiting > 0
          ? `${formatNumber(waiting)} transactions lined up`
          : "Waiting for the next block"
      }
      title="Since last block"
      value={tip ? formatElapsed(elapsed) : undefined}
    />
  );
};

const FeeCard = () => {
  const fees = useChainStore((state) => state.fees);
  const price = usePrice();
  const paymentUsd =
    fees && price !== undefined
      ? ((fees.fastest * PAYMENT_VSIZE) / SATS_PER_BTC) * price
      : undefined;
  return (
    <KpiCard
      chip={
        fees ? (
          <Chip title="To be mined within an hour">
            1 h · {formatRate(fees.hour)}
          </Chip>
        ) : undefined
      }
      Icon={Gauge}
      shortTitle="Fee"
      subtitle={
        paymentUsd === undefined
          ? "For the next block"
          : `${formatUsdWhole(paymentUsd)} for a simple payment`
      }
      title="Next block fee"
      unit="sat/vB"
      value={fees ? formatRate(fees.fastest) : undefined}
    />
  );
};

const MempoolCard = ({ className }: { className?: string }) => {
  const mempool = useChainStore((state) => state.mempool);
  const incoming = useChainStore((state) => state.vBytesPerSecond);
  return (
    <KpiCard
      chip={
        incoming === undefined ? undefined : (
          <Chip title="New transactions coming in">
            +{formatNumber(incoming)} vB/s
          </Chip>
        )
      }
      className={className}
      Icon={Layers}
      shortTitle="Mempool"
      subtitle={
        mempool
          ? `${formatVsize(mempool.vsize)} · ${formatFixed(mempool.vsize / BLOCK_VSIZE, 1)} blocks deep`
          : undefined
      }
      title="Mempool"
      unit="txs"
      value={mempool ? formatCompact(mempool.count) : undefined}
    />
  );
};

/** The headline figures: price, time since the last block, fees and the mempool. */
export const KpiCards = ({ className }: { className?: string }) => (
  <div
    className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3", className)}
  >
    <PriceCard />
    <NextBlockCard />
    <FeeCard />
    <MempoolCard className="hidden sm:flex" />
  </div>
);
