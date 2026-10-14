/**
 * A live feed from a bare Esplora API, which has no websocket and none of
 * mempool's extras: it polls, and works out from what Esplora does have
 * what mempool.space would send (the blocks the mempool would fill, the
 * next block's transactions, the difficulty adjustment). Its updates read
 * like those of mempool.space's feed, so the chain store takes them as they
 * are.
 */
import { BLOCK_VSIZE, TARGET_BLOCK_TIME } from "@/lib/bitcoin";

import { getJson, getText } from "./http";
import {
  isDefined,
  isRecord,
  numberOf,
  optionalNumber,
  stringOf,
} from "./json";
import type { JsonRecord } from "./json";
import {
  fetchEsploraBlocks,
  parseBlock,
  parseBlockList,
  parseTxSummary,
} from "./mempool";
import type {
  Block,
  DifficultyAdjustment,
  FeedStatus,
  Fees,
  Hashrate,
  MempoolInfo,
  MempoolUpdate,
  ProjectedBlock,
  ProjectedChange,
  TxSummary,
} from "./types";

const SECOND = 1000;
const PERCENT = 100;
/** How often each part is asked for (ms): new blocks, mempool statistics, fee estimates, new transactions. */
const TIP_EVERY = 10 * SECOND;
const MEMPOOL_EVERY = 10 * SECOND;
const FEES_EVERY = 30 * SECOND;
const RECENT_EVERY = 3 * SECOND;
/** Longest wait between tries of a part that keeps failing (ms). */
const MAX_BACKOFF = 30 * SECOND;
/** A request still unanswered after this long (ms) has failed. */
const REQUEST_TIMEOUT = 15 * SECOND;
/** Blocks projected, as mempool.space sends: the last takes all the rest. */
const PROJECTED_BLOCKS = 8;
/** Points of a fee range, cheapest first: least, 10th to 90th percentile, most (by vsize). */
const FEE_SHARES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] as const;
const MEDIAN = 0.5;
/** Waiting transactions remembered; the cheapest give way. */
const KEEP_TXS = 20_000;
/** Blocks a transaction the next block should have taken may miss before it counts as gone (replaced or evicted). */
const MAX_MISSES = 3;
/** Fewest of a block's transactions seen waiting to tell its fees by. */
const MIN_SAMPLE = 10;
/** New blocks announced one by one; more at once means the page was away, and the list just reloads. */
const MAX_FOUND = 3;
/** Inflow is measured over this long (ms), and not before this much has passed. */
const INFLOW_WINDOW = 60 * SECOND;
const INFLOW_SPAN = 20 * SECOND;
/** The difficulty retargets every this many blocks, by at most ×4 or ÷4. */
const EPOCH_BLOCKS = 2016;
const MAX_RISE = 300;
const MAX_FALL = -75;
/** Hashes it takes, on average, to find a block at difficulty 1. */
const HASHES_PER_DIFFICULTY = 2 ** 32;
/** Confirmation targets (blocks) behind each recommended rate. */
const FEE_TARGETS = {
  economy: 144,
  fastest: 1,
  halfHour: 3,
  hour: 6,
  minimum: 1008,
} as const;

const recordOf = (value: unknown): JsonRecord => (isRecord(value) ? value : {});

const sumOf = (values: Iterable<number>) => {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
};

/** A band of the mempool's fee histogram: so many vbytes paying at least `rate` (sat/vB). */
export interface FeeBand {
  rate: number;
  vsize: number;
}

const sizeOf = (bands: readonly FeeBand[]) =>
  sumOf(bands.map((band) => band.vsize));

const parseBand = (raw: unknown): FeeBand | undefined => {
  if (!Array.isArray(raw)) {
    return;
  }
  const [rate, vsize] = (raw as unknown[]).map((item) => optionalNumber(item));
  return rate !== undefined && vsize !== undefined && vsize > 0
    ? { rate, vsize }
    : undefined;
};

/** Esplora's fee histogram, `[[rate, vsize], …]`, the dearest band first. */
export const parseHistogram = (raw: unknown): FeeBand[] =>
  Array.isArray(raw)
    ? raw
        .map(parseBand)
        .filter(isDefined)
        .toSorted((a, b) => b.rate - a.rate)
    : [];

/** The rate under which `share` of the vbytes pay, of bands sorted dearest first. */
const rateAt = (bands: readonly FeeBand[], share: number) => {
  const wanted = share * sizeOf(bands);
  let below = 0;
  for (const band of bands.toReversed()) {
    below += band.vsize;
    if (below >= wanted) {
      return band.rate;
    }
  }
  return bands[0]?.rate ?? 0;
};

const feeFiguresOf = (bands: readonly FeeBand[]) => ({
  feeRange: FEE_SHARES.map((share) => rateAt(bands, share)),
  medianFee: rateAt(bands, MEDIAN),
});

/**
 * The blocks the mempool would fill, as mempool.space projects them: a
 * block's worth of vbytes each from the dearest band down, the last taking
 * all the rest. Fees count each band at its floor; transaction counts are
 * the mempool's, shared out by vsize.
 */
export const projectBlocks = (
  histogram: readonly FeeBand[],
  count: number
): ProjectedBlock[] => {
  const blocks: FeeBand[][] = [];
  let current: FeeBand[] = [];
  let room = BLOCK_VSIZE;
  for (const { rate, vsize } of histogram) {
    let left = vsize;
    while (left > 0) {
      const last = blocks.length === PROJECTED_BLOCKS - 1;
      const take = last ? left : Math.min(left, room);
      current.push({ rate, vsize: take });
      left -= take;
      room -= take;
      if (room <= 0 && !last) {
        blocks.push(current);
        current = [];
        room = BLOCK_VSIZE;
      }
    }
  }
  if (current.length > 0) {
    blocks.push(current);
  }
  const total = sizeOf(histogram);
  return blocks.map((bands) => {
    const vsize = sizeOf(bands);
    return {
      ...feeFiguresOf(bands),
      size: vsize,
      totalFees: Math.round(sumOf(bands.map((band) => band.rate * band.vsize))),
      txCount: total > 0 ? Math.round((count * vsize) / total) : 0,
      vsize,
    };
  });
};

/** A fee rate (sat/vB) Esplora expects to confirm within `target` blocks. */
export interface FeeEstimate {
  rate: number;
  target: number;
}

/** Esplora's fee estimates, `{ "1": 1.07, …, "1008": 0.1 }`, the soonest target first. */
export const parseEstimates = (raw: unknown): FeeEstimate[] =>
  Object.entries(recordOf(raw))
    .map(([target, rate]) => ({
      rate: optionalNumber(rate) ?? 0,
      target: Number(target),
    }))
    .filter(
      ({ rate, target }) => rate > 0 && Number.isInteger(target) && target > 0
    )
    .toSorted((a, b) => a.target - b.target);

/** Rounds a rate up to the hundredth, so a recommendation never pays less than its estimate. */
const roundUp = (rate: number) => Math.ceil(rate * 100 - 1e-9) / 100;

/**
 * Recommended rates from fee estimates: each tier the estimate for its
 * target (or the nearest sooner one given), never dearer than a faster tier.
 */
export const feesOf = (estimates: readonly FeeEstimate[]): Fees | undefined => {
  const [soonest] = estimates;
  if (!soonest) {
    return;
  }
  const at = (target: number) =>
    roundUp(
      estimates.findLast((item) => item.target <= target)?.rate ?? soonest.rate
    );
  const fastest = at(FEE_TARGETS.fastest);
  const halfHour = Math.min(fastest, at(FEE_TARGETS.halfHour));
  const hour = Math.min(halfHour, at(FEE_TARGETS.hour));
  const economy = Math.min(hour, at(FEE_TARGETS.economy));
  const minimum = Math.min(economy, at(FEE_TARGETS.minimum));
  return { economy, fastest, halfHour, hour, minimum };
};

/**
 * The waiting transactions the next block would take: the dearest first, as
 * many as a block holds, none under `floor` (where the mempool's own next
 * block stops: those known are only a sample of it).
 */
export const pickNextBlock = (
  txs: Iterable<TxSummary>,
  floor: number
): TxSummary[] => {
  const picked: TxSummary[] = [];
  let room = BLOCK_VSIZE;
  const eligible = [...txs]
    .filter((tx) => tx.rate >= floor)
    .toSorted((a, b) => b.rate - a.rate);
  for (const tx of eligible) {
    if (tx.vsize <= room) {
      picked.push(tx);
      room -= tx.vsize;
    }
  }
  return picked;
};

/**
 * A block's fee figures, told from those of its transactions this page saw
 * waiting: a sample, which colours the block much as its full list would.
 */
export const sampleFeesOf = (
  txs: readonly TxSummary[]
): Pick<Block, "avgFeeRate" | "feeRange" | "medianFee"> | undefined => {
  if (txs.length < MIN_SAMPLE) {
    return;
  }
  const bands = txs
    .map(({ rate, vsize }) => ({ rate, vsize }))
    .toSorted((a, b) => b.rate - a.rate);
  return {
    avgFeeRate: sumOf(txs.map((tx) => tx.fee)) / sizeOf(bands),
    ...feeFiguresOf(bands),
  };
};

/**
 * The blocks of a list that extend the chain from `tip`, oldest first, if
 * each follows on from the one before; undefined if they do not (the chain
 * reorganised, or moved on further than the list goes).
 */
export const blocksOnTop = (
  tip: Block,
  list: readonly Block[]
): Block[] | undefined => {
  const fresh = list
    .filter((block) => block.height > tip.height)
    .toSorted((a, b) => a.height - b.height);
  let previous = tip;
  for (const block of fresh) {
    if (
      block.previous !== previous.id ||
      block.height !== previous.height + 1
    ) {
      return;
    }
    previous = block;
  }
  return fresh;
};

/** The first block of a difficulty period, and the difficulty of the period before. */
export interface Epoch {
  difficulty: number;
  height: number;
  previousDifficulty?: number;
  time: number;
}

export const epochStartOf = (height: number) =>
  height - (height % EPOCH_BLOCKS);

/**
 * The difficulty adjustment ahead, from the pace of this period's blocks so
 * far, by their miners' clocks as Bitcoin's own rule goes.
 */
export const adjustmentOf = (
  tip: Block,
  epoch: Epoch,
  now: number
): DifficultyAdjustment => {
  const mined = tip.height - epoch.height;
  const timeAvg =
    mined > 0
      ? Math.max(SECOND, Math.round((tip.time - epoch.time) / mined))
      : TARGET_BLOCK_TIME;
  const remainingBlocks = EPOCH_BLOCKS - mined;
  const remainingTime = remainingBlocks * timeAvg;
  const change = (TARGET_BLOCK_TIME / timeAvg - 1) * PERCENT;
  return {
    change: Math.min(MAX_RISE, Math.max(MAX_FALL, change)),
    nextHeight: epoch.height + EPOCH_BLOCKS,
    previousChange: epoch.previousDifficulty
      ? (epoch.difficulty / epoch.previousDifficulty - 1) * PERCENT
      : 0,
    progress: (mined / EPOCH_BLOCKS) * PERCENT,
    remainingBlocks,
    remainingTime,
    retargetAt: now + remainingTime,
    timeAvg,
  };
};

/** The hash rate that finds blocks at difficulty `difficulty` every `timeAvg` ms. */
export const hashrateOf = (difficulty: number, timeAvg: number): Hashrate => ({
  current: (difficulty * HASHES_PER_DIFFICULTY) / (timeAvg / SECOND),
  difficulty,
});

interface Sample {
  time: number;
  vsize: number;
}

/**
 * How fast the mempool grows (vB/s), from samples since the last block: a
 * fair measure of what arrives, short of evictions, so a shrinking mempool
 * tells nothing (undefined).
 */
export const inflowOf = (samples: readonly Sample[]) => {
  const [first] = samples;
  const last = samples.at(-1);
  if (!first || !last || last.time - first.time < INFLOW_SPAN) {
    return;
  }
  const rate = (last.vsize - first.vsize) / ((last.time - first.time) / SECOND);
  return rate >= 0 ? Math.round(rate) : undefined;
};

const sameTxs = (a: readonly TxSummary[], b: readonly TxSummary[]) =>
  a.length === b.length && a.every((tx, index) => tx.txid === b[index]?.txid);

export interface EsploraListener {
  /** The hash rate, estimated from the difficulty and this period's pace. */
  onHashrate?: (hashrate: Hashrate) => void;
  onMessage: (update: MempoolUpdate) => void;
  onStatus: (status: FeedStatus) => void;
}

export interface EsploraFeed {
  close: () => void;
}

/**
 * Polls an Esplora API (`api`, its REST base) for what mempool.space would
 * push: new blocks, mempool statistics, fee estimates, and the transactions
 * that reach the mempool, of which the dearest make up the next block.
 * Each part polls on its own, never overlapping itself, and backs off while
 * it fails.
 */
export const createEsploraFeed = (
  api: string,
  listener: EsploraListener
): EsploraFeed => {
  const controller = new AbortController();
  const stops: (() => void)[] = [];
  /** Parts whose last poll failed. */
  const failing = new Set<string>();
  /** Waiting transactions seen arriving, by txid. */
  const known = new Map<string, TxSummary>();
  /** Blocks missed by transactions the next block should have taken. */
  const misses = new Map<string, number>();
  let closed = false;
  let status: FeedStatus = "connecting";
  let tip: Block | undefined;
  let epoch: Epoch | undefined;
  /** The tip the difficulty was last worked out for. */
  let adjustedFor: string | undefined;
  let projected: readonly ProjectedBlock[] = [];
  let stats: Omit<MempoolInfo, "minFee"> | undefined;
  let lowestFee = 0;
  let samples: Sample[] = [];
  let picked: readonly TxSummary[] = [];
  let sequence = 0;
  /** What the newest block took: the mempool's recent list may lag behind it. */
  let lastTaken: ReadonlySet<string> = new Set();

  const within = () =>
    AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]);

  const emit = (update: MempoolUpdate) => {
    if (!closed) {
      listener.onMessage(update);
    }
  };

  const setStatus = (next: FeedStatus) => {
    if (next !== status && !closed) {
      status = next;
      listener.onStatus(next);
    }
  };

  const mempoolInfo = (): MempoolInfo | undefined =>
    stats && { ...stats, minFee: lowestFee };

  const forget = (txid: string) => {
    known.delete(txid);
    misses.delete(txid);
  };

  /** The next block's list in full, as the store will hold it once sent. */
  const fullList = (txs: readonly TxSummary[]): ProjectedChange => {
    picked = txs;
    sequence += 1;
    return { full: txs, sequence };
  };

  /** The next block's list, if it changed since it was last sent. */
  const nextBlockChange = () => {
    const next = pickNextBlock(known.values(), projected[0]?.feeRange[0] ?? 0);
    return sameTxs(next, picked) ? undefined : fullList(next);
  };

  const withNextBlock = (update: MempoolUpdate): MempoolUpdate => {
    const nextBlock = nextBlockChange();
    return nextBlock ? { ...update, nextBlock } : update;
  };

  /**
   * The txids of a block, asked for again once if the first try fails;
   * undefined if they cannot be had (the block still counts).
   */
  const txidsOf = async (
    hash: string,
    tries = 2
  ): Promise<ReadonlySet<string> | undefined> => {
    try {
      const raw = await getJson(`${api}/block/${hash}/txids`, within());
      return new Set(
        Array.isArray(raw) ? raw.map(stringOf).filter(isDefined) : []
      );
    } catch (error) {
      if (closed) {
        throw error;
      }
      return tries > 1 ? txidsOf(hash, tries - 1) : undefined;
    }
  };

  /**
   * Counts a miss against each transaction the next block was to take that
   * the block just found did not: one that keeps missing was most likely
   * replaced or evicted, unseen, and goes.
   */
  const strike = (taken: ReadonlySet<string>) => {
    // Without the block's txids, there is nothing to tell.
    if (taken.size === 0) {
      return;
    }
    for (const { txid } of picked) {
      if (known.has(txid) && !taken.has(txid)) {
        const missed = (misses.get(txid) ?? 0) + 1;
        if (missed >= MAX_MISSES) {
          forget(txid);
        } else {
          misses.set(txid, missed);
        }
      }
    }
  };

  /** The latest blocks afresh: on starting, and when the chain took a turn the feed cannot follow. */
  const reload = async () => {
    const blocks = await fetchEsploraBlocks(api, within());
    const [newest] = blocks;
    if (!newest) {
      throw new Error(`No blocks from ${api}`);
    }
    // Blocks went by unseen, taking who knows which of the transactions known.
    if (tip) {
      known.clear();
      misses.clear();
      samples = [];
    }
    tip = newest;
    emit(withNextBlock({ blocks }));
  };

  /**
   * A block found while the page watched. What the store takes for its
   * contents is what the next block held just before: so that is made the
   * transactions it took, which then leave the next block.
   */
  const announce = (block: Block, taken: ReadonlySet<string> | undefined) => {
    if (!taken) {
      // Which transactions it took is unknown, so none of those known can be
      // trusted to still wait: start over, as they arrive again.
      known.clear();
      misses.clear();
      lastTaken = new Set();
      samples = [];
      tip = block;
      emit({ nextBlock: fullList([]) });
      emit(withNextBlock({ block }));
      return;
    }
    strike(taken);
    const confirmed = [...known.values()].filter((tx) => taken.has(tx.txid));
    for (const tx of confirmed) {
      forget(tx.txid);
    }
    lastTaken = taken;
    samples = [];
    tip = block;
    emit({ nextBlock: fullList(confirmed) });
    const fees = sampleFeesOf(confirmed);
    emit(withNextBlock({ block: fees ? { ...block, ...fees } : block }));
  };

  const advance = async (current: Block) => {
    const list = parseBlockList(await getJson(`${api}/blocks`, within()));
    const [newest] = list;
    // The list may lag behind the tip it was asked about.
    if (!newest || newest.id === current.id || newest.height < current.height) {
      return false;
    }
    const fresh = blocksOnTop(current, list);
    if (!fresh || fresh.length === 0 || fresh.length > MAX_FOUND) {
      await reload();
      return true;
    }
    const taken = await Promise.all(fresh.map((block) => txidsOf(block.id)));
    for (const [index, block] of fresh.entries()) {
      announce(block, taken[index]);
    }
    return true;
  };

  const loadEpoch = async (height: number): Promise<Epoch> => {
    const hash = await getText(`${api}/block-height/${height}`, within());
    const start = parseBlock(
      await getJson(`${api}/block/${hash.trim()}`, within())
    );
    if (!start) {
      throw new Error(`Block ${height} could not be read`);
    }
    const before = start.previous
      ? parseBlock(await getJson(`${api}/block/${start.previous}`, within()))
      : undefined;
    return {
      difficulty: start.difficulty,
      height,
      previousDifficulty: before?.difficulty,
      time: start.time,
    };
  };

  /** The difficulty adjustment ahead and the hash rate, once per new tip. */
  const adjust = async (current: Block) => {
    if (adjustedFor === current.id) {
      return;
    }
    const start = epochStartOf(current.height);
    const period = epoch?.height === start ? epoch : await loadEpoch(start);
    epoch = period;
    adjustedFor = current.id;
    const difficulty = adjustmentOf(current, period, Date.now());
    emit({ difficulty });
    listener.onHashrate?.(hashrateOf(current.difficulty, difficulty.timeAvg));
  };

  const pollMempool = async () => {
    const raw = recordOf(await getJson(`${api}/mempool`, within()));
    const count = numberOf(raw.count);
    const vsize = numberOf(raw.vsize);
    projected = projectBlocks(parseHistogram(raw.fee_histogram), count);
    stats = {
      count,
      maxUsage: 0,
      totalFees: numberOf(raw.total_fee),
      usage: 0,
      vsize,
    };
    const now = Date.now();
    samples = [
      ...samples.filter((sample) => now - sample.time <= INFLOW_WINDOW),
      { time: now, vsize },
    ];
    const update = withNextBlock({ mempool: mempoolInfo(), projected });
    const inflow = inflowOf(samples);
    emit(
      inflow === undefined ? update : { ...update, vBytesPerSecond: inflow }
    );
  };

  const poll = (part: string, every: number, task: () => Promise<void>) => {
    let failures = 0;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (closed || running) {
        return;
      }
      running = true;
      clearTimeout(timer);
      try {
        await task();
        failures = 0;
        failing.delete(part);
      } catch {
        failures += 1;
        failing.add(part);
      }
      running = false;
      if (closed) {
        return;
      }
      setStatus(failing.size > 0 ? "reconnecting" : "open");
      const delay = Math.min(
        every * 2 ** failures,
        Math.max(every, MAX_BACKOFF)
      );
      timer = setTimeout(() => {
        void run();
      }, delay);
    };
    // On the next tick, so a feed closed straight away never sends a request.
    timer = setTimeout(() => {
      void run();
    }, 0);
    stops.push(() => {
      clearTimeout(timer);
    });
    return run;
  };

  const refreshMempool = poll("mempool", MEMPOOL_EVERY, pollMempool);

  poll("tip", TIP_EVERY, async () => {
    const hash = await getText(`${api}/blocks/tip/hash`, within());
    if (!tip) {
      await reload();
    } else if (hash.trim() !== tip.id && (await advance(tip))) {
      // The mempool just lost a block's worth: show it now.
      void refreshMempool();
    }
    if (!tip) {
      return;
    }
    try {
      await adjust(tip);
    } catch (error) {
      // Only the difficulty waits for the next poll: blocks still count.
      if (closed) {
        throw error;
      }
    }
  });

  poll("fees", FEES_EVERY, async () => {
    const estimates = parseEstimates(
      await getJson(`${api}/fee-estimates`, within())
    );
    const fees = feesOf(estimates);
    if (!fees) {
      throw new Error(`No fee estimates from ${api}`);
    }
    lowestFee = roundUp(
      Math.min(...estimates.map((estimate) => estimate.rate))
    );
    const mempool = mempoolInfo();
    emit(mempool ? { fees, mempool } : { fees });
  });

  poll("recent", RECENT_EVERY, async () => {
    const raw = await getJson(`${api}/mempool/recent`, within());
    const now = Date.now();
    const arrived = (Array.isArray(raw) ? raw : [])
      .map(parseTxSummary)
      .filter(isDefined)
      .filter((tx) => !known.has(tx.txid) && !lastTaken.has(tx.txid))
      .map((tx) => ({ ...tx, time: now }));
    for (const tx of arrived) {
      known.set(tx.txid, tx);
    }
    if (known.size > KEEP_TXS) {
      const cheapest = [...known.values()]
        .toSorted((a, b) => a.rate - b.rate)
        .slice(0, known.size - KEEP_TXS);
      for (const tx of cheapest) {
        forget(tx.txid);
      }
    }
    const update = withNextBlock(arrived.length > 0 ? { recent: arrived } : {});
    if (Object.keys(update).length > 0) {
      emit(update);
    }
  });

  listener.onStatus(status);

  return {
    close: () => {
      closed = true;
      controller.abort();
      for (const stop of stops) {
        stop();
      }
      listener.onStatus("closed");
    },
  };
};
