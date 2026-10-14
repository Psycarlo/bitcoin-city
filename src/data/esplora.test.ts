import { describe, expect, test } from "bun:test";

import {
  adjustmentOf,
  blocksOnTop,
  epochStartOf,
  feesOf,
  hashrateOf,
  inflowOf,
  parseEstimates,
  parseHistogram,
  pickNextBlock,
  projectBlocks,
  sampleFeesOf,
} from "./esplora";
import type { FeeBand } from "./esplora";
import { parseBlockList } from "./mempool";
import type { Block, TxSummary } from "./types";

const MINUTE = 60_000;
const hash = (height: number) => height.toString(16).padStart(64, "0");

/** A block as Esplora's `/blocks` lists it: no mempool extras. */
const rawBlock = (height: number, previous = hash(height - 1)) => ({
  bits: 386_014_960,
  difficulty: 132_716_002_350_731.27,
  height,
  id: hash(height),
  mediantime: 1_792_013_545,
  merkle_root: "6827026c",
  nonce: 3_875_460_405,
  previousblockhash: previous,
  size: 1_709_273,
  timestamp: 1_792_017_435 + height,
  tx_count: 5521,
  version: 1_073_733_632,
  weight: 3_992_885,
});

const tx = (txid: string, rate: number, vsize = 200): TxSummary => ({
  fee: rate * vsize,
  flags: 0,
  rate,
  txid,
  value: 50_000,
  vsize,
});

const ids = (txs: readonly TxSummary[]) => txs.map((item) => item.txid);
const heights = (blocks: readonly Block[] | undefined) =>
  blocks?.map((block) => block.height);

describe("parseHistogram", () => {
  test("reads the bands, dearest first, and drops what is not one", () => {
    expect(
      parseHistogram([[2, 50_000], [3.37, "60000"], [1, 0], ["x"], 5])
    ).toEqual([
      { rate: 3.37, vsize: 60_000 },
      { rate: 2, vsize: 50_000 },
    ]);
    expect(parseHistogram({})).toEqual([]);
  });
});

describe("projectBlocks", () => {
  const histogram: FeeBand[] = [
    { rate: 10, vsize: 600_000 },
    { rate: 5, vsize: 600_000 },
    { rate: 2, vsize: 300_000 },
  ];

  test("fills a block's worth from the dearest band down", () => {
    const [first, second, third] = projectBlocks(histogram, 3000);
    expect(first).toEqual({
      feeRange: [5, 5, 5, 10, 10, 10, 10],
      medianFee: 10,
      size: 1_000_000,
      totalFees: 8_000_000,
      txCount: 2000,
      vsize: 1_000_000,
    });
    // The band that did not fit spills into the next block.
    expect(second).toMatchObject({
      feeRange: [2, 2, 2, 2, 5, 5, 5],
      medianFee: 2,
      totalFees: 1_600_000,
      txCount: 1000,
      vsize: 500_000,
    });
    expect(third).toBeUndefined();
  });

  test("lists fee ranges cheapest first", () => {
    for (const block of projectBlocks(histogram, 3000)) {
      expect(block.feeRange).toEqual(block.feeRange.toSorted((a, b) => a - b));
    }
  });

  test("puts the rest of a deep mempool in the last of eight blocks", () => {
    const blocks = projectBlocks([{ rate: 1, vsize: 10_500_000 }], 50_000);
    expect(blocks).toHaveLength(8);
    expect(blocks.slice(0, 7).every((block) => block.vsize === 1_000_000)).toBe(
      true
    );
    expect(blocks[7]?.vsize).toBe(3_500_000);
    expect(blocks[7]?.txCount).toBe(16_667);
  });

  test("projects nothing from an empty mempool", () => {
    expect(projectBlocks([], 0)).toEqual([]);
  });
});

describe("fee estimates", () => {
  // As mempool.second.tech sent them, in no particular order.
  const raw = {
    "1": 1.072,
    "1008": 0.0999,
    "144": 0.222,
    "2": 1.072,
    "25": 0.261,
    "3": 1.072,
    "504": 0.214,
    "6": 0.302,
    bad: 4,
  };

  test("reads them, the soonest target first", () => {
    const estimates = parseEstimates(raw);
    expect(estimates.map((item) => item.target)).toEqual([
      1, 2, 3, 6, 25, 144, 504, 1008,
    ]);
    expect(parseEstimates("nope")).toEqual([]);
  });

  test("maps targets to tiers, rounded up to the hundredth", () => {
    expect(feesOf(parseEstimates(raw))).toEqual({
      economy: 0.23,
      fastest: 1.08,
      halfHour: 1.08,
      hour: 0.31,
      minimum: 0.1,
    });
  });

  test("falls back to the nearest sooner target, then the soonest", () => {
    expect(feesOf(parseEstimates({ "10": 2, "2": 5 }))).toEqual({
      economy: 2,
      fastest: 5,
      halfHour: 5,
      hour: 5,
      minimum: 2,
    });
  });

  test("never makes a slower tier dearer than a faster one", () => {
    expect(feesOf(parseEstimates({ "1": 2, "3": 4, "6": 1 }))).toMatchObject({
      fastest: 2,
      halfHour: 2,
      hour: 1,
    });
  });

  test("gives nothing without estimates", () => {
    expect(feesOf([])).toBeUndefined();
  });
});

describe("block lists", () => {
  // Esplora sends its latest blocks newest first; here they come shuffled.
  const list = parseBlockList([
    rawBlock(101),
    rawBlock(103),
    rawBlock(102),
    { id: "no height" },
  ]);
  const tip = list.find((block) => block.height === 101) as Block;

  test("reads Esplora's blocks, newest first, without extras", () => {
    expect(heights(list)).toEqual([103, 102, 101]);
    expect(list[0]).toMatchObject({
      difficulty: 132_716_002_350_731.27,
      feeRange: [],
      id: hash(103),
      medianFee: 0,
      previous: hash(102),
      time: (1_792_017_435 + 103) * 1000,
      txCount: 5521,
      weight: 3_992_885,
    });
    expect(list[0]?.pool).toBeUndefined();
  });

  test("finds the blocks on top of the tip, oldest first", () => {
    expect(heights(blocksOnTop(tip, list))).toEqual([102, 103]);
    expect(blocksOnTop(list[0] as Block, list)).toEqual([]);
  });

  test("tells when the chain took another turn", () => {
    const reorganised = parseBlockList([
      rawBlock(103),
      rawBlock(102, hash(999)),
    ]);
    expect(blocksOnTop(tip, reorganised)).toBeUndefined();
  });

  test("tells when blocks are missing in between", () => {
    expect(blocksOnTop(tip, parseBlockList([rawBlock(103)]))).toBeUndefined();
  });
});

describe("pickNextBlock", () => {
  test("takes the dearest first, down to the floor", () => {
    const picked = pickNextBlock(
      [tx("cheap", 1), tx("dear", 9), tx("mid", 4)],
      2
    );
    expect(ids(picked)).toEqual(["dear", "mid"]);
  });

  test("stops at a block's worth, filling what room is left", () => {
    const picked = pickNextBlock(
      [tx("big", 9, 900_000), tx("bigger", 8, 200_000), tx("small", 1, 50_000)],
      0
    );
    expect(ids(picked)).toEqual(["big", "small"]);
  });
});

describe("sampleFeesOf", () => {
  test("tells a block's fees from the transactions seen waiting", () => {
    const txs = Array.from({ length: 10 }, (_, index) =>
      tx(`t${index}`, index + 1)
    );
    expect(sampleFeesOf(txs)).toEqual({
      avgFeeRate: 5.5,
      feeRange: [1, 1, 3, 5, 8, 9, 10],
      medianFee: 5,
    });
  });

  test("needs a fair sample", () => {
    expect(sampleFeesOf([tx("a", 3), tx("b", 4)])).toBeUndefined();
  });
});

const tipAt = (height: number, time: number) =>
  ({
    ...parseBlockList([rawBlock(height)])[0],
    difficulty: 110,
    time,
  }) as Block;

describe("difficulty", () => {
  const start = { difficulty: 110, height: 2016 * 480, time: 0 };

  test("finds the start of the period", () => {
    expect(epochStartOf(971_474)).toBe(969_696);
    expect(epochStartOf(969_696)).toBe(969_696);
  });

  test("works the adjustment out from this period's pace", () => {
    // Half way through, at 9 minutes a block.
    const tip = tipAt(start.height + 1008, 1008 * 9 * MINUTE);
    const adjustment = adjustmentOf(
      tip,
      { ...start, previousDifficulty: 100 },
      1000
    );
    expect(adjustment).toMatchObject({
      nextHeight: start.height + 2016,
      progress: 50,
      remainingBlocks: 1008,
      remainingTime: 1008 * 9 * MINUTE,
      retargetAt: 1000 + 1008 * 9 * MINUTE,
      timeAvg: 9 * MINUTE,
    });
    expect(adjustment.change).toBeCloseTo(11.11, 2);
    expect(adjustment.previousChange).toBeCloseTo(10, 6);
  });

  test("expects no change at the very start of a period", () => {
    const adjustment = adjustmentOf(tipAt(start.height, 0), start, 0);
    expect(adjustment).toMatchObject({
      change: 0,
      previousChange: 0,
      progress: 0,
      timeAvg: 10 * MINUTE,
    });
  });

  test("holds the change within Bitcoin's limits", () => {
    const fast = adjustmentOf(tipAt(start.height + 10, 10 * 1000), start, 0);
    expect(fast.change).toBe(300);
  });

  test("estimates the hash rate from difficulty and pace", () => {
    // Difficulty 1 at one block a second takes 2^32 hashes a second.
    expect(hashrateOf(1, 1000)).toEqual({ current: 2 ** 32, difficulty: 1 });
  });
});

describe("inflowOf", () => {
  test("measures how fast the mempool grows", () => {
    expect(
      inflowOf([
        { time: 0, vsize: 1_000_000 },
        { time: 10_000, vsize: 1_020_000 },
        { time: 30_000, vsize: 1_090_000 },
      ])
    ).toBe(3000);
  });

  test("tells nothing from a shrinking mempool or too short a span", () => {
    expect(
      inflowOf([
        { time: 0, vsize: 2_000_000 },
        { time: 30_000, vsize: 1_000_000 },
      ])
    ).toBeUndefined();
    expect(
      inflowOf([
        { time: 0, vsize: 1_000_000 },
        { time: 5000, vsize: 1_010_000 },
      ])
    ).toBeUndefined();
  });
});
