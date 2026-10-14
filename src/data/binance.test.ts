import { describe, expect, test } from "bun:test";

import { INTERVAL_MS, parseBinanceMessage } from "./binance";

/** A message of the combined stream. */
const envelope = (data: object) =>
  JSON.stringify({ data, stream: "btcusdt@any" });

describe("parseBinanceMessage", () => {
  test("reads trades", () => {
    expect(
      parseBinanceMessage(
        envelope({ T: 1_760_000_000_123, e: "aggTrade", p: "98765.43" })
      )
    ).toEqual({ kind: "trade", price: 98_765.43, time: 1_760_000_000_123 });
  });

  test("skips a trade without a price", () => {
    expect(
      parseBinanceMessage(envelope({ T: 1, e: "aggTrade", p: "0" }))
    ).toBeUndefined();
  });

  test("reads the 24-hour ticker", () => {
    expect(
      parseBinanceMessage(
        envelope({
          P: "-1.20",
          c: "98765.43",
          e: "24hrTicker",
          h: "101000",
          l: "97000",
          n: 2_000_000,
          o: "99965.93",
          p: "-1200.5",
          q: "1500000000",
          v: "15000",
        })
      )
    ).toEqual({
      kind: "ticker",
      ticker: {
        change: -1200.5,
        changePercent: -1.2,
        high: 101_000,
        last: 98_765.43,
        low: 97_000,
        open: 99_965.93,
        quoteVolume: 1_500_000_000,
        trades: 2_000_000,
        volume: 15_000,
      },
    });
  });

  test("reads candles of the intervals it follows", () => {
    const kline = {
      c: "2",
      h: "3",
      i: "5m",
      l: "0.5",
      o: "1",
      t: 1_760_000_100_000,
      v: "10",
    };
    expect(parseBinanceMessage(envelope({ e: "kline", k: kline }))).toEqual({
      candle: {
        close: 2,
        high: 3,
        low: 0.5,
        open: 1,
        time: 1_760_000_100_000,
        volume: 10,
      },
      interval: "5m",
      kind: "candle",
    });
    expect(
      parseBinanceMessage(envelope({ e: "kline", k: { ...kline, i: "3m" } }))
    ).toBeUndefined();
  });

  test("reads nothing from anything else", () => {
    expect(parseBinanceMessage(envelope({ e: "depthUpdate" }))).toBeUndefined();
    expect(
      parseBinanceMessage(JSON.stringify({ result: null }))
    ).toBeUndefined();
    expect(parseBinanceMessage("not json")).toBeUndefined();
    expect(parseBinanceMessage(new ArrayBuffer(2))).toBeUndefined();
  });
});

describe("INTERVAL_MS", () => {
  test("gives each interval its length", () => {
    expect(INTERVAL_MS).toEqual({
      "15m": 900_000,
      "1h": 3_600_000,
      "1m": 60_000,
      "5m": 300_000,
    });
  });
});
