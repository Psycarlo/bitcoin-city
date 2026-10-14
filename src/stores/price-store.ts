import { create } from "zustand";

import { INTERVAL_MS } from "@/data/binance";
import type { PriceMessage } from "@/data/binance";
import type { Candle, CandleInterval, FeedStatus, Ticker } from "@/data/types";
import { CANDLE_INTERVALS } from "@/data/types";

import { useChainStore } from "./chain-store";

/** Candles kept per interval. */
export const KEEP_CANDLES = 120;

export interface PriceData {
  candles: Readonly<Partial<Record<CandleInterval, readonly Candle[]>>>;
  /** The latest trade. */
  last?: { price: number; time: number };
  status: FeedStatus;
  ticker?: Ticker;
  /** Way the price last moved: 1 up, −1 down, 0 not yet. */
  trend: -1 | 0 | 1;
}

const INITIAL_PRICE: PriceData = {
  candles: {},
  status: "connecting",
  trend: 0,
};

/** Candles with one updated (the latest) or added (a new one). */
export const mergeCandle = (
  candles: readonly Candle[],
  candle: Candle,
  keep = KEEP_CANDLES
): readonly Candle[] => {
  const last = candles.at(-1);
  if (!last || candle.time > last.time) {
    return [...candles, candle].slice(-keep);
  }
  if (candle.time === last.time) {
    return [...candles.slice(0, -1), candle];
  }
  // Older than the latest: settled already.
  return candles;
};

/** Moves the latest candle with a trade, between the exchange's own candle updates. */
export const tradeIntoCandles = (
  candles: readonly Candle[],
  price: number,
  time: number,
  length: number
): readonly Candle[] => {
  const last = candles.at(-1);
  if (!last || time < last.time || time >= last.time + length) {
    return candles;
  }
  return [
    ...candles.slice(0, -1),
    {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    },
  ];
};

/** History from the REST API, with the live candles that came before it on top. */
export const withHistory = (
  live: readonly Candle[] | undefined,
  history: readonly Candle[]
) => {
  let merged: readonly Candle[] = history.slice(-KEEP_CANDLES);
  for (const candle of live ?? []) {
    merged = mergeCandle(merged, candle);
  }
  return merged;
};

const trendOf = (
  previous: number | undefined,
  price: number,
  trend: PriceData["trend"]
): PriceData["trend"] => {
  if (previous === undefined || price === previous) {
    return trend;
  }
  return price > previous ? 1 : -1;
};

/** The price after a batch of messages from the exchange. */
export const applyPriceMessages = (
  state: PriceData,
  messages: readonly PriceMessage[]
): PriceData => {
  // Copied once, then each list replaced as messages come.
  const candles: Partial<Record<CandleInterval, readonly Candle[]>> = {
    ...state.candles,
  };
  let { last, ticker, trend } = state;
  for (const message of messages) {
    switch (message.kind) {
      case "candle": {
        candles[message.interval] = mergeCandle(
          candles[message.interval] ?? [],
          message.candle
        );
        break;
      }
      case "ticker": {
        ({ ticker } = message);
        break;
      }
      case "trade": {
        const { price, time } = message;
        trend = trendOf(last?.price, price, trend);
        last = { price, time };
        for (const interval of CANDLE_INTERVALS) {
          const list = candles[interval];
          if (list) {
            candles[interval] = tradeIntoCandles(
              list,
              price,
              time,
              INTERVAL_MS[interval]
            );
          }
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  return { ...state, candles, last, ticker, trend };
};

interface PriceActions {
  apply: (messages: readonly PriceMessage[]) => void;
  reset: () => void;
  setHistory: (interval: CandleInterval, history: readonly Candle[]) => void;
  setStatus: (status: FeedStatus) => void;
}

interface PriceStore extends PriceData {
  actions: PriceActions;
}

export const usePriceStore = create<PriceStore>()((set) => ({
  ...INITIAL_PRICE,
  actions: {
    apply: (messages) => {
      set((state) => applyPriceMessages(state, messages));
    },
    reset: () => {
      set(INITIAL_PRICE);
    },
    setHistory: (interval, history) => {
      set((state) => ({
        candles: {
          ...state.candles,
          [interval]: withHistory(state.candles[interval], history),
        },
      }));
    },
    setStatus: (status) => {
      set({ status });
    },
  },
}));

export const usePriceActions = () => usePriceStore((state) => state.actions);

/** The latest price: Binance's last trade, else mempool.space's figure. */
export const usePrice = () => {
  const price = usePriceStore((state) => state.last?.price);
  const fallback = useChainStore((state) => state.usd);
  return price ?? fallback;
};
