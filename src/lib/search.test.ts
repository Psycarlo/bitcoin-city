import { describe, expect, test } from "bun:test";

import type { Block, ProjectedBlock, TxSummary } from "@/data/types";

import { hitId, MAX_HITS, searchChain } from "./search";
import type { SearchSources } from "./search";

const block = (height: number, id: string, pool?: string): Block => ({
  avgFeeRate: 4,
  difficulty: 1,
  feeRange: [1, 2, 4],
  height,
  id,
  medianFee: 2,
  pool: pool ? { name: pool, slug: pool.toLowerCase() } : undefined,
  reward: 312_500_000,
  size: 1_600_000,
  time: 0,
  totalFees: 1_000_000,
  txCount: 3000,
  weight: 3_990_000,
});

const projected = (medianFee: number): ProjectedBlock => ({
  feeRange: [medianFee, medianFee * 2],
  medianFee,
  size: 1_500_000,
  totalFees: 2_000_000,
  txCount: 3000,
  vsize: 997_000,
});

const tx = (txid: string): TxSummary => ({
  fee: 400,
  flags: 0,
  rate: 2,
  txid,
  value: 50_000,
  vsize: 200,
});

/** A 64-character id from a short start. */
const idFrom = (start: string, fill = "1") => start.padEnd(64, fill);

const TIP = idFrom("00000000aa", "0");
const MIDDLE = idFrom("00000000bb", "0");
const OLDEST = idFrom("00000000cc", "0");
const WAITING = idFrom("abcd", "e");
const MINED = idFrom("abcdf", "f");

const sources: SearchSources = {
  blocks: [
    block(900_002, TIP, "Foundry USA"),
    block(900_001, MIDDLE, "AntPool"),
    block(900_000, OLDEST, "Foundry USA"),
  ],
  pending: new Map([[WAITING, tx(WAITING)]]),
  projected: [projected(8), projected(4), projected(2)],
  summaries: { [MIDDLE]: [tx(MINED)] },
};

const search = (text: string) => searchChain(sources, text).map(hitId);

describe("searchChain", () => {
  test("finds nothing for nothing", () => {
    expect(searchChain(sources, "   ")).toEqual([]);
  });

  test("finds a loaded block by height, written any way", () => {
    for (const text of ["900001", "#900001", "900,001", " 900001 "]) {
      expect(search(text)[0]).toBe(`block:${MIDDLE}`);
    }
  });

  test("offers loaded blocks whose height starts with the digits typed", () => {
    expect(search("90000")).toEqual([
      `block:${TIP}`,
      `block:${MIDDLE}`,
      `block:${OLDEST}`,
      "height:90000",
    ]);
  });

  test("looks up a height that is not loaded", () => {
    expect(search("840000")).toEqual(["height:840000"]);
  });

  test("leads a height still to come to the block the mempool would fill", () => {
    const [hit] = searchChain(sources, "900004");
    expect(hit).toMatchObject({ index: 1, kind: "projected" });
  });

  test("finds a block by its hash, or offers to look it up", () => {
    expect(search(TIP.toUpperCase())).toEqual([`block:${TIP}`]);
    const unknown = idFrom("00000000dd", "0");
    expect(searchChain(sources, unknown)).toEqual([
      { hash: unknown, kind: "block-hash" },
    ]);
  });

  test("finds a transaction by its id, waiting or mined", () => {
    expect(searchChain(sources, WAITING)).toEqual([
      { kind: "tx", mined: false, tx: tx(WAITING) },
    ]);
    expect(searchChain(sources, MINED)).toEqual([
      { height: 900_001, kind: "tx", mined: true, tx: tx(MINED) },
    ]);
  });

  test("offers to look up a transaction that is not loaded", () => {
    const unknown = idFrom("ffff");
    expect(searchChain(sources, unknown)).toEqual([
      { kind: "txid", txid: unknown },
    ]);
  });

  test("finds transactions by the start of their id, those waiting first", () => {
    expect(search("abcd")).toEqual([`tx:${WAITING}`, `tx:${MINED}`]);
    expect(searchChain(sources, "ABCDF")).toEqual([
      { height: 900_001, kind: "tx", mined: true, tx: tx(MINED) },
    ]);
    expect(search("abc1")).toEqual([]);
  });

  test("waits for a few characters before searching by prefix", () => {
    expect(search("abc")).toEqual([]);
  });

  test("finds blocks by the start of their hash", () => {
    expect(search("00000000b")).toEqual([`block:${MIDDLE}`]);
  });

  test("finds blocks by their miner", () => {
    expect(search("foundry")).toEqual([`block:${TIP}`, `block:${OLDEST}`]);
    expect(search("antpool")).toEqual([`block:${MIDDLE}`]);
  });

  test("finds the next block by name", () => {
    expect(search("next")).toEqual(["projected:0"]);
    expect(search("Next block")).toEqual(["projected:0"]);
    expect(search("n")).not.toContain("projected:0");
  });

  test("lists each place once", () => {
    const both: SearchSources = {
      ...sources,
      summaries: { [MIDDLE]: [tx(MINED), tx(WAITING)] },
    };
    expect(searchChain(both, "abcd").map(hitId)).toEqual([
      `tx:${WAITING}`,
      `tx:${MINED}`,
    ]);
  });

  test(`lists ${MAX_HITS} at most`, () => {
    const many: SearchSources = {
      ...sources,
      pending: new Map(
        Array.from({ length: 20 }, (_, index) => {
          const txid = idFrom(`abcd${index.toString(16)}`);
          return [txid, tx(txid)] as const;
        })
      ),
    };
    const hits = searchChain(many, "abcd").map(hitId);
    expect(hits).toHaveLength(MAX_HITS);
    expect(new Set(hits).size).toBe(MAX_HITS);
  });
});
