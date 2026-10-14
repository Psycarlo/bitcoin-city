import type { Color } from "three";

import { useThemeStore } from "@/stores/theme-store";

import { PALETTES, scenePalette } from "./palette";
import type { Palette, PaletteKey } from "./palette";

/** Colours that follow the theme, each with the palette key it shows. */
const tracked = new Map<Color, PaletteKey>();

/**
 * Keeps a three.js colour (a material's, usually) set to a palette colour,
 * now and whenever the theme changes. For things that live as long as the
 * page; returns the colour.
 */
export const track = (colour: Color, key: PaletteKey) => {
  colour.set(scenePalette()[key]);
  tracked.set(colour, key);
  return colour;
};

/** Ties a material's colour to the palette; returns the material. */
export const paint = <M extends { color: Color }>(
  material: M,
  key: PaletteKey
): M => {
  track(material.color, key);
  return material;
};

/** Ties a material's glow to the palette; returns the material. */
export const paintGlow = <M extends { emissive: Color }>(
  material: M,
  key: PaletteKey
): M => {
  track(material.emissive, key);
  return material;
};

/** Things repainted by hand when the theme changes (instance colours, mostly). */
const painters = new Set<(palette: Palette) => void>();

/**
 * Calls `paintWith` with the palette now and whenever the theme changes,
 * until the returned function is called.
 */
export const onPalette = (paintWith: (palette: Palette) => void) => {
  paintWith(scenePalette());
  painters.add(paintWith);
  return () => {
    painters.delete(paintWith);
  };
};

useThemeStore.subscribe((state, previous) => {
  if (state.theme === previous.theme) {
    return;
  }
  const palette = PALETTES[state.theme];
  for (const [colour, key] of tracked) {
    colour.set(palette[key]);
  }
  for (const paintWith of painters) {
    paintWith(palette);
  }
});
