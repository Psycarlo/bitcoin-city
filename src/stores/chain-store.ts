import { create } from "zustand";

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
} from "@/data/types";

/** Confirmed blocks kept, newest first: those on show, and one to spare. */
export const KEEP_BLOCKS = 16;
/** Live blocks remembered (their arrival and what they likely held). */
const KEEP_ARRIVALS = 4;

export interface NextBlock {
  /** Place in mempool.space's stream of changes; 0 while the full list is awaited. */
  sequence: number;
  txs: ReadonlyMap<string, TxSummary>;
}

export interface ChainData {
  /** When each block found live arrived, by hash (not those in the first batch). */
  arrivals: Readonly<Record<string, number>>;
  /** Newest first. */
  blocks: readonly Block[];
  difficulty?: DifficultyAdjustment;
  fees?: Fees;
  hashrate?: Hashrate;
  mempool?: MempoolInfo;
  /** The transactions mempool.space expects in the next block. */
  nextBlock: NextBlock;
  /** Blocks the mempool would fill, the next one first. */
  projected: readonly ProjectedBlock[];
  /**
   * What the next block held just before each live block was found, by the
   * found block's hash: its likely contents until its own list loads.
   */
  provisional: Readonly<Record<string, readonly TxSummary[]>>;
  status: FeedStatus;
  /** Bitcoin's price by mempool.space, until Binance's arrives. */
  usd?: number;
  vBytesPerSecond?: number;
}

export interface ReceiveResult {
  /** A block found just now, unknown until this update. */
  found?: Block;
  /** The next block's list fell out of step: ask for all of it again. */
  resync: boolean;
}

export const INITIAL_CHAIN: ChainData = {
  arrivals: {},
  blocks: [],
  nextBlock: { sequence: 0, txs: new Map() },
  projected: [],
  provisional: {},
  status: "connecting",
};

/**
 * Blocks old and new, newest first. A block replaces one at its height (the
 * chain reorganised), so the newer word wins.
 */
export const mergeBlocks = (
  known: readonly Block[],
  incoming: readonly Block[]
) => {
  const byHeight = new Map<number, Block>();
  for (const block of [...known, ...incoming]) {
    byHeight.set(block.height, block);
  }
  return [...byHeight.values()]
    .toSorted((a, b) => b.height - a.height)
    .slice(0, KEEP_BLOCKS);
};

/**
 * Applies a change to the next block's list: a full list replaces it; a delta
 * applies on top, if it follows on from the last change. One that does not
 * means a change went missing, so the list is asked for again (and kept
 * meanwhile).
 */
export const applyNextBlock = (
  current: NextBlock,
  change: ProjectedChange
): { next: NextBlock; resync: boolean } => {
  if (change.full) {
    return {
      next: {
        sequence: change.sequence,
        txs: new Map(change.full.map((tx) => [tx.txid, tx])),
      },
      resync: false,
    };
  }
  const { delta } = change;
  // Without a list to apply it to, a delta waits for the full one, on its way.
  if (!delta || current.sequence === 0) {
    return { next: current, resync: false };
  }
  if (change.sequence !== current.sequence + 1) {
    return { next: { ...current, sequence: 0 }, resync: true };
  }
  const txs = new Map(current.txs);
  for (const txid of delta.removed) {
    txs.delete(txid);
  }
  for (const tx of delta.added) {
    txs.set(tx.txid, tx);
  }
  for (const { flags, rate, txid } of delta.changed) {
    const tx = txs.get(txid);
    if (tx) {
      txs.set(txid, { ...tx, flags, rate });
    }
  }
  return { next: { sequence: change.sequence, txs }, resync: false };
};

const latest = <T>(record: Readonly<Record<string, T>>, keep: number) =>
  Object.fromEntries(Object.entries(record).slice(-keep));

/** The chain after an update of the live feed, and what stood out in it. */
export const receiveUpdate = (
  state: ChainData,
  update: MempoolUpdate,
  now: number
): { result: ReceiveResult; state: ChainData } => {
  const next: ChainData = { ...state };
  if (update.blocks) {
    next.blocks = mergeBlocks(next.blocks, update.blocks);
  }
  let found: Block | undefined;
  // Before the next block's own change, which comes with it: what the next
  // block held until now is what the found block most likely holds.
  if (update.block) {
    const { block } = update;
    const [tip] = next.blocks;
    const known = next.blocks.some((item) => item.id === block.id);
    next.blocks = mergeBlocks(next.blocks, [block]);
    if (!known && tip && block.height > tip.height) {
      found = block;
      next.arrivals = latest(
        { ...next.arrivals, [block.id]: now },
        KEEP_ARRIVALS
      );
      next.provisional = latest(
        { ...next.provisional, [block.id]: [...next.nextBlock.txs.values()] },
        KEEP_ARRIVALS
      );
    }
  }
  let resync = false;
  if (update.nextBlock) {
    const applied = applyNextBlock(next.nextBlock, update.nextBlock);
    next.nextBlock = applied.next;
    ({ resync } = applied);
  }
  if (update.projected) {
    next.projected = update.projected;
  }
  if (update.mempool) {
    next.mempool = update.mempool;
  }
  if (update.fees) {
    next.fees = update.fees;
  }
  if (update.difficulty) {
    next.difficulty = update.difficulty;
  }
  if (update.usd !== undefined) {
    next.usd = update.usd;
  }
  if (update.vBytesPerSecond !== undefined) {
    next.vBytesPerSecond = update.vBytesPerSecond;
  }
  return { result: { found, resync }, state: next };
};

interface ChainActions {
  receive: (update: MempoolUpdate) => ReceiveResult;
  reset: () => void;
  setHashrate: (hashrate: Hashrate) => void;
  setStatus: (status: FeedStatus) => void;
}

interface ChainStore extends ChainData {
  actions: ChainActions;
}

export const useChainStore = create<ChainStore>()((set, get) => ({
  ...INITIAL_CHAIN,
  actions: {
    receive: (update) => {
      const { result, state } = receiveUpdate(get(), update, Date.now());
      set(state);
      return result;
    },
    reset: () => {
      set(INITIAL_CHAIN);
    },
    setHashrate: (hashrate) => {
      set({ hashrate });
    },
    setStatus: (status) => {
      set({ status });
    },
  },
}));

export const useChainActions = () => useChainStore((state) => state.actions);

export const useTip = () => useChainStore((state) => state.blocks[0]);

/**
 * When the newest block was found (ms): when this page saw it arrive if it
 * did, truer than the miner's clock, which can run minutes ahead.
 */
export const lastBlockTime = ({ arrivals, blocks: [tip] }: ChainData) =>
  tip ? (arrivals[tip.id] ?? tip.time) : undefined;

export const useLastBlockTime = () => useChainStore(lastBlockTime);
