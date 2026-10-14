import { useEffect } from "react";

import { fetchBlock, fetchTx } from "@/data/mempool";
import type { Block, TxDetails, TxSummary } from "@/data/types";
import { parseKey } from "@/lib/scene-key";
import { useChainStore } from "@/stores/chain-store";
import { useSummaryStore } from "@/stores/summary-store";
import { useViewStore } from "@/stores/view-store";

import { useAsync } from "./use-async";

/** What is picked, with what is known of it so far. */
export type Selection =
  | { kind: "none" }
  | {
      block?: Block;
      error?: unknown;
      hash: string;
      kind: "block";
      loading: boolean;
    }
  | { index: number; kind: "projected" }
  | {
      /** The block it was mined in, once it was. */
      blockHash?: string;
      details?: TxDetails;
      error?: unknown;
      /** Expected in the next block. */
      inNextBlock: boolean;
      kind: "tx";
      loading: boolean;
      /** What the next block's list or its block's summary say of it. */
      summary?: TxSummary;
      txid: string;
    };

type Summaries = Readonly<Record<string, readonly TxSummary[]>>;

/** The loaded block that holds a transaction, and what it says of it. */
const minedIn = (summaries: Summaries, txid: string) => {
  for (const [hash, txs] of Object.entries(summaries)) {
    const tx = txs.find((item) => item.txid === txid);
    if (tx) {
      return { hash, tx };
    }
  }
};

/**
 * The picked block or transaction, loaded in full. A transaction shows as
 * mined as soon as a loaded block holds it. Mount once: it also tells the
 * scene which block holds the picked transaction, so its city opens.
 */
export const useSelection = (): Selection => {
  const selected = useViewStore((state) => state.selected);
  const parsed = selected ? parseKey(selected) : undefined;
  const txid = parsed?.kind === "tx" ? parsed.txid : undefined;
  const hash = parsed?.kind === "block" ? parsed.hash : undefined;

  const known = useChainStore((state) =>
    hash ? state.blocks.find((block) => block.id === hash) : undefined
  );
  const block = useAsync(known ? undefined : hash, fetchBlock);
  const tx = useAsync(txid, fetchTx);
  const pending = useChainStore((state) =>
    txid ? state.nextBlock.txs.get(txid) : undefined
  );
  const minedHash = useSummaryStore((state) =>
    txid ? minedIn(state.summaries, txid)?.hash : undefined
  );
  const minedTx = useSummaryStore((state) =>
    txid ? minedIn(state.summaries, txid)?.tx : undefined
  );
  const blockHash = tx.value?.status.blockHash ?? minedHash;

  useEffect(() => {
    if (txid) {
      useViewStore.getState().actions.setTxBlock(blockHash);
    }
  }, [blockHash, txid]);

  if (txid) {
    return {
      blockHash,
      details: tx.value,
      error: tx.error,
      inNextBlock: blockHash === undefined && pending !== undefined,
      kind: "tx",
      loading: tx.loading,
      summary: minedTx ?? pending,
      txid,
    };
  }
  if (hash) {
    return {
      block: known ?? block.value,
      error: block.error,
      hash,
      kind: "block",
      loading: !known && block.loading,
    };
  }
  if (parsed?.kind === "projected") {
    return { index: parsed.index, kind: "projected" };
  }
  return { kind: "none" };
};
