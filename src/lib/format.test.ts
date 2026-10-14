import { describe, expect, test } from "bun:test";

import {
  DASH,
  formatAgo,
  formatAmount,
  formatBtc,
  formatBytes,
  formatCompact,
  formatDifficulty,
  formatDuration,
  formatElapsed,
  formatFeeRate,
  formatHashrate,
  formatHeight,
  formatNumber,
  formatRate,
  formatSignedPercent,
  formatUsd,
  formatUsdWhole,
  formatVsize,
  formatWeight,
  shortId,
} from "./format";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

describe("numbers", () => {
  test("rounds and groups", () => {
    expect(formatNumber(1234.6)).toBe("1,235");
    expect(formatCompact(81_700)).toBe("81.7K");
    expect(formatHeight(970_182)).toBe("#970,182");
  });

  test("writes dollars", () => {
    expect(formatUsd(86_038.42)).toBe("$86,038.42");
    expect(formatUsd()).toBe(DASH);
    expect(formatUsdWhole(86_038.42)).toBe("$86,038");
    expect(formatUsdWhole(0.53)).toBe("$0.53");
  });

  test("signs changes, with a true minus", () => {
    expect(formatSignedPercent(1.234)).toBe("+1.23%");
    expect(formatSignedPercent(-0.4)).toBe("−0.40%");
    expect(formatSignedPercent(0)).toBe("±0%");
  });
});

describe("amounts", () => {
  test("writes BTC with the digits that matter", () => {
    expect(formatBtc(53_100_000)).toBe("0.5310 BTC");
    expect(formatBtc(31_448_000_000)).toBe("314.48 BTC");
    expect(formatBtc(15_000_000_000_000)).toBe("150,000 BTC");
    expect(formatBtc(50_000)).toBe("0.00050000 BTC");
  });

  test("writes small amounts in sats", () => {
    expect(formatAmount(4210)).toBe("4,210 sats");
    expect(formatAmount(100_000)).toBe("0.0010 BTC");
  });
});

describe("sizes and rates", () => {
  test("writes fee rates", () => {
    expect(formatRate(0.15)).toBe("0.15");
    expect(formatRate(3.5)).toBe("3.5");
    expect(formatRate(120)).toBe("120");
    expect(formatFeeRate(3.5)).toBe("3.5 sat/vB");
    expect(formatFeeRate()).toBe(DASH);
  });

  test("writes sizes", () => {
    expect(formatVsize(245)).toBe("245 vB");
    expect(formatVsize(12_345)).toBe("12.3 kvB");
    expect(formatVsize(1_000_000)).toBe("1.00 MvB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(312_400)).toBe("312 kB");
    expect(formatBytes(1_620_000)).toBe("1.62 MB");
    expect(formatWeight(3_993_000)).toBe("3.99 MWU");
  });

  test("writes the work behind the chain", () => {
    expect(formatHashrate(958e18)).toBe("958 EH/s");
    expect(formatHashrate(1.2e21)).toBe("1.20 ZH/s");
    expect(formatHashrate(5)).toBe("5.00 H/s");
    expect(formatDifficulty(132.72e12)).toBe("132.72 T");
  });
});

describe("time", () => {
  const now = 10 * DAY;

  test("says how long ago", () => {
    expect(formatAgo(now - 30 * SECOND, now)).toBe("just now");
    expect(formatAgo(now + MINUTE, now)).toBe("just now");
    expect(formatAgo(now - 4 * MINUTE, now)).toBe("4 min ago");
    expect(formatAgo(now - 2 * HOUR, now)).toBe("2 h ago");
    expect(formatAgo(now - 3 * DAY, now)).toBe("3 d ago");
  });

  test("runs a clock", () => {
    expect(formatElapsed(999)).toBe("0:00");
    expect(formatElapsed(247 * SECOND)).toBe("4:07");
    expect(formatElapsed(3750 * SECOND)).toBe("1:02:30");
    expect(formatElapsed(-SECOND)).toBe("0:00");
  });

  test("guesses roughly how long ahead", () => {
    expect(formatDuration(10 * SECOND)).toBe("~1 min");
    expect(formatDuration(8 * MINUTE)).toBe("~8 min");
    expect(formatDuration(3 * HOUR)).toBe("~3 h");
    expect(formatDuration(47 * HOUR)).toBe("~47 h");
    expect(formatDuration(12 * DAY)).toBe("~12 days");
    expect(formatDuration(1.6 * YEAR)).toBe("~1.6 years");
  });
});

describe("shortId", () => {
  test("keeps the ends of a long id", () => {
    expect(shortId("66aa6f0123456789f76501")).toBe("66aa6f…f76501");
    expect(shortId("66aa6f0123456789f76501", 4, 2)).toBe("66aa…01");
  });

  test("leaves a short id whole", () => {
    expect(shortId("abc")).toBe("abc");
    expect(shortId("0123456789abc")).toBe("0123456789abc");
  });
});
