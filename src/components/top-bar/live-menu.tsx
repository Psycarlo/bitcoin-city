import {
  Blocks,
  ChartCandlestick,
  ChevronDown,
  RadioTower,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FeedStatus } from "@/data/types";
import { formatHeight, formatUsd } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/tone";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { useChainStore, useTip } from "@/stores/chain-store";
import { usePriceStore } from "@/stores/price-store";

type Signal = "down" | "ok" | "waiting";

interface SignalInfo {
  dot: string;
  label: string;
  /** Colours of the pill. */
  pill: string;
}

const SIGNALS: Record<Signal, SignalInfo> = {
  down: {
    dot: "bg-slate-400",
    label: "Offline",
    pill: "border-slate-600/15 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-800",
  },
  ok: {
    dot: "bg-current",
    label: "Live",
    pill: "border-emerald-600/15 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800",
  },
  waiting: {
    dot: "bg-amber-500",
    label: "Connecting",
    pill: "border-amber-600/15 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800",
  },
};

const FEED_STATUS: Record<FeedStatus, { label: string; tone: Tone }> = {
  closed: { label: "Offline", tone: "red" },
  connecting: { label: "Connecting", tone: "amber" },
  open: { label: "Live", tone: "green" },
  reconnecting: { label: "Reconnecting", tone: "amber" },
};

/** All feeds open is live, all closed is offline; anything else is on its way. */
const signalOf = (statuses: readonly FeedStatus[]): Signal => {
  if (statuses.every((status) => status === "open")) {
    return "ok";
  }
  return statuses.every((status) => status === "closed") ? "down" : "waiting";
};

const labelOf = (signal: Signal, statuses: readonly FeedStatus[]) =>
  signal === "waiting" && statuses.includes("reconnecting")
    ? "Reconnecting"
    : SIGNALS[signal].label;

const StatusDot = ({ signal }: { signal: Signal }) => (
  <span className="relative flex size-2">
    {signal === "ok" ? (
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
    ) : null}
    <span
      className={cn(
        "relative inline-flex size-2 rounded-full",
        SIGNALS[signal].dot
      )}
    />
  </span>
);

interface SourceProps {
  Icon: LucideIcon;
  detail: string;
  href: string;
  name: string;
  status: FeedStatus;
}

/** One feed: where it comes from, what it brings and whether it is up. */
const Source = ({ detail, href, Icon, name, status }: SourceProps) => {
  const { label, tone } = FEED_STATUS[status];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <a
          className="block truncate text-sm font-medium hover:underline"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {name}
        </a>
        <span className="text-muted-foreground block truncate text-xs tabular-nums">
          {detail}
        </span>
      </span>
      <Badge className={cn("shrink-0 gap-1.5", TONE_CLASSES[tone].badge)}>
        <span className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} />
        {label}
      </Badge>
    </li>
  );
};

/** Whether the live feeds are up, and what each one brings. */
export const LiveMenu = () => {
  const chain = useChainStore((state) => state.status);
  const price = usePriceStore((state) => state.status);
  const last = usePriceStore((state) => state.last?.price);
  const tip = useTip();
  const statuses = [chain, price];
  const signal = signalOf(statuses);
  const label = labelOf(signal, statuses);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Live data: ${label}`}
            className={cn(
              "h-10 gap-2 rounded-full px-3 sm:px-3.5",
              SIGNALS[signal].pill
            )}
            variant="outline"
          />
        }
      >
        <StatusDot signal={signal} />
        <RadioTower className="sm:hidden" />
        <span className="sr-only font-semibold sm:not-sr-only">{label}</span>
        {tip ? (
          <span className="hidden tabular-nums opacity-80 md:inline">
            {formatHeight(tip.height)}
          </span>
        ) : null}
        <ChevronDown className="hidden opacity-60 sm:block" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] gap-1"
        sideOffset={8}
      >
        <PopoverHeader>
          <PopoverTitle>Live data</PopoverTitle>
          <PopoverDescription>
            Streamed from public APIs as it happens. Feeds that drop reconnect
            on their own.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="divide-y divide-slate-100">
          <Source
            detail={
              tip
                ? `Blocks, mempool and fees · ${formatHeight(tip.height)}`
                : "Blocks, mempool and fees"
            }
            href="https://mempool.space"
            Icon={Blocks}
            name="mempool.space"
            status={chain}
          />
          <Source
            detail={
              last === undefined
                ? "BTC/USDT trades"
                : `BTC/USDT trades · ${formatUsd(last)}`
            }
            href="https://www.binance.com/en/trade/BTC_USDT"
            Icon={ChartCandlestick}
            name="Binance"
            status={price}
          />
        </ul>
      </PopoverContent>
    </Popover>
  );
};
