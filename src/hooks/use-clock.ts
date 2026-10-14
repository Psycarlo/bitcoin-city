import { useSyncExternalStore } from "react";

interface Clock {
  read: () => number;
  subscribe: (onTick: () => void) => () => void;
}

const clocks = new Map<number, Clock>();

const createClock = (resolution: number): Clock => ({
  read: () => Math.floor(Date.now() / resolution) * resolution,
  subscribe: (onTick) => {
    const timer = setInterval(onTick, resolution);
    return () => {
      clearInterval(timer);
    };
  },
});

const clockOf = (resolution: number) => {
  const known = clocks.get(resolution);
  if (known) {
    return known;
  }
  const clock = createClock(resolution);
  clocks.set(resolution, clock);
  return clock;
};

/** Current time (epoch ms), rounded down to `resolution` and refreshed as often. */
export const useClock = (resolution = 1000) => {
  const { read, subscribe } = clockOf(resolution);
  return useSyncExternalStore(subscribe, read);
};
