import { useEffect } from "react";

import {
  BINANCE_SOCKET_URLS,
  fetchCandles,
  parseBinanceMessage,
} from "@/data/binance";
import type { PriceMessage } from "@/data/binance";
import { createSocketFeed } from "@/data/socket-feed";
import { CANDLE_INTERVALS } from "@/data/types";
import { formatUsdWhole } from "@/lib/format";
import { addActivity } from "@/stores/activity-store";
import { KEEP_CANDLES, usePriceStore } from "@/stores/price-store";

const SECOND = 1000;
/**
 * Trades come many times a second; the store takes them in batches, so the
 * page redraws at most this often (ms).
 */
const FLUSH_INTERVAL = 250;
/** Trades never stop on Binance: this long without one, the connection is dead. */
const STALE_AFTER = 30 * SECOND;
/** Crossing a multiple of this (USD) is worth a note… */
const PRICE_STEP = 1000;
/** …once in this long for the same level, as the price often hovers around one (ms). */
const PRICE_QUIET = 5 * 60 * SECOND;

/**
 * Keeps the price store up to date with Binance: every trade, the 24-hour
 * ticker and candles of each interval, with their history loaded on each
 * connection (to fill any gap).
 */
export const usePriceFeed = () => {
  useEffect(() => {
    const { apply, setHistory, setStatus } = usePriceStore.getState().actions;
    const controller = new AbortController();
    const announced = new Map<number, number>();
    let pending: PriceMessage[] = [];

    const announceCrossing = (before?: number, after?: number) => {
      if (before === undefined || after === undefined) {
        return;
      }
      const from = Math.floor(before / PRICE_STEP);
      const to = Math.floor(after / PRICE_STEP);
      if (from === to) {
        return;
      }
      const up = to > from;
      const level = (up ? to : from) * PRICE_STEP;
      const now = Date.now();
      if (now - (announced.get(level) ?? 0) < PRICE_QUIET) {
        return;
      }
      announced.set(level, now);
      addActivity({
        detail: `${formatUsdWhole(after)} on Binance`,
        id: `price:${level}:${now}`,
        kind: up ? "price-up" : "price-down",
        time: now,
        title: `Bitcoin ${up ? "above" : "below"} ${formatUsdWhole(level)}`,
      });
    };

    const flush = () => {
      if (pending.length === 0) {
        return;
      }
      const batch = pending;
      pending = [];
      const before = usePriceStore.getState().last?.price;
      apply(batch);
      announceCrossing(before, usePriceStore.getState().last?.price);
    };
    const flushTimer = setInterval(flush, FLUSH_INTERVAL);

    const loadHistory = async () => {
      await Promise.allSettled(
        CANDLE_INTERVALS.map(async (interval) => {
          setHistory(
            interval,
            await fetchCandles(interval, KEEP_CANDLES, controller.signal)
          );
        })
      );
    };

    const feed = createSocketFeed(
      {
        parse: parseBinanceMessage,
        staleAfter: STALE_AFTER,
        urls: BINANCE_SOCKET_URLS,
      },
      {
        onMessage: (message) => {
          pending.push(message);
        },
        onOpen: () => {
          void loadHistory();
        },
        onStatus: setStatus,
      }
    );

    return () => {
      controller.abort();
      clearInterval(flushTimer);
      feed.close();
    };
  }, []);
};
