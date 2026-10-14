import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getJson, getText } from "@/data/http";
import { isRecord, optionalNumber, stringOf } from "@/data/json";

/**
 * Where the chain comes from: a full mempool backend (REST and live
 * updates), or a bare Esplora API, polled, which knows less.
 */
export type SourceKind = "esplora" | "mempool";

export interface Source {
  /** REST base, no trailing slash, e.g. https://mempool.space/api */
  api: string;
  kind: SourceKind;
  /** Short name for the UI: the host, plus the path when not root, e.g. "mempool.space/testnet4". */
  label: string;
  /** Explorer web base for links, e.g. https://mempool.space/testnet4 */
  web: string;
  /** Websocket URL, only for kind "mempool": wss://mempool.space/api/v1/ws */
  ws?: string;
}

/** The addresses an explorer's base URL implies, whichever kind it turns out to be. */
export interface SourceUrls {
  api: string;
  label: string;
  web: string;
  ws: string;
}

export const DEFAULT_SOURCE: Source = {
  api: "https://mempool.space/api",
  kind: "mempool",
  label: "mempool.space",
  web: "https://mempool.space",
  ws: "wss://mempool.space/api/v1/ws",
};

const SECOND = 1000;
/** A probe that hears nothing back in this long (ms) counts as unreachable. */
const PROBE_TIMEOUT = 10 * SECOND;
const SCHEME = /^[a-z][\d+.a-z-]*:\/\//iu;
const TRAILING_SLASHES = /\/+$/u;
const TRAILING_API = /\/api$/iu;

/**
 * Reads what someone typed as the address of an explorer: "mempool.space",
 * "https://mempool.space/testnet4/api/"… The REST API lives under `/api` of
 * the base, live updates under `/api/v1/ws`. Undefined for anything that is
 * not an http(s) address.
 */
export const parseSourceUrl = (input: string): SourceUrls | undefined => {
  const text = input.trim();
  if (!text) {
    return;
  }
  let url: URL;
  try {
    url = new URL(SCHEME.test(text) ? text : `https://${text}`);
  } catch {
    return;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.host) {
    return;
  }
  const path = url.pathname
    .replace(TRAILING_SLASHES, "")
    .replace(TRAILING_API, "");
  const web = `${url.origin}${path}`;
  const socket = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    api: `${web}/api`,
    label: `${url.host}${path}`,
    web,
    ws: `${socket}//${url.host}${path}/api/v1/ws`,
  };
};

/** Whether a request answers in time with a body that passes `check`. */
const answers = async (
  load: (signal: AbortSignal) => Promise<unknown>,
  check: (body: unknown) => boolean,
  signal?: AbortSignal
) => {
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT);
  try {
    return check(
      await load(signal ? AbortSignal.any([signal, timeout]) : timeout)
    );
  } catch (error) {
    // Called off by the caller: stop probing altogether.
    if (signal?.aborted) {
      throw error;
    }
    return false;
  }
};

/** mempool's recommended fees: only a full mempool backend has them. */
const isMempoolFees = (body: unknown) =>
  isRecord(body) && optionalNumber(body.fastestFee) !== undefined;

/** Esplora's tip height: a plain number. */
const isHeight = (body: unknown) => {
  const text = stringOf(body)?.trim();
  return Boolean(text) && Number.isInteger(Number(text));
};

/**
 * Finds out what an address serves: a full mempool backend, else a bare
 * Esplora API. Throws, with a message fit to show, when it is neither or
 * cannot be reached from this page.
 */
export const probeSource = async (
  input: string,
  signal?: AbortSignal
): Promise<Source> => {
  const urls = parseSourceUrl(input);
  if (!urls) {
    throw new Error(`"${input.trim()}" is not a web address`);
  }
  const mempool = await answers(
    (within) => getJson(`${urls.api}/v1/fees/recommended`, within),
    isMempoolFees,
    signal
  );
  if (mempool) {
    return { ...urls, kind: "mempool" };
  }
  const esplora = await answers(
    (within) => getText(`${urls.api}/blocks/tip/height`, within),
    isHeight,
    signal
  );
  if (esplora) {
    const { api, label, web } = urls;
    return { api, kind: "esplora", label, web };
  }
  throw new Error(
    `Could not reach ${urls.label} — check the URL and that it allows cross-origin requests`
  );
};

const isSource = (value: unknown): value is Source => {
  if (!isRecord(value)) {
    return false;
  }
  const { api, kind, label, web, ws } = value;
  const named = [api, label, web].every((item) => typeof item === "string");
  if (kind === "mempool") {
    return named && typeof ws === "string";
  }
  return named && kind === "esplora";
};

interface SourceActions {
  /** Back to mempool.space. */
  resetSource: () => void;
  setSource: (source: Source) => void;
}

interface SourceStore {
  actions: SourceActions;
  source: Source;
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set) => ({
      actions: {
        resetSource: () => {
          set({ source: DEFAULT_SOURCE });
        },
        setSource: (source) => {
          set({ source });
        },
      },
      source: DEFAULT_SOURCE,
    }),
    {
      // A source saved in a shape this version cannot read gives way to the default.
      merge: (persisted, current) => {
        const saved = isRecord(persisted) ? persisted.source : undefined;
        return isSource(saved) ? { ...current, source: saved } : current;
      },
      name: "blockcity.source",
      partialize: ({ source }) => ({ source }),
      storage: createJSONStorage(() => globalThis.localStorage),
      version: 1,
    }
  )
);

/** The source in use, outside React (read at call time). */
export const getSource = () => useSourceStore.getState().source;

export const useSource = () => useSourceStore((state) => state.source);

export const useSourceActions = () => useSourceStore((state) => state.actions);
