import { describe, expect, test } from "bun:test";

import {
  HALVING_INTERVAL,
  halvingOf,
  parseChainQuery,
  subsidyAt,
} from "./bitcoin";

const HASH = `00000000000000000001${"ab".repeat(22)}`;
const TXID = `${"c0ffee".repeat(10)}abcd`;

describe("subsidyAt", () => {
  test("halves every 210,000 blocks", () => {
    expect(subsidyAt(0)).toBe(5_000_000_000);
    expect(subsidyAt(209_999)).toBe(5_000_000_000);
    expect(subsidyAt(210_000)).toBe(2_500_000_000);
    expect(subsidyAt(840_000)).toBe(312_500_000);
    expect(subsidyAt(1_050_000)).toBe(156_250_000);
  });

  test("rounds down to whole sats, then runs out", () => {
    expect(subsidyAt(10 * HALVING_INTERVAL)).toBe(4_882_812);
    expect(subsidyAt(32 * HALVING_INTERVAL)).toBe(1);
    expect(subsidyAt(33 * HALVING_INTERVAL)).toBe(0);
  });
});

describe("halvingOf", () => {
  test("places a height in its epoch", () => {
    expect(halvingOf(945_000)).toEqual({
      next: 1_050_000,
      progress: 0.5,
      remaining: 105_000,
      subsidyAfter: 156_250_000,
    });
  });

  test("starts an epoch on the halving block itself", () => {
    expect(halvingOf(840_000)).toMatchObject({
      next: 1_050_000,
      progress: 0,
      remaining: HALVING_INTERVAL,
    });
  });
});

describe("parseChainQuery", () => {
  test("reads heights, written any way", () => {
    for (const text of ["840000", "#840000", " 840,000 "]) {
      expect(parseChainQuery(text)).toEqual({
        height: 840_000,
        kind: "block-height",
      });
    }
    expect(parseChainQuery("0")).toEqual({ height: 0, kind: "block-height" });
  });

  test("tells block hashes from txids by their leading zeros", () => {
    expect(parseChainQuery(HASH.toUpperCase())).toEqual({
      hash: HASH,
      kind: "block-hash",
    });
    expect(parseChainQuery(TXID)).toEqual({ kind: "tx", txid: TXID });
  });

  test("reads nothing else", () => {
    for (const text of [
      "",
      "12345678",
      "abc",
      TXID.slice(1),
      `${TXID}0`,
      "next block",
    ]) {
      expect(parseChainQuery(text)).toBeUndefined();
    }
  });
});
