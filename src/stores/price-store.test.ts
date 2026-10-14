import { describe, expect, test } from "bun:test";

import type { Candle } from "@/data/types";

import {
  applyPriceMessages,
  KEEP_CANDLES,
  mergeCandle,
  tradeIntoCandles,
  withHistory,
} from "./price-store";
import type { PriceData } from "./price-store";

const MINUTE = 60_000;

const candle = (time: number, close: number): Candle => ({
  close,
  high: close,
  low: close,
  open: close,
  time,
  volume: 1,
});

const closes = (candles: readonly Candle[]) =>
  candles.map((item) => item.close);

const idle: PriceData = { candles: {}, status: "open", trend: 0 };

describe("mergeCandle", () => {
  test("adds a newer candle", () => {
    const merged = mergeCandle([candle(0, 1)], candle(MINUTE, 2));
    expect(closes(merged)).toEqual([1, 2]);
  });

  test("updates the latest candle", () => {
    const merged = mergeCandle(
      [candle(0, 1), candle(MINUTE, 2)],
      candle(MINUTE, 3)
    );
    expect(closes(merged)).toEqual([1, 3]);
  });

  test("ignores a candle older than the latest", () => {
    const candles = [candle(0, 1), candle(MINUTE, 2)];
    expect(mergeCandle(candles, candle(0, 9))).toBe(candles);
  });

  test("keeps only the latest few", () => {
    const merged = mergeCandle(
      [candle(0, 1), candle(MINUTE, 2)],
      candle(2 * MINUTE, 3),
      2
    );
    expect(closes(merged)).toEqual([2, 3]);
  });
});

describe("tradeIntoCandles", () => {
  const candles = [candle(0, 100), candle(MINUTE, 100)];

  test("moves the latest candle with a trade inside it", () => {
    const up = tradeIntoCandles(candles, 110, MINUTE + 5000, MINUTE);
    expect(up.at(-1)).toMatchObject({ close: 110, high: 110, low: 100 });
    const down = tradeIntoCandles(up, 90, MINUTE + 9000, MINUTE);
    expect(down.at(-1)).toMatchObject({ close: 90, high: 110, low: 90 });
    expect(down[0]).toBe(candles[0]);
  });

  test("leaves trades outside the latest candle to the exchange's update", () => {
    expect(tradeIntoCandles(candles, 120, 2 * MINUTE, MINUTE)).toBe(candles);
    expect(tradeIntoCandles(candles, 120, MINUTE - 1, MINUTE)).toBe(candles);
    expect(tradeIntoCandles([], 120, 0, MINUTE)).toEqual([]);
  });
});

describe("withHistory", () => {
  test("puts the live candles on top of the history", () => {
    const history = [candle(0, 1), candle(MINUTE, 2)];
    const live = [candle(MINUTE, 5), candle(2 * MINUTE, 6)];
    expect(closes(withHistory(live, history))).toEqual([1, 5, 6]);
  });

  test("keeps at most the candles kept", () => {
    const history = Array.from({ length: KEEP_CANDLES + 10 }, (_, index) =>
      candle(index * MINUTE, index)
    );
    const merged = withHistory(undefined, history);
    expect(merged).toHaveLength(KEEP_CANDLES);
    expect(merged.at(-1)?.close).toBe(KEEP_CANDLES + 9);
  });
});

describe("applyPriceMessages", () => {
  test("follows trades: the last price, its trend and the latest candles", () => {
    const state: PriceData = {
      ...idle,
      candles: { "1m": [candle(0, 100)], "5m": [candle(0, 100)] },
    };
    const next = applyPriceMessages(state, [
      { kind: "trade", price: 101, time: 1000 },
      { kind: "trade", price: 99, time: 2000 },
    ]);
    expect(next.last).toEqual({ price: 99, time: 2000 });
    expect(next.trend).toBe(-1);
    expect(next.candles["1m"]?.at(-1)).toMatchObject({
      close: 99,
      high: 101,
      low: 99,
    });
    expect(next.candles["5m"]?.at(-1)?.close).toBe(99);
    expect(next.candles["1h"]).toBeUndefined();
  });

  test("keeps the trend when the price holds", () => {
    const state: PriceData = {
      ...idle,
      last: { price: 100, time: 0 },
      trend: 1,
    };
    const next = applyPriceMessages(state, [
      { kind: "trade", price: 100, time: 1000 },
    ]);
    expect(next.trend).toBe(1);
  });

  test("merges candles and takes the ticker", () => {
    const ticker = {
      change: 1,
      changePercent: 1,
      high: 2,
      last: 1,
      low: 0,
      open: 0,
      quoteVolume: 1,
      trades: 1,
      volume: 1,
    };
    const next = applyPriceMessages(idle, [
      { candle: candle(0, 100), interval: "1m", kind: "candle" },
      { candle: candle(MINUTE, 101), interval: "1m", kind: "candle" },
      { kind: "ticker", ticker },
    ]);
    expect(closes(next.candles["1m"] ?? [])).toEqual([100, 101]);
    expect(next.ticker).toBe(ticker);
  });

  test("leaves the state it was given untouched", () => {
    const candles = { "1m": [candle(0, 100)] };
    const state: PriceData = { ...idle, candles };
    applyPriceMessages(state, [
      { candle: candle(MINUTE, 101), interval: "1m", kind: "candle" },
    ]);
    expect(state.candles).toBe(candles);
    expect(closes(candles["1m"])).toEqual([100]);
  });
});
