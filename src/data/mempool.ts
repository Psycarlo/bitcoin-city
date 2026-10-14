import { getJson, getText } from "./http";
import {
  isDefined,
  isRecord,
  numberOf,
  numbersOf,
  optionalNumber,
  parseJson,
  stringOf,
} from "./json";
import type { JsonRecord } from "./json";
import type {
  Block,
  DifficultyAdjustment,
  Fees,
  Hashrate,
  MempoolInfo,
  MempoolUpdate,
  ProjectedBlock,
  ProjectedChange,
  ProjectedDelta,
  TxDetails,
  TxInput,
  TxOutput,
  TxSummary,
} from "./types";

/** mempool.space: an open Bitcoin explorer with a public API and live updates. */
const ORIGIN = "https://mempool.space";
const API = `${ORIGIN}/api`;
const SECOND = 1000;
/** Bitcoin Core reports amounts in BTC (and fee floors in BTC per kvB). */
const SATS_PER_BTC = 100_000_000;
const SAT_PER_VB_IN_BTC_PER_KVB = SATS_PER_BTC / 1000;

export const MEMPOOL_SOCKET_URL = "wss://mempool.space/api/v1/ws";
export const MEMPOOL_PING = JSON.stringify({ action: "ping" });
/** Asks for the next block's transactions: all of them, then what changes. */
export const TRACK_NEXT_BLOCK = JSON.stringify({ "track-mempool-block": 0 });
/** Sent on connecting: the current state, then live blocks, stats and projected blocks. */
export const MEMPOOL_SUBSCRIBE = [
  JSON.stringify({ action: "init" }),
  JSON.stringify({
    action: "want",
    data: ["blocks", "stats", "mempool-blocks"],
  }),
  TRACK_NEXT_BLOCK,
] as const;

export const mempoolLinks = {
  block: (hash: string) => `${ORIGIN}/block/${hash}`,
  tx: (txid: string) => `${ORIGIN}/tx/${txid}`,
};

/** Logo of a mining pool, by its slug. */
export const poolLogoUrl = (slug: string) =>
  `${ORIGIN}/resources/mining-pools/${slug}.svg`;

const recordOf = (value: unknown): JsonRecord => (isRecord(value) ? value : {});

/** Seconds, as sent, to epoch ms. */
const timeOf = (value: unknown) => {
  const seconds = optionalNumber(value);
  return seconds ? seconds * SECOND : undefined;
};

export const parseBlock = (raw: unknown): Block | undefined => {
  if (!isRecord(raw)) {
    return;
  }
  const id = stringOf(raw.id);
  const height = optionalNumber(raw.height);
  if (!id || height === undefined) {
    return;
  }
  const extras = recordOf(raw.extras);
  const pool = isRecord(extras.pool) ? extras.pool : undefined;
  const poolName = stringOf(pool?.name);
  return {
    avgFeeRate: numberOf(extras.avgFeeRate),
    difficulty: numberOf(raw.difficulty),
    feeRange: numbersOf(extras.feeRange),
    height,
    id,
    matchRate: optionalNumber(extras.matchRate),
    medianFee: numberOf(extras.medianFee),
    pool: poolName
      ? { name: poolName, slug: stringOf(pool?.slug) ?? "" }
      : undefined,
    previous: stringOf(raw.previousblockhash),
    reward: numberOf(extras.reward),
    size: numberOf(raw.size),
    time: timeOf(raw.timestamp) ?? 0,
    totalFees: numberOf(extras.totalFees),
    totalOut: optionalNumber(extras.totalOutputAmt),
    txCount: numberOf(raw.tx_count),
    weight: numberOf(raw.weight),
  };
};

/**
 * A transaction as mempool.space strips it down: an object in block
 * summaries, a tuple `[txid, fee, vsize, value, rate, flags, time]` in the
 * live projected block.
 */
export const parseTxSummary = (raw: unknown): TxSummary | undefined => {
  if (Array.isArray(raw)) {
    const [txid, fee, vsize, value, rate, flags, time] = raw as unknown[];
    return parseTxSummary({ fee, flags, rate, time, txid, value, vsize });
  }
  if (!isRecord(raw)) {
    return;
  }
  const txid = stringOf(raw.txid);
  const vsize = optionalNumber(raw.vsize);
  if (!txid || !vsize) {
    return;
  }
  const fee = numberOf(raw.fee);
  return {
    fee,
    flags: numberOf(raw.flags),
    rate: optionalNumber(raw.rate) ?? fee / vsize,
    time: timeOf(raw.time),
    txid,
    value: numberOf(raw.value),
    vsize,
  };
};

const parseTxList = (raw: unknown) =>
  Array.isArray(raw) ? raw.map(parseTxSummary).filter(isDefined) : [];

const parseMempoolInfo = (raw: JsonRecord): MempoolInfo => ({
  count: numberOf(raw.size),
  maxUsage: numberOf(raw.maxmempool),
  minFee: numberOf(raw.mempoolminfee) * SAT_PER_VB_IN_BTC_PER_KVB,
  totalFees: Math.round(numberOf(raw.total_fee) * SATS_PER_BTC),
  usage: numberOf(raw.usage),
  vsize: numberOf(raw.bytes),
});

const parseFees = (raw: JsonRecord): Fees => ({
  economy: numberOf(raw.economyFee),
  fastest: numberOf(raw.fastestFee),
  halfHour: numberOf(raw.halfHourFee),
  hour: numberOf(raw.hourFee),
  minimum: numberOf(raw.minimumFee),
});

const parseDifficulty = (raw: JsonRecord): DifficultyAdjustment => ({
  change: numberOf(raw.difficultyChange),
  nextHeight: numberOf(raw.nextRetargetHeight),
  previousChange: numberOf(raw.previousRetarget),
  progress: numberOf(raw.progressPercent),
  remainingBlocks: numberOf(raw.remainingBlocks),
  remainingTime: numberOf(raw.remainingTime),
  retargetAt: numberOf(raw.estimatedRetargetDate),
  timeAvg: numberOf(raw.timeAvg),
});

const parseProjectedBlock = (raw: unknown): ProjectedBlock | undefined => {
  if (!isRecord(raw)) {
    return;
  }
  return {
    feeRange: numbersOf(raw.feeRange),
    medianFee: numberOf(raw.medianFee),
    size: numberOf(raw.blockSize),
    totalFees: numberOf(raw.totalFees),
    txCount: numberOf(raw.nTx),
    vsize: numberOf(raw.blockVSize),
  };
};

/** A transaction whose fee rate changed: `[txid, rate, flags]`. */
const parseChange = (change: unknown) => {
  if (!Array.isArray(change)) {
    return;
  }
  const [txid, rate, flags] = change as unknown[];
  const id = stringOf(txid);
  if (!id) {
    return;
  }
  return { flags: numberOf(flags), rate: numberOf(rate), txid: id };
};

const parseDelta = (raw: JsonRecord): ProjectedDelta => ({
  added: parseTxList(raw.added),
  changed: Array.isArray(raw.changed)
    ? raw.changed.map(parseChange).filter(isDefined)
    : [],
  removed: Array.isArray(raw.removed)
    ? raw.removed.map(stringOf).filter(isDefined)
    : [],
});

const parseNextBlock = (raw: JsonRecord): ProjectedChange | undefined => {
  if (numberOf(raw.index, -1) !== 0) {
    return;
  }
  const sequence = numberOf(raw.sequence);
  if (Array.isArray(raw.blockTransactions)) {
    return { full: parseTxList(raw.blockTransactions), sequence };
  }
  if (isRecord(raw.delta)) {
    return { delta: parseDelta(raw.delta), sequence };
  }
};

/** Reads a message of mempool.space's live feed; most carry several parts. */
export const parseMempoolMessage = (
  data: unknown
): MempoolUpdate | undefined => {
  const message = parseJson(data);
  if (!isRecord(message)) {
    return;
  }
  const update: MempoolUpdate = {};
  const block = parseBlock(message.block);
  if (block) {
    update.block = block;
  }
  if (Array.isArray(message.blocks)) {
    update.blocks = message.blocks.map(parseBlock).filter(isDefined);
  }
  if (isRecord(message.mempoolInfo)) {
    update.mempool = parseMempoolInfo(message.mempoolInfo);
  }
  const vBytesPerSecond = optionalNumber(message.vBytesPerSecond);
  if (vBytesPerSecond !== undefined) {
    update.vBytesPerSecond = vBytesPerSecond;
  }
  const projected = message["mempool-blocks"];
  if (Array.isArray(projected)) {
    update.projected = projected.map(parseProjectedBlock).filter(isDefined);
  }
  if (Array.isArray(message.transactions)) {
    update.recent = parseTxList(message.transactions);
  }
  if (isRecord(message.fees)) {
    update.fees = parseFees(message.fees);
  }
  if (isRecord(message.da)) {
    update.difficulty = parseDifficulty(message.da);
  }
  const usd = optionalNumber(recordOf(message.conversions).USD);
  if (usd) {
    update.usd = usd;
  }
  const projectedTxs = message["projected-block-transactions"];
  const nextBlock = isRecord(projectedTxs)
    ? parseNextBlock(projectedTxs)
    : undefined;
  if (nextBlock) {
    update.nextBlock = nextBlock;
  }
  return Object.keys(update).length > 0 ? update : undefined;
};

/** The 15 latest blocks, newest first. */
export const fetchRecentBlocks = async (signal?: AbortSignal) => {
  const raw = await getJson(`${API}/v1/blocks`, signal);
  return Array.isArray(raw) ? raw.map(parseBlock).filter(isDefined) : [];
};

export const fetchBlock = async (hash: string, signal?: AbortSignal) => {
  const block = parseBlock(await getJson(`${API}/v1/block/${hash}`, signal));
  if (!block) {
    throw new Error(`Block ${hash} could not be read`);
  }
  return block;
};

const BLOCK_HASH = /^[\da-f]{64}$/iu;

/** The hash of the block at a height on the main chain. */
export const fetchBlockHash = async (height: number, signal?: AbortSignal) => {
  const text = await getText(`${API}/block-height/${height}`, signal);
  const hash = text.trim();
  if (!BLOCK_HASH.test(hash)) {
    throw new Error(`No block at height ${height}`);
  }
  return hash.toLowerCase();
};

/** Every transaction in a block, the coinbase first. */
export const fetchBlockSummary = async (
  hash: string,
  signal?: AbortSignal
): Promise<readonly TxSummary[]> => {
  const raw = await getJson(`${API}/v1/block/${hash}/summary`, signal);
  return parseTxList(raw).map((tx, index) =>
    index === 0 ? { ...tx, coinbase: true } : tx
  );
};

const parseInput = (raw: unknown): TxInput => {
  const input = recordOf(raw);
  const previous = recordOf(input.prevout);
  return {
    address: stringOf(previous.scriptpubkey_address),
    coinbase: input.is_coinbase === true,
    sequence: numberOf(input.sequence),
    value: optionalNumber(previous.value),
  };
};

const parseOutput = (raw: unknown): TxOutput => {
  const output = recordOf(raw);
  return {
    address: stringOf(output.scriptpubkey_address),
    type: stringOf(output.scriptpubkey_type) ?? "unknown",
    value: numberOf(output.value),
  };
};

export const fetchTx = async (
  txid: string,
  signal?: AbortSignal
): Promise<TxDetails> => {
  const raw = recordOf(await getJson(`${API}/tx/${txid}`, signal));
  const status = recordOf(raw.status);
  return {
    fee: numberOf(raw.fee),
    inputs: Array.isArray(raw.vin) ? raw.vin.map(parseInput) : [],
    locktime: numberOf(raw.locktime),
    outputs: Array.isArray(raw.vout) ? raw.vout.map(parseOutput) : [],
    size: numberOf(raw.size),
    status: {
      blockHash: stringOf(status.block_hash),
      blockHeight: optionalNumber(status.block_height),
      blockTime: timeOf(status.block_time),
      confirmed: status.confirmed === true,
    },
    txid: stringOf(raw.txid) ?? txid,
    version: numberOf(raw.version),
    weight: numberOf(raw.weight),
  };
};

/** The network's hash rate and difficulty, from the last three days. */
export const fetchHashrate = async (
  signal?: AbortSignal
): Promise<Hashrate> => {
  const raw = recordOf(await getJson(`${API}/v1/mining/hashrate/3d`, signal));
  return {
    current: numberOf(raw.currentHashrate),
    difficulty: numberOf(raw.currentDifficulty),
  };
};
