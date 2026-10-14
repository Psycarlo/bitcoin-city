import type { Block, ProjectedBlock, TxSummary } from "@/data/types";

import { parseChainQuery } from "./bitcoin";

/** Results listed at most. */
export const MAX_HITS = 8;
/** Hex characters typed before transactions and hashes are searched by prefix. */
const MIN_PREFIX = 4;
const HEX = /^[\da-f]+$/u;
/** Words that lead to the block being mined. */
const NEXT_BLOCK = "next block";

/** Something a search leads to. */
export type SearchHit =
  | { block: Block; kind: "block" }
  /** A block not loaded, looked up on mempool.space when picked. */
  | { hash: string; kind: "block-hash" }
  | { height: number; kind: "block-height" }
  | { block: ProjectedBlock; index: number; kind: "projected" }
  | {
      /** Height of the block it is in, when it is in a loaded one. */
      height?: number;
      kind: "tx";
      mined: boolean;
      tx: TxSummary;
    }
  /** A transaction not loaded, looked up on mempool.space when picked. */
  | { kind: "txid"; txid: string };

/** What the search looks through: what the page has loaded. */
export interface SearchSources {
  /** Newest first. */
  blocks: readonly Block[];
  /** The transactions expected in the next block, by txid. */
  pending: ReadonlyMap<string, TxSummary>;
  projected: readonly ProjectedBlock[];
  /** Every transaction of each loaded block, by block hash. */
  summaries: Readonly<Record<string, readonly TxSummary[]>>;
}

/** Tells hits apart: two hits leading to the same place share it. */
export const hitId = (hit: SearchHit) => {
  switch (hit.kind) {
    case "block": {
      return `block:${hit.block.id}`;
    }
    case "block-hash": {
      return `block:${hit.hash}`;
    }
    case "block-height": {
      return `height:${hit.height}`;
    }
    case "projected": {
      return `projected:${hit.index}`;
    }
    case "tx": {
      return `tx:${hit.tx.txid}`;
    }
    default: {
      return `tx:${hit.txid}`;
    }
  }
};

/** Transactions whose id starts with `prefix`: those waiting first, then mined ones. */
const findTxs = (
  { blocks, pending, summaries }: SearchSources,
  prefix: string,
  limit: number
) => {
  const hits: SearchHit[] = [];
  for (const tx of pending.values()) {
    if (tx.txid.startsWith(prefix)) {
      hits.push({ kind: "tx", mined: false, tx });
      if (hits.length >= limit) {
        return hits;
      }
    }
  }
  const heights = new Map(blocks.map((block) => [block.id, block.height]));
  for (const [hash, txs] of Object.entries(summaries)) {
    for (const tx of txs) {
      if (tx.txid.startsWith(prefix)) {
        hits.push({ height: heights.get(hash), kind: "tx", mined: true, tx });
        if (hits.length >= limit) {
          return hits;
        }
      }
    }
  }
  return hits;
};

/** A height: the loaded block, the projected one if still to come, else a lookup. */
const heightHits = (sources: SearchSources, height: number): SearchHit[] => {
  const { blocks, projected } = sources;
  const loaded = blocks.find((block) => block.height === height);
  const tip = blocks[0]?.height;
  const hits: SearchHit[] = [];
  if (loaded) {
    hits.push({ block: loaded, kind: "block" });
  }
  // Loaded blocks whose height starts with the digits typed so far.
  const digits = String(height);
  for (const block of blocks) {
    if (block !== loaded && String(block.height).startsWith(digits)) {
      hits.push({ block, kind: "block" });
    }
  }
  if (loaded) {
    return hits;
  }
  if (tip !== undefined && height > tip) {
    const index = height - tip - 1;
    const block = projected[index];
    if (block) {
      hits.push({ block, index, kind: "projected" });
    }
    return hits;
  }
  hits.push({ height, kind: "block-height" });
  return hits;
};

/**
 * Blocks and transactions matching a query: a height, a block hash, a txid
 * (or the first few characters of one), a mining pool or "next block".
 * Full ids not loaded on the page are offered as lookups.
 */
export const searchChain = (
  sources: SearchSources,
  text: string
): SearchHit[] => {
  const query = text.trim().toLowerCase().replaceAll(",", "");
  if (!query) {
    return [];
  }
  const { blocks, projected } = sources;
  const parsed = parseChainQuery(query);
  const hits: SearchHit[] = [];

  switch (parsed?.kind) {
    case "block-height": {
      hits.push(...heightHits(sources, parsed.height));
      break;
    }
    case "block-hash": {
      const block = blocks.find((item) => item.id === parsed.hash);
      hits.push(block ? { block, kind: "block" } : { ...parsed });
      break;
    }
    case "tx": {
      const [found] = findTxs(sources, parsed.txid, 1);
      hits.push(found ?? { kind: "txid", txid: parsed.txid });
      break;
    }
    default: {
      break;
    }
  }

  const [next] = projected;
  if (next && query.length >= 2 && NEXT_BLOCK.startsWith(query)) {
    hits.push({ block: next, index: 0, kind: "projected" });
  }
  for (const block of blocks) {
    const { pool } = block;
    if (
      pool &&
      (pool.name.toLowerCase().includes(query) || pool.slug.includes(query))
    ) {
      hits.push({ block, kind: "block" });
    }
  }
  if (!parsed && query.length >= MIN_PREFIX && HEX.test(query)) {
    for (const block of blocks) {
      if (block.id.startsWith(query)) {
        hits.push({ block, kind: "block" });
      }
    }
    hits.push(...findTxs(sources, query, MAX_HITS));
  }

  const seen = new Set<string>();
  return hits
    .filter((hit) => {
      const id = hitId(hit);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    })
    .slice(0, MAX_HITS);
};
