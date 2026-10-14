import { useCallback, useSyncExternalStore } from "react";

/** Whether the CSS media query matches, kept up to date. */
export const useMediaQuery = (query: string) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = globalThis.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query]
  );
  const read = useCallback(() => globalThis.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, read);
};
