export const SATS_PER_BTC = 100_000_000;
export const HALVING_INTERVAL = 210_000;
/** Most virtual bytes one block holds. */
export const BLOCK_VSIZE = 1_000_000;
/** The pace the difficulty aims for (ms). */
export const TARGET_BLOCK_TIME = 600_000;
/** Size of an everyday payment (vB): one input, two outputs, native SegWit. */
export const PAYMENT_VSIZE = 141;

const INITIAL_SUBSIDY = 50 * SATS_PER_BTC;

/** New coins a block at this height may create (sats). */
export const subsidyAt = (height: number) =>
  Math.floor(INITIAL_SUBSIDY / 2 ** Math.floor(height / HALVING_INTERVAL));

/** Where the chain stands in its halving epoch. */
export const halvingOf = (height: number) => {
  const epoch = Math.floor(height / HALVING_INTERVAL);
  const next = (epoch + 1) * HALVING_INTERVAL;
  return {
    next,
    progress: (height - epoch * HALVING_INTERVAL) / HALVING_INTERVAL,
    remaining: next - height,
    subsidyAfter: subsidyAt(next),
  };
};

const HEX_ID = /^[\da-f]{64}$/iu;
/** Block hashes start with a long run of zeros (proof of work); txids do not. */
const BLOCK_HASH = /^0{8}[\da-f]{56}$/iu;
const HEIGHT = /^#?\d{1,7}$/u;

/** What a search query names: a block (height or hash) or a transaction. */
export type ChainQuery =
  | { hash: string; kind: "block-hash" }
  | { height: number; kind: "block-height" }
  | { kind: "tx"; txid: string };

export const parseChainQuery = (text: string): ChainQuery | undefined => {
  const query = text.trim().replaceAll(",", "");
  if (HEIGHT.test(query)) {
    return { height: Number(query.replace("#", "")), kind: "block-height" };
  }
  if (BLOCK_HASH.test(query)) {
    return { hash: query.toLowerCase(), kind: "block-hash" };
  }
  if (HEX_ID.test(query)) {
    return { kind: "tx", txid: query.toLowerCase() };
  }
};
