import { clamp } from "./collections";

/**
 * Fee rates (sat/vB) and their colours, from cool and cheap to hot and
 * pricey, blended on a log scale. The 3D buildings and the UI share them.
 */
export const FEE_STOPS: readonly (readonly [rate: number, colour: string])[] = [
  [0.1, "#bde3f0"],
  [0.5, "#a6dcd0"],
  [1, "#9ad8b4"],
  [2, "#b5dc8f"],
  [4, "#d7df7a"],
  [8, "#f2d36b"],
  [15, "#f7b955"],
  [30, "#f7931a"],
  [60, "#f26b4a"],
  [120, "#e94e77"],
  [300, "#c94bb5"],
  [1000, "#8b5cf6"],
];

/** The block reward's own building: a gold town hall. */
export const COINBASE_COLOUR = "#f5c542";

/** Rates labelled on the fee legend, clear of its ends. */
export const LEGEND_RATES = [1, 10, 100] as const;

const MIN_RATE = FEE_STOPS[0]?.[0] ?? 0.1;
const MAX_RATE = FEE_STOPS.at(-1)?.[0] ?? 1000;
/** Rates are cached at this precision (1/100 sat/vB). */
const CACHE_SCALE = 100;
const BYTE = 255;

/** The red, green and blue of a `#rrggbb` colour, 0–255 each. */
const toRgb = (hex: string) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

const LOG_STOPS = FEE_STOPS.map(([rate, colour]) => ({
  at: Math.log(rate),
  rgb: toRgb(colour),
}));

const toHex = (value: number) =>
  Math.round(clamp(value, 0, BYTE))
    .toString(16)
    .padStart(2, "0");

const blend = (from: readonly number[], to: readonly number[], t: number) =>
  `#${[0, 1, 2]
    .map((channel) => {
      const start = from[channel] ?? 0;
      return toHex(start + ((to[channel] ?? 0) - start) * t);
    })
    .join("")}`;

const cache = new Map<number, string>();

const computeColour = (rate: number) => {
  const at = Math.log(clamp(rate, MIN_RATE, MAX_RATE));
  for (let index = 1; index < LOG_STOPS.length; index += 1) {
    const from = LOG_STOPS[index - 1];
    const to = LOG_STOPS[index];
    if (from && to && at <= to.at) {
      return blend(from.rgb, to.rgb, (at - from.at) / (to.at - from.at));
    }
  }
  return FEE_STOPS.at(-1)?.[1] ?? "#8b5cf6";
};

/** Colour of a fee rate (sat/vB), as `#rrggbb`. */
export const feeColour = (rate: number) => {
  const key = Math.round(rate * CACHE_SCALE);
  const known = cache.get(key);
  if (known) {
    return known;
  }
  const colour = computeColour(key / CACHE_SCALE);
  cache.set(key, colour);
  return colour;
};

/** Where a rate sits on the legend's log scale (0–1). */
export const feeScalePosition = (rate: number) =>
  (Math.log(clamp(rate, MIN_RATE, MAX_RATE)) - Math.log(MIN_RATE)) /
  (Math.log(MAX_RATE) - Math.log(MIN_RATE));

const GRADIENT_STEPS = 16;

/** CSS gradient of the fee colours between two rates, on a log scale. */
export const feeGradient = (min = MIN_RATE, max = MAX_RATE) => {
  const low = Math.log(clamp(min, MIN_RATE, MAX_RATE));
  const high = Math.log(clamp(Math.max(max, min * 1.01), MIN_RATE, MAX_RATE));
  const stops = Array.from({ length: GRADIENT_STEPS + 1 }, (_, step) => {
    const share = step / GRADIENT_STEPS;
    return `${feeColour(Math.exp(low + (high - low) * share))} ${Math.round(share * 100)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
};
