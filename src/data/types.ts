/** Normalised shapes of what mempool.space and Binance send. Times are epoch ms. */

export type FeedStatus = "closed" | "connecting" | "open" | "reconnecting";

/** A transaction as block summaries and the projected block list it. */
export interface TxSummary {
  /** The block reward's transaction, first in every block. */
  coinbase?: boolean;
  /** Paid to the miner (sats). */
  fee: number;
  flags: number;
  /** Fee per virtual byte (sat/vB). */
  rate: number;
  /** When it reached the mempool. */
  time?: number;
  txid: string;
  /** Sum of its outputs (sats), change included. */
  value: number;
  vsize: number;
}

export interface Pool {
  name: string;
  slug: string;
}

export interface Block {
  avgFeeRate: number;
  difficulty: number;
  /** Fee rates from the cheapest to the dearest transaction, in percentiles. */
  feeRange: readonly number[];
  height: number;
  /** Block hash. */
  id: string;
  /** How closely it matched the expected template (0–100). */
  matchRate?: number;
  medianFee: number;
  pool?: Pool;
  previous?: string;
  /** Subsidy and fees (sats). */
  reward: number;
  size: number;
  time: number;
  totalFees: number;
  /** Sum of all outputs (sats). */
  totalOut?: number;
  txCount: number;
  weight: number;
}

/** A block the mempool would fill next, as mempool.space projects it. */
export interface ProjectedBlock {
  feeRange: readonly number[];
  medianFee: number;
  size: number;
  totalFees: number;
  txCount: number;
  vsize: number;
}

export interface MempoolInfo {
  count: number;
  /** Memory the mempool may use before it evicts (bytes). */
  maxUsage: number;
  /** Cheapest rate the mempool still takes (sat/vB). */
  minFee: number;
  totalFees: number;
  usage: number;
  vsize: number;
}

/** Recommended rates (sat/vB). */
export interface Fees {
  economy: number;
  fastest: number;
  halfHour: number;
  hour: number;
  minimum: number;
}

export interface DifficultyAdjustment {
  /** Expected change at the next retarget (%). */
  change: number;
  nextHeight: number;
  previousChange: number;
  /** Share of the period gone by (%). */
  progress: number;
  remainingBlocks: number;
  remainingTime: number;
  retargetAt: number;
  /** Average time between blocks this period. */
  timeAvg: number;
}

export interface Hashrate {
  current: number;
  difficulty: number;
}

export interface ProjectedDelta {
  added: readonly TxSummary[];
  changed: readonly { flags: number; rate: number; txid: string }[];
  removed: readonly string[];
}

/** A change to the next block's transactions: all of them, or what changed. */
export interface ProjectedChange {
  delta?: ProjectedDelta;
  full?: readonly TxSummary[];
  sequence: number;
}

export interface MempoolUpdate {
  /** A block just mined. */
  block?: Block;
  /** The latest blocks, on connecting. */
  blocks?: readonly Block[];
  difficulty?: DifficultyAdjustment;
  fees?: Fees;
  mempool?: MempoolInfo;
  nextBlock?: ProjectedChange;
  projected?: readonly ProjectedBlock[];
  /** A sample of the transactions that just reached the mempool. */
  recent?: readonly TxSummary[];
  /** Bitcoin's price in dollars, by mempool.space. */
  usd?: number;
  vBytesPerSecond?: number;
}

export interface TxInput {
  address?: string;
  coinbase: boolean;
  sequence: number;
  value?: number;
}

export interface TxOutput {
  address?: string;
  type: string;
  value: number;
}

export interface TxStatus {
  blockHash?: string;
  blockHeight?: number;
  blockTime?: number;
  confirmed: boolean;
}

/** A transaction in full, from the REST API. */
export interface TxDetails {
  fee: number;
  inputs: readonly TxInput[];
  locktime: number;
  outputs: readonly TxOutput[];
  size: number;
  status: TxStatus;
  txid: string;
  version: number;
  weight: number;
}

export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export interface Candle {
  close: number;
  high: number;
  low: number;
  open: number;
  /** Opening time. */
  time: number;
  volume: number;
}

/** Rolling 24-hour statistics. */
export interface Ticker {
  change: number;
  changePercent: number;
  high: number;
  last: number;
  low: number;
  open: number;
  quoteVolume: number;
  trades: number;
  volume: number;
}
