import { describe, expect, test } from "bun:test";

import {
  COINBASE_COLOUR,
  FEE_STOPS,
  feeColour,
  feeGradient,
  feeScalePosition,
} from "./fees";

const HEX_COLOUR = /^#[\da-f]{6}$/u;

const channels = (hex: string) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

describe("feeColour", () => {
  test("gives each stop its own colour", () => {
    for (const [rate, colour] of FEE_STOPS) {
      expect(feeColour(rate)).toBe(colour);
    }
  });

  test("holds the end colours beyond the scale", () => {
    expect(feeColour(0)).toBe("#bde3f0");
    expect(feeColour(0.01)).toBe("#bde3f0");
    expect(feeColour(50_000)).toBe("#8b5cf6");
  });

  test("blends between stops", () => {
    // 21 sat/vB sits between the stops at 15 and 30.
    const colour = feeColour(21);
    expect(colour).toMatch(HEX_COLOUR);
    const [from, to] = [channels("#f7b955"), channels("#f7931a")];
    for (const [channel, value] of channels(colour).entries()) {
      const ends = [from[channel] ?? 0, to[channel] ?? 0];
      expect(value).toBeGreaterThanOrEqual(Math.min(...ends));
      expect(value).toBeLessThanOrEqual(Math.max(...ends));
    }
    expect(colour).not.toBe("#f7b955");
    expect(colour).not.toBe("#f7931a");
  });

  test("keeps the coinbase apart from every fee colour", () => {
    expect(FEE_STOPS.map(([, colour]) => colour)).not.toContain(
      COINBASE_COLOUR
    );
  });
});

describe("feeScalePosition", () => {
  test("places rates on a log scale from 0.1 to 1,000 sat/vB", () => {
    expect(feeScalePosition(0.1)).toBe(0);
    expect(feeScalePosition(10)).toBeCloseTo(0.5);
    expect(feeScalePosition(1000)).toBe(1);
  });

  test("holds rates beyond the scale at its ends", () => {
    expect(feeScalePosition(0.001)).toBe(0);
    expect(feeScalePosition(1e6)).toBe(1);
  });
});

describe("feeGradient", () => {
  test("runs through the fee colours between two rates", () => {
    const gradient = feeGradient(1, 100);
    expect(gradient).toStartWith(`linear-gradient(90deg, ${feeColour(1)} 0%,`);
    expect(gradient).toEndWith(`, ${feeColour(100)} 100%)`);
  });

  test("covers the whole scale by default", () => {
    const gradient = feeGradient();
    expect(gradient).toContain("#bde3f0 0%");
    expect(gradient).toContain("#8b5cf6 100%");
  });
});
