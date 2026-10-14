import { getTheme, useTheme } from "@/stores/theme-store";
import type { Theme } from "@/stores/theme-store";

/**
 * Colours of the 3D world: a model city on an island, by day (light) and
 * by night (dark). Both have the same keys. Plain strings, so the panels can
 * use them without three.js (see `paint.ts` for the scene's side).
 */
export const PALETTES = {
  dark: {
    background: "#0a1626",
    beach: "#5a5040",
    beachSide: "#3d372c",
    candleDown: "#e8796d",
    candleStem: "#2a3546",
    candleUp: "#4fb487",
    flower: "#e58fb0",
    flowerAlt: "#e8c766",
    foam: "#8fb6d4",
    grass: "#21402f",
    grassSide: "#1a3024",
    hedge: "#2c5a3d",
    hover: "#64748b",
    lane: "#5d6b80",
    link: "#475569",
    linkLive: "#f7931a",
    pad: "#1d2735",
    padNext: "#2a2620",
    padSide: "#131b26",
    pier: "#5a4330",
    projectedEdge: "#64748b",
    road: "#232d3c",
    selection: "#f7931a",
    shallow: "#123f58",
    slabSide: "#161e29",
    terrace: "#1a2330",
    trunk: "#5e4837",
    vaultSide: "#1c2533",
    water: "#0d2238",
  },
  light: {
    background: "#cfe7ee",
    beach: "#f4e4bb",
    beachSide: "#e3cc96",
    candleDown: "#f2867a",
    candleStem: "#e2e8f0",
    candleUp: "#5fc495",
    flower: "#f5a3c0",
    flowerAlt: "#f7d774",
    foam: "#ffffff",
    grass: "#c4e5a8",
    grassSide: "#a6cc8c",
    hedge: "#8cc79a",
    hover: "#94a3b8",
    lane: "#ffffff",
    link: "#cbd5e1",
    linkLive: "#f7931a",
    pad: "#fbfbfa",
    padNext: "#fff7ec",
    padSide: "#dde3ea",
    pier: "#c79d6e",
    projectedEdge: "#94a3b8",
    road: "#d3dae3",
    selection: "#f7931a",
    shallow: "#a6e8e0",
    slabSide: "#d3dae3",
    terrace: "#f6f7f9",
    trunk: "#b08967",
    vaultSide: "#cfd6df",
    water: "#7fc4dc",
  },
} as const satisfies Record<Theme, Record<string, string>>;

export type Palette = (typeof PALETTES)[Theme];
export type PaletteKey = keyof Palette;

/** Crowns of the trees, picked in turn. */
export const TREE_CROWNS: Record<Theme, readonly string[]> = {
  dark: ["#2f6b4a", "#3a7a56", "#2a5f42", "#447f5c"],
  light: ["#8fd3a8", "#a5ddb9", "#7cc69a", "#b3e4c4"],
};

/** The palette of the current theme, outside React. */
export const scenePalette = (): Palette => PALETTES[getTheme()];

/** The palette of the current theme; re-renders when it changes. */
export const usePalette = (): Palette => PALETTES[useTheme()];
