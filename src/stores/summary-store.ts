import { create } from "zustand";

import { fetchBlockSummary } from "@/data/mempool";
import type { TxSummary } from "@/data/types";

/** Block lists loaded at once (each is a few hundred kB). */
const CONCURRENCY = 2;
/** Lists kept in memory; the oldest give way. */
const KEEP = 24;
/** Waits before each new try (ms): a block just found may not be served yet. */
const RETRIES = [1500, 4000, 10_000, 30_000];

interface SummaryStore {
  /** Every transaction of each loaded block, by block hash. */
  summaries: Readonly<Record<string, readonly TxSummary[]>>;
}

export const useSummaryStore = create<SummaryStore>()(() => ({
  summaries: {},
}));

interface Job {
  /** Tries made before this one. */
  attempt: number;
  hash: string;
}

const queue: Job[] = [];
const requested = new Set<string>();
let active = 0;

const keep = (summaries: SummaryStore["summaries"]) => {
  const entries = Object.entries(summaries);
  for (const [hash] of entries.slice(0, -KEEP)) {
    requested.delete(hash);
  }
  return Object.fromEntries(entries.slice(-KEEP));
};

/** Tries to load a block's list once; on failure it queues again after a wait. */
const run = async ({ attempt, hash }: Job, next: () => void) => {
  try {
    const txs = await fetchBlockSummary(hash);
    useSummaryStore.setState((state) => ({
      summaries: keep({ ...state.summaries, [hash]: txs }),
    }));
  } catch {
    const delay = RETRIES[attempt];
    if (delay === undefined) {
      // Given up for now: asking again later tries again.
      requested.delete(hash);
    } else {
      setTimeout(() => {
        queue.push({ attempt: attempt + 1, hash });
        next();
      }, delay);
    }
  }
  active -= 1;
  next();
};

/** Starts what is queued, as far as there is room. */
const pump = () => {
  while (active < CONCURRENCY) {
    const job = queue.shift();
    if (!job) {
      return;
    }
    active += 1;
    void run(job, pump);
  }
};

/** Loads a block's transactions, once, in the order asked for. */
export const requestSummary = (hash: string) => {
  if (requested.has(hash)) {
    return;
  }
  requested.add(hash);
  queue.push({ attempt: 0, hash });
  pump();
};

export const useSummary = (hash: string | undefined) =>
  useSummaryStore((state) => (hash ? state.summaries[hash] : undefined));
