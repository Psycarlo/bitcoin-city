import { create } from "zustand";

import type { SceneKey } from "@/lib/scene-key";

/** Events kept, newest first. */
const KEEP_EVENTS = 50;

export type ActivityKind = "block" | "price-down" | "price-up" | "whale";

export interface ActivityEvent {
  detail: string;
  /** Also tells repeats apart: an event already listed is not added again. */
  id: string;
  kind: ActivityKind;
  /** What to show when the event is picked. */
  target?: SceneKey;
  time: number;
  title: string;
}

interface ActivityStore {
  actions: {
    add: (event: ActivityEvent) => void;
    markSeen: () => void;
  };
  events: readonly ActivityEvent[];
  /** Events added since the list was last opened. */
  unseen: number;
}

export const useActivityStore = create<ActivityStore>()((set) => ({
  actions: {
    add: (event) => {
      set((state) =>
        state.events.some((item) => item.id === event.id)
          ? {}
          : {
              events: [event, ...state.events].slice(0, KEEP_EVENTS),
              unseen: Math.min(KEEP_EVENTS, state.unseen + 1),
            }
      );
    },
    markSeen: () => {
      set({ unseen: 0 });
    },
  },
  events: [],
  unseen: 0,
}));

export const addActivity = (event: ActivityEvent) => {
  useActivityStore.getState().actions.add(event);
};
