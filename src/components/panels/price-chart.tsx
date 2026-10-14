import { useCallback, useState } from "react";
import type { PointerEvent } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CANDLE_INTERVALS } from "@/data/types";
import type { Candle, CandleInterval } from "@/data/types";
import {
  formatClock,
  formatCompact,
  formatSignedPercent,
  formatUsd,
  formatUsdWhole,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePalette } from "@/scene/palette";
import { usePrice, usePriceStore } from "@/stores/price-store";
import { useViewActions, useViewStore } from "@/stores/view-store";

import { PanelEyebrow } from "./panel";

/** Chart height (px), the volume bars' share of it, and room above and below the prices. */
const HEIGHT = 132;
const VOLUME_SHARE = 0.2;
const PAD_Y = 8;
/** Room for the price axis on the right (px). */
const AXIS = 60;
/** Candles across the chart, at most. */
const SHOWN = 80;
const BODY_SHARE = 0.64;
const RANGE_PAD = 0.04;
const TICKS = 4;

const isInterval = (value: unknown): value is CandleInterval =>
  CANDLE_INTERVALS.includes(value as CandleInterval);

/** A round step that splits `span` into about `count` parts. */
const niceStep = (span: number, count: number) => {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * magnitude)
    .find((candidate) => candidate >= raw);
  return step ?? 10 * magnitude;
};

const useWidth = () => {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry?.contentRect.width ?? 0));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [width, ref] as const;
};

interface ChartProps {
  candles: readonly Candle[];
  hovered?: number;
  onHover: (index?: number) => void;
  price?: number;
  width: number;
}

const Chart = ({ candles, hovered, onHover, price, width }: ChartProps) => {
  const plot = Math.max(0, width - AXIS);
  const pitch = plot / SHOWN;
  const shown = candles.slice(-SHOWN);
  const offset = (SHOWN - shown.length) * pitch;
  const priceBottom = HEIGHT * (1 - VOLUME_SHARE);

  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let volume = 0;
  for (const candle of shown) {
    low = Math.min(low, candle.low);
    high = Math.max(high, candle.high);
    volume = Math.max(volume, candle.volume);
  }
  if (price !== undefined) {
    low = Math.min(low, price);
    high = Math.max(high, price);
  }
  const pad = Math.max(high - low, high * 0.0005) * RANGE_PAD;
  low -= pad;
  high += pad;
  const span = Math.max(high - low, Number.EPSILON);
  const yOf = (value: number) =>
    PAD_Y + (1 - (value - low) / span) * (priceBottom - PAD_Y * 2);
  const xOf = (index: number) => offset + (index + 0.5) * pitch;

  const step = niceStep(high - low, TICKS);
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) {
    ticks.push(tick);
  }
  const body = Math.max(1, pitch * BODY_SHARE);
  const last = price ?? shown.at(-1)?.close;
  const focus = hovered === undefined ? undefined : shown[hovered];

  const palette = usePalette();

  const handleMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - box.left - offset) / pitch);
    onHover(index >= 0 && index < shown.length ? index : undefined);
  };

  const handleLeave = () => {
    onHover();
  };

  return (
    <svg
      aria-label="Price candles"
      className="block touch-none select-none"
      height={HEIGHT}
      onPointerLeave={handleLeave}
      onPointerMove={handleMove}
      width={width}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            className="stroke-border"
            strokeDasharray="2 4"
            x1={0}
            x2={plot}
            y1={yOf(tick)}
            y2={yOf(tick)}
          />
          <text
            className="fill-muted-foreground/80 text-[10px] tabular-nums"
            dominantBaseline="middle"
            x={plot + 6}
            y={yOf(tick)}
          >
            {formatUsdWhole(tick)}
          </text>
        </g>
      ))}
      {focus ? (
        <rect
          className="fill-muted"
          height={HEIGHT}
          width={pitch}
          x={xOf(hovered ?? 0) - pitch / 2}
          y={0}
        />
      ) : null}
      {shown.map((candle, index) => {
        const colour =
          candle.close >= candle.open ? palette.candleUp : palette.candleDown;
        const x = xOf(index);
        const top = yOf(Math.max(candle.open, candle.close));
        const bottom = yOf(Math.min(candle.open, candle.close));
        const bar =
          volume > 0 ? (candle.volume / volume) * HEIGHT * VOLUME_SHARE : 0;
        return (
          <g key={candle.time}>
            <rect
              fill={colour}
              height={bar}
              opacity={0.28}
              width={body}
              x={x - body / 2}
              y={HEIGHT - bar}
            />
            <line
              stroke={colour}
              x1={x}
              x2={x}
              y1={yOf(candle.high)}
              y2={yOf(candle.low)}
            />
            <rect
              fill={colour}
              height={Math.max(1, bottom - top)}
              rx={Math.min(1.5, body / 4)}
              width={body}
              x={x - body / 2}
              y={top}
            />
          </g>
        );
      })}
      {last === undefined ? null : (
        <g>
          <line
            stroke={palette.selection}
            strokeDasharray="4 3"
            x1={0}
            x2={plot}
            y1={yOf(last)}
            y2={yOf(last)}
          />
          <rect
            fill={palette.selection}
            height={16}
            rx={8}
            width={AXIS - 2}
            x={plot + 2}
            y={yOf(last) - 8}
          />
          <text
            className="fill-white text-[10px] font-semibold tabular-nums"
            dominantBaseline="middle"
            textAnchor="middle"
            x={plot + 1 + AXIS / 2}
            y={yOf(last)}
          >
            {formatUsdWhole(last)}
          </text>
        </g>
      )}
    </svg>
  );
};

/** The figures of the candle under the pointer. */
const CandleReadout = ({ candle }: { candle: Candle }) => {
  const up = candle.close >= candle.open;
  const change = ((candle.close - candle.open) / candle.open) * 100;
  const cells = [
    ["O", formatUsd(candle.open)],
    ["H", formatUsd(candle.high)],
    ["L", formatUsd(candle.low)],
    ["C", formatUsd(candle.close)],
  ] as const;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 text-xs tabular-nums">
      <span className="text-muted-foreground">{formatClock(candle.time)}</span>
      {cells.map(([label, value]) => (
        <span key={label}>
          <span className="text-muted-foreground mr-0.5">{label}</span>
          <span className="font-medium">{value}</span>
        </span>
      ))}
      <span
        className={
          up
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-700 dark:text-rose-400"
        }
      >
        {formatSignedPercent(change)}
      </span>
      <span className="text-muted-foreground">
        Vol {formatCompact(candle.volume)} BTC
      </span>
    </p>
  );
};

const Headline = () => {
  const price = usePrice();
  const ticker = usePriceStore((state) => state.ticker);
  return (
    <p className="flex min-w-0 items-baseline gap-2 tabular-nums">
      <span className="text-lg font-semibold tracking-tight">
        {formatUsd(price)}
      </span>
      {ticker ? (
        <span
          className={cn(
            "text-xs font-medium",
            ticker.change >= 0
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-400"
          )}
        >
          {formatSignedPercent(ticker.changePercent)} · 24h
        </span>
      ) : null}
    </p>
  );
};

/**
 * Bitcoin's price in candles of the chosen length, live from Binance. Bare:
 * it sits in a dock.
 */
export const PriceChart = ({ className }: { className?: string }) => {
  const interval = useViewStore((state) => state.interval);
  const { setInterval } = useViewActions();
  const candles = usePriceStore((state) => state.candles[interval]);
  const price = usePrice();
  const [width, widthRef] = useWidth();
  const [hovered, setHovered] = useState<number>();
  const shown = candles?.slice(-SHOWN);
  const focus = hovered === undefined ? undefined : shown?.[hovered];

  const handleInterval = (value: unknown) => {
    if (isInterval(value)) {
      setInterval(value);
      setHovered(undefined);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <div className="flex min-h-8 items-center gap-3">
        <div className="min-w-0 flex-1">
          <PanelEyebrow>BTC / USDT</PanelEyebrow>
          {focus ? <CandleReadout candle={focus} /> : <Headline />}
        </div>
        <Tabs onValueChange={handleInterval} value={interval}>
          <TabsList className="h-8!">
            {CANDLE_INTERVALS.map((option) => (
              <TabsTrigger
                className="px-2.5 text-xs"
                key={option}
                value={option}
              >
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="min-w-0" ref={widthRef} style={{ height: HEIGHT }}>
        {candles && candles.length > 0 && width > 0 ? (
          <Chart
            candles={candles}
            hovered={hovered}
            onHover={setHovered}
            price={price}
            width={width}
          />
        ) : (
          <Skeleton className="size-full rounded-xl" />
        )}
      </div>
    </div>
  );
};
