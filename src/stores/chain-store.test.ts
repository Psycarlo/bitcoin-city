import { describe, expect, test } from "bun:test";

import type { Block, MempoolUpdate, TxSummary } from "@/data/types";

import {
  applyNextBlock,
  INITIAL_CHAIN,
  KEEP_BLOCKS,
  lastBlockTime,
  mergeBlocks,
  receiveUpdate,
} from "./chain-store";
import type { ChainData, NextBlock } from "./chain-store";

const block = (height: number, id = `block-${height}`): Block => ({
  avgFeeRate: 4,
  difficulty: 1,
  feeRange: [1, 2, 4],
  height,
  id,
  medianFee: 2,
  reward: 312_500_000,
  size: 1_600_000,
  time: height * 600_000,
  totalFees: 1_000_000,
  txCount: 3000,
  weight: 3_990_000,
});

const tx = (txid: string, rate = 2): TxSummary => ({
  fee: rate * 200,
  flags: 0,
  rate,
  txid,
  value: 50_000,
  vsize: 200,
});

const listOf = (...txs: TxSummary[]): NextBlock => ({
  sequence: 1,
  txs: new Map(txs.map((item) => [item.txid, item])),
});

const heights = (blocks: readonly Block[]) => blocks.map((item) => item.height);

describe("mergeBlocks", () => {
  test("lists blocks newest first", () => {
    const merged = mergeBlocks([block(10), block(8)], [block(9), block(11)]);
    expect(heights(merged)).toEqual([11, 10, 9, 8]);
  });

  test("lets a block replace the one at its height", () => {
    const merged = mergeBlocks([block(10, "stale")], [block(10, "winner")]);
    expect(merged.map((item) => item.id)).toEqual(["winner"]);
  });

  test(`keeps the newest ${KEEP_BLOCKS}`, () => {
    const many = Array.from({ length: KEEP_BLOCKS + 5 }, (_, index) =>
      block(index)
    );
    const merged = mergeBlocks([], many);
    expect(merged).toHaveLength(KEEP_BLOCKS);
    expect(merged[0]?.height).toBe(KEEP_BLOCKS + 4);
  });
});

describe("applyNextBlock", () => {
  test("replaces the list with a full one", () => {
    const { next, resync } = applyNextBlock(listOf(tx("a")), {
      full: [tx("b"), tx("c")],
      sequence: 7,
    });
    expect(resync).toBe(false);
    expect(next.sequence).toBe(7);
    expect([...next.txs.keys()]).toEqual(["b", "c"]);
  });

  test("applies a delta that follows on", () => {
    const { next, resync } = applyNextBlock(listOf(tx("a"), tx("b", 3)), {
      delta: {
        added: [tx("c")],
        changed: [{ flags: 8, rate: 9, txid: "b" }],
        removed: ["a"],
      },
      sequence: 2,
    });
    expect(resync).toBe(false);
    expect(next.sequence).toBe(2);
    expect([...next.txs.keys()]).toEqual(["b", "c"]);
    expect(next.txs.get("b")).toMatchObject({ flags: 8, rate: 9 });
  });

  test("leaves the list it was given untouched", () => {
    const current = listOf(tx("a"));
    applyNextBlock(current, {
      delta: { added: [tx("b")], changed: [], removed: ["a"] },
      sequence: 2,
    });
    expect([...current.txs.keys()]).toEqual(["a"]);
  });

  test("asks for the full list when a delta is missed", () => {
    const current = listOf(tx("a"));
    const { next, resync } = applyNextBlock(current, {
      delta: { added: [tx("b")], changed: [], removed: [] },
      sequence: 5,
    });
    expect(resync).toBe(true);
    expect(next.sequence).toBe(0);
    expect(next.txs).toBe(current.txs);
  });

  test("holds a delta while the full list is on its way", () => {
    const current: NextBlock = { sequence: 0, txs: new Map() };
    const { next, resync } = applyNextBlock(current, {
      delta: { added: [tx("b")], changed: [], removed: [] },
      sequence: 1,
    });
    expect(resync).toBe(false);
    expect(next).toBe(current);
  });
});

describe("receiveUpdate", () => {
  const live: ChainData = {
    ...INITIAL_CHAIN,
    blocks: [block(100), block(99)],
    nextBlock: listOf(tx("a"), tx("b")),
  };

  test("finds a new block on top, with when it came and what it likely holds", () => {
    const { result, state } = receiveUpdate(live, { block: block(101) }, 42);
    expect(result.found?.height).toBe(101);
    expect(heights(state.blocks)).toEqual([101, 100, 99]);
    expect(state.arrivals).toEqual({ "block-101": 42 });
    expect(state.provisional["block-101"]?.map((item) => item.txid)).toEqual([
      "a",
      "b",
    ]);
  });

  test("takes the next block's list as it was before the block's own change", () => {
    const update: MempoolUpdate = {
      block: block(101),
      nextBlock: { full: [tx("c")], sequence: 9 },
    };
    const { state } = receiveUpdate(live, update, 42);
    expect(state.provisional["block-101"]?.map((item) => item.txid)).toEqual([
      "a",
      "b",
    ]);
    expect([...state.nextBlock.txs.keys()]).toEqual(["c"]);
  });

  test("does not find a block it knows", () => {
    const { result, state } = receiveUpdate(live, { block: block(100) }, 42);
    expect(result.found).toBeUndefined();
    expect(state.arrivals).toEqual({});
  });

  test("does not find a block below the tip", () => {
    const { result, state } = receiveUpdate(
      live,
      { block: block(99, "other") },
      42
    );
    expect(result.found).toBeUndefined();
    expect(state.blocks.map((item) => item.id)).toEqual(["block-100", "other"]);
  });

  test("does not find the first blocks, before there is a tip", () => {
    const { result } = receiveUpdate(INITIAL_CHAIN, { block: block(5) }, 42);
    expect(result.found).toBeUndefined();
  });

  test("passes a missed delta on as a resync", () => {
    const { result } = receiveUpdate(
      live,
      {
        nextBlock: {
          delta: { added: [], changed: [], removed: [] },
          sequence: 4,
        },
      },
      42
    );
    expect(result.resync).toBe(true);
  });

  test("carries the other parts over and keeps the rest", () => {
    const { state } = receiveUpdate(
      live,
      {
        fees: { economy: 2, fastest: 9, halfHour: 6, hour: 4, minimum: 1 },
        usd: 100_000,
        vBytesPerSecond: 1800,
      },
      42
    );
    expect(state.fees?.fastest).toBe(9);
    expect(state.usd).toBe(100_000);
    expect(state.vBytesPerSecond).toBe(1800);
    expect(state.blocks).toBe(live.blocks);
    expect(state.nextBlock).toBe(live.nextBlock);
  });
});

describe("lastBlockTime", () => {
  test("takes when the newest block arrived over its miner's clock", () => {
    const tip = block(101);
    const chain = { ...INITIAL_CHAIN, blocks: [tip, block(100)] };
    expect(lastBlockTime(chain)).toBe(tip.time);
    expect(
      lastBlockTime({ ...chain, arrivals: { [tip.id]: tip.time - 90_000 } })
    ).toBe(tip.time - 90_000);
    // Only the newest block's arrival counts.
    expect(lastBlockTime({ ...chain, arrivals: { "block-100": 1 } })).toBe(
      tip.time
    );
  });

  test("knows nothing before the first block", () => {
    expect(lastBlockTime(INITIAL_CHAIN)).toBeUndefined();
  });
});
