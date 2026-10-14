import { describe, expect, test } from "bun:test";

import { parseBlock, parseMempoolMessage, parseTxSummary } from "./mempool";

const HASH = `00000000000000000001${"ab".repeat(22)}`;
const PREVIOUS = `00000000000000000000${"cd".repeat(22)}`;

const RAW_BLOCK = {
  difficulty: 136_040_256_150_000,
  extras: {
    avgFeeRate: 5,
    feeRange: [1, 2, "3.5", 80],
    matchRate: 99.5,
    medianFee: 3,
    pool: { name: "Foundry USA", slug: "foundryusa" },
    reward: 315_000_000,
    totalFees: 2_500_000,
    totalOutputAmt: 1_234_567_890,
  },
  height: 920_000,
  id: HASH,
  previousblockhash: PREVIOUS,
  size: 1_600_000,
  timestamp: 1_760_000_000,
  tx_count: 3500,
  weight: 3_993_000,
};

const message = (body: object) => JSON.stringify(body);

describe("parseBlock", () => {
  test("reads a block and its extras", () => {
    expect(parseBlock(RAW_BLOCK)).toEqual({
      avgFeeRate: 5,
      difficulty: 136_040_256_150_000,
      feeRange: [1, 2, 3.5, 80],
      height: 920_000,
      id: HASH,
      matchRate: 99.5,
      medianFee: 3,
      pool: { name: "Foundry USA", slug: "foundryusa" },
      previous: PREVIOUS,
      reward: 315_000_000,
      size: 1_600_000,
      time: 1_760_000_000_000,
      totalFees: 2_500_000,
      totalOut: 1_234_567_890,
      txCount: 3500,
      weight: 3_993_000,
    });
  });

  test("makes do without extras", () => {
    const block = parseBlock({ height: 0, id: HASH });
    expect(block).toMatchObject({ feeRange: [], height: 0, medianFee: 0 });
    expect(block?.pool).toBeUndefined();
  });

  test("needs an id and a height", () => {
    expect(parseBlock({ ...RAW_BLOCK, id: undefined })).toBeUndefined();
    expect(parseBlock({ ...RAW_BLOCK, height: "tall" })).toBeUndefined();
    expect(parseBlock([HASH])).toBeUndefined();
  });
});

describe("parseTxSummary", () => {
  test("reads the projected block's tuples, with times in ms", () => {
    expect(
      parseTxSummary(["t1", 1410, 141, 50_000, 10, 2, 1_760_000_000])
    ).toEqual({
      fee: 1410,
      flags: 2,
      rate: 10,
      time: 1_760_000_000_000,
      txid: "t1",
      value: 50_000,
      vsize: 141,
    });
  });

  test("works the rate out when it is not sent", () => {
    const tx = parseTxSummary({ fee: 300, txid: "t2", value: 1, vsize: 150 });
    expect(tx).toMatchObject({ flags: 0, rate: 2 });
    expect(tx?.time).toBeUndefined();
  });

  test("needs a txid and a size", () => {
    expect(parseTxSummary({ fee: 300, vsize: 150 })).toBeUndefined();
    expect(parseTxSummary({ fee: 300, txid: "t3", vsize: 0 })).toBeUndefined();
    expect(parseTxSummary("t4")).toBeUndefined();
  });
});

describe("parseMempoolMessage", () => {
  test("reads every part of a message", () => {
    const update = parseMempoolMessage(
      message({
        block: RAW_BLOCK,
        blocks: [RAW_BLOCK, { id: "no height" }],
        conversions: { USD: 98_765 },
        da: {
          difficultyChange: 1.5,
          estimatedRetargetDate: 1_760_500_000_000,
          nextRetargetHeight: 921_312,
          previousRetarget: -0.8,
          progressPercent: 35,
          remainingBlocks: 1312,
          remainingTime: 787_200_000,
          timeAvg: 590_000,
        },
        fees: {
          economyFee: 2,
          fastestFee: 9,
          halfHourFee: 6,
          hourFee: 4,
          minimumFee: 1,
        },
        "mempool-blocks": [
          {
            blockSize: 1_500_000,
            blockVSize: 997_000,
            feeRange: [3, 4, 9],
            medianFee: 4,
            nTx: 3100,
            totalFees: 4_000_000,
          },
        ],
        mempoolInfo: {
          bytes: 45_000_000,
          maxmempool: 300_000_000,
          mempoolminfee: 1e-5,
          size: 120_000,
          total_fee: 0.5,
          usage: 220_000_000,
        },
        transactions: [{ fee: 300, txid: "t1", value: 1, vsize: 150 }],
        vBytesPerSecond: 2100,
      })
    );
    expect(update?.block?.id).toBe(HASH);
    expect(update?.blocks).toHaveLength(1);
    expect(update?.usd).toBe(98_765);
    expect(update?.difficulty).toEqual({
      change: 1.5,
      nextHeight: 921_312,
      previousChange: -0.8,
      progress: 35,
      remainingBlocks: 1312,
      remainingTime: 787_200_000,
      retargetAt: 1_760_500_000_000,
      timeAvg: 590_000,
    });
    expect(update?.fees).toEqual({
      economy: 2,
      fastest: 9,
      halfHour: 6,
      hour: 4,
      minimum: 1,
    });
    expect(update?.projected).toEqual([
      {
        feeRange: [3, 4, 9],
        medianFee: 4,
        size: 1_500_000,
        totalFees: 4_000_000,
        txCount: 3100,
        vsize: 997_000,
      },
    ]);
    expect(update?.mempool).toMatchObject({
      count: 120_000,
      maxUsage: 300_000_000,
      totalFees: 50_000_000,
      usage: 220_000_000,
      vsize: 45_000_000,
    });
    // Bitcoin Core's floor is in BTC per kvB: 0.00001 is 1 sat/vB.
    expect(update?.mempool?.minFee).toBeCloseTo(1);
    expect(update?.recent?.map((tx) => tx.txid)).toEqual(["t1"]);
    expect(update?.vBytesPerSecond).toBe(2100);
  });

  test("reads the next block's transactions in full", () => {
    const update = parseMempoolMessage(
      message({
        "projected-block-transactions": {
          blockTransactions: [["t1", 300, 150, 1, 2, 0, 0]],
          index: 0,
          sequence: 3,
        },
      })
    );
    expect(update).toEqual({
      nextBlock: {
        full: [
          { fee: 300, flags: 0, rate: 2, txid: "t1", value: 1, vsize: 150 },
        ],
        sequence: 3,
      },
    });
  });

  test("reads what changed in the next block", () => {
    const update = parseMempoolMessage(
      message({
        "projected-block-transactions": {
          delta: {
            added: [["t2", 600, 150, 1, 4, 0, 0]],
            changed: [["t1", 5, 1], "bad"],
            removed: ["t0", 7],
          },
          index: 0,
          sequence: 4,
        },
      })
    );
    expect(update?.nextBlock?.sequence).toBe(4);
    expect(update?.nextBlock?.delta).toEqual({
      added: [
        { fee: 600, flags: 0, rate: 4, txid: "t2", value: 1, vsize: 150 },
      ],
      changed: [{ flags: 1, rate: 5, txid: "t1" }],
      removed: ["t0"],
    });
  });

  test("ignores blocks further down the mempool", () => {
    const projected = {
      blockTransactions: [],
      index: 1,
      sequence: 1,
    };
    expect(
      parseMempoolMessage(
        message({ "projected-block-transactions": projected })
      )
    ).toBeUndefined();
  });

  test("reads nothing from anything else", () => {
    expect(parseMempoolMessage("not json")).toBeUndefined();
    expect(parseMempoolMessage(message({ pong: true }))).toBeUndefined();
    expect(parseMempoolMessage(message([1, 2]))).toBeUndefined();
    expect(parseMempoolMessage(new ArrayBuffer(2))).toBeUndefined();
  });
});
