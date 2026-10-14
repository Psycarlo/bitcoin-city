import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { CANDLE_INTERVALS } from "@/data/types";
import type { CandleInterval } from "@/data/types";
import { blockKey, parseKey, txKey } from "@/lib/scene-key";
import type { SceneKey } from "@/lib/scene-key";

export type ListTab = "blocks" | "mempool";

/** Panels at the foot of the screen that fold away. */
export type Dock = "blocks" | "price";

/** Parts of the scene the user can switch on and off. */
export interface SceneToggles {
  /** Takes the camera to each new block as it is found. */
  followBlocks: boolean;
  labels: boolean;
  skyline: boolean;
  trees: boolean;
}

export interface ViewData {
  /** Which docks are open. */
  docks: Record<Dock, boolean>;
  hovered?: SceneKey;
  /** Candle length of the price chart and skyline. */
  interval: CandleInterval;
  selected?: SceneKey;
  tab: ListTab;
  toggles: SceneToggles;
  /** Block holding the picked transaction, once known (it opens if sealed). */
  txBlock?: string;
  /** Everything but the city tucked away. */
  zen: boolean;
}

export interface ViewActions {
  hover: (key?: SceneKey) => void;
  /** Opens or folds a dock (`open` omitted: the other way round). */
  setDock: (dock: Dock, open?: boolean) => void;
  select: (key?: SceneKey) => void;
  setInterval: (interval: CandleInterval) => void;
  setTab: (tab: ListTab) => void;
  setTxBlock: (hash?: string) => void;
  toggle: (layer: keyof SceneToggles) => void;
  toggleZen: () => void;
  /** Ends the hover of `key`, unless something else took it over meanwhile. */
  unhover: (key: SceneKey) => void;
}

export interface ViewStore extends ViewData {
  actions: ViewActions;
}

const HEX_ID = /^[\da-f]{64}$/iu;

/** `?tx=…` and `?block=…` links open with that transaction or block picked. */
const fromUrl = (): Partial<ViewData> => {
  const params = new URLSearchParams(globalThis.location.search);
  const tx = params.get("tx");
  const block = params.get("block");
  if (tx && HEX_ID.test(tx)) {
    return { selected: txKey(tx.toLowerCase()) };
  }
  if (block && HEX_ID.test(block)) {
    return { selected: blockKey(block.toLowerCase()) };
  }
  return {};
};

/** Mirrors the pick in the address bar, so it can be shared. */
const writeUrl = (selected?: SceneKey) => {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("tx");
  url.searchParams.delete("block");
  const parsed = selected ? parseKey(selected) : undefined;
  if (parsed?.kind === "tx") {
    url.searchParams.set("tx", parsed.txid);
  }
  if (parsed?.kind === "block") {
    url.searchParams.set("block", parsed.hash);
  }
  globalThis.history.replaceState(null, "", url);
};

const isInterval = (value: unknown): value is CandleInterval =>
  CANDLE_INTERVALS.includes(value as CandleInterval);

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      actions: {
        hover: (hovered) => {
          set({ hovered });
        },
        select: (selected) => {
          set((state) =>
            state.selected === selected ? {} : { selected, txBlock: undefined }
          );
        },
        setDock: (dock, open) => {
          set((state) => ({
            docks: { ...state.docks, [dock]: open ?? !state.docks[dock] },
          }));
        },
        setInterval: (interval) => {
          set({ interval });
        },
        setTab: (tab) => {
          set({ tab });
        },
        setTxBlock: (txBlock) => {
          set({ txBlock });
        },
        toggle: (layer) => {
          set((state) => ({
            toggles: { ...state.toggles, [layer]: !state.toggles[layer] },
          }));
        },
        toggleZen: () => {
          set((state) => ({ zen: !state.zen }));
        },
        unhover: (key) => {
          set((state) => (state.hovered === key ? { hovered: undefined } : {}));
        },
      },
      docks: { blocks: false, price: false },
      interval: "1m",
      tab: "blocks",
      toggles: {
        followBlocks: false,
        labels: true,
        skyline: true,
        trees: true,
      },
      zen: false,
    }),
    {
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ViewData>;
        return {
          ...current,
          ...saved,
          docks: { ...current.docks, ...saved.docks },
          interval: isInterval(saved.interval)
            ? saved.interval
            : current.interval,
          toggles: { ...current.toggles, ...saved.toggles },
          ...fromUrl(),
        };
      },
      name: "blockcity.view",
      partialize: ({ docks, interval, tab, toggles, zen }) => ({
        docks,
        interval,
        tab,
        toggles,
        zen,
      }),
      storage: createJSONStorage(() => globalThis.localStorage),
      version: 1,
    }
  )
);

useViewStore.subscribe((state, previous) => {
  if (state.selected !== previous.selected) {
    writeUrl(state.selected);
  }
});

export const useViewActions = () => useViewStore((state) => state.actions);
