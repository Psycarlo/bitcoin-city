import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "dark" | "light";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** What the system prefers, for a first visit. */
const systemTheme = (): Theme =>
  globalThis.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      setTheme: (theme) => {
        set({ theme });
      },
      theme: systemTheme(),
    }),
    {
      name: "blockcity.theme",
      partialize: ({ theme }) => ({ theme }),
      storage: createJSONStorage(() => globalThis.localStorage),
      version: 1,
    }
  )
);

/** Puts the theme on the page: the class Tailwind's `dark:` keys on, and native controls. */
const applyTheme = (theme: Theme) => {
  const root = globalThis.document?.documentElement;
  if (!root) {
    return;
  }
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
};

applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state, previous) => {
  if (state.theme !== previous.theme) {
    applyTheme(state.theme);
  }
});

export const getTheme = () => useThemeStore.getState().theme;

export const useTheme = () => useThemeStore((state) => state.theme);
