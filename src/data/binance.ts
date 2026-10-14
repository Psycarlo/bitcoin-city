import { getJson } from "./http";
import {
  isDefined,
  isRecord,
  numberOf,
  optionalNumber,
  parseJson,
} from "./json";
import { CANDLE_INTERVALS } from "./types";
import type { Candle, CandleInterval, Ticker } from "./types";

/** Binance's public market data: Bitcoin against Tether (a dollar stablecoin). */
const SYMBOL = "btcusdt";
const STREAMS = [
  `${SYMBOL}@aggTrade`,
  `${SYMBOL}@ticker`,
  ...CANDLE_INTERVALS.map((interval) => `${SYMBOL}@kline_${interval}`),
].join("/");

/** Tried in turn: the main endpoint first, then the market-data-only mirror (reachable from more places). */
export const BINANCE_SOCKET_URLS = [
  `wss://stream.binance.com:9443/stream?streams=${STREAMS}`,
  `wss://data-stream.binance.vision/stream?streams=${STREAMS}`,
] as const;

const REST_HOSTS = [
  "https://api.binance.com/api/v3",
  "https://data-api.binance.vision/api/v3",
] as const;

const MINUTE = 60_000;

/** Length of each candle interval (ms). */
export const INTERVAL_MS: Record<CandleInterval, number> = {
  "15m": 15 * MINUTE,
  "1h": 60 * MINUTE,
  "1m": MINUTE,
  "5m": 5 * MINUTE,
};

export type PriceMessage =
  | { candle: Candle; interval: CandleInterval; kind: "candle" }
  | { kind: "ticker"; ticker: Ticker }
  | { kind: "trade"; price: number; time: number };

const isInterval = (value: unknown): value is CandleInterval =>
  CANDLE_INTERVALS.includes(value as CandleInterval);

const parsePayload = (
  data: Record<string, unknown>
): PriceMessage | undefined => {
  switch (data.e) {
    case "aggTrade": {
      const price = optionalNumber(data.p);
      return price
        ? { kind: "trade", price, time: numberOf(data.T, Date.now()) }
        : undefined;
    }
    case "24hrTicker": {
      return {
        kind: "ticker",
        ticker: {
          change: numberOf(data.p),
          changePercent: numberOf(data.P),
          high: numberOf(data.h),
          last: numberOf(data.c),
          low: numberOf(data.l),
          open: numberOf(data.o),
          quoteVolume: numberOf(data.q),
          trades: numberOf(data.n),
          volume: numberOf(data.v),
        },
      };
    }
    case "kline": {
      const kline = isRecord(data.k) ? data.k : undefined;
      if (!kline || !isInterval(kline.i)) {
        return;
      }
      return {
        candle: {
          close: numberOf(kline.c),
          high: numberOf(kline.h),
          low: numberOf(kline.l),
          open: numberOf(kline.o),
          time: numberOf(kline.t),
          volume: numberOf(kline.v),
        },
        interval: kline.i,
        kind: "candle",
      };
    }
    default: {
      return undefined;
    }
  }
};

/** Reads a message of the combined stream: `{ stream, data }`. */
export const parseBinanceMessage = (data: unknown) => {
  const envelope = parseJson(data);
  return isRecord(envelope) && isRecord(envelope.data)
    ? parsePayload(envelope.data)
    : undefined;
};

/** A candle as the REST API sends it: `[openTime, open, high, low, close, volume, …]`. */
const parseCandleRow = (row: unknown): Candle | undefined => {
  if (!Array.isArray(row)) {
    return;
  }
  const [time, open, high, low, close, volume] = row as unknown[];
  return {
    close: numberOf(close),
    high: numberOf(high),
    low: numberOf(low),
    open: numberOf(open),
    time: numberOf(time),
    volume: numberOf(volume),
  };
};

/** Candles from the first of the hosts that answers. */
const candlesFrom = async (
  hosts: readonly string[],
  query: string,
  signal?: AbortSignal
): Promise<Candle[]> => {
  const [host, ...others] = hosts;
  if (host === undefined) {
    throw new Error("No host to load candles from");
  }
  try {
    const raw = await getJson(`${host}/klines?${query}`, signal);
    if (!Array.isArray(raw)) {
      throw new TypeError("Candles are not a list");
    }
    return raw.map(parseCandleRow).filter(isDefined);
  } catch (error) {
    // Some regions cannot reach the main host: the next one may answer.
    if (signal?.aborted || others.length === 0) {
      throw error;
    }
    return candlesFrom(others, query, signal);
  }
};

/** The latest candles, oldest first. */
export const fetchCandles = (
  interval: CandleInterval,
  limit: number,
  signal?: AbortSignal
) =>
  candlesFrom(
    REST_HOSTS,
    `symbol=${SYMBOL.toUpperCase()}&interval=${interval}&limit=${limit}`,
    signal
  );
