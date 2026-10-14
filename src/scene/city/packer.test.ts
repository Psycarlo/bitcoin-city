import { describe, expect, test } from "bun:test";

import { EMPTY, GridPacker, packSquares } from "./packer";

/** Cells each owner holds, from the grid. */
const cellsByOwner = (packer: GridPacker) => {
  const held = new Map<number, number>();
  for (const owner of packer.owners) {
    if (owner !== EMPTY) {
      held.set(owner, (held.get(owner) ?? 0) + 1);
    }
  }
  return held;
};

describe("GridPacker", () => {
  test("places unit squares row by row", () => {
    const packer = new GridPacker(3);
    expect([0, 1, 2, 3].map((owner) => packer.place(1, owner))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  test("skips past taken cells for bigger squares", () => {
    const packer = new GridPacker(4);
    packer.place(1, 0);
    // The 2 × 2 square cannot start at column 0 (taken) and fits at column 1.
    expect(packer.place(2, 1)).toBe(1);
    expect(packer.place(2, 2)).toBe(8);
    expect(packer.owners[1 + 4]).toBe(1);
  });

  test("reports a full grid", () => {
    const packer = new GridPacker(2);
    expect(packer.place(2, 0)).toBe(0);
    expect(packer.place(1, 1)).toBe(-1);
  });

  test("reuses the room of released squares", () => {
    const packer = new GridPacker(4);
    for (let owner = 0; owner < 4; owner += 1) {
      packer.place(2, owner);
    }
    expect(packer.place(1, 9)).toBe(-1);
    packer.release(10, 2);
    expect(packer.place(1, 5)).toBe(10);
    expect(packer.place(1, 6)).toBe(11);
    expect(packer.place(2, 7)).toBe(-1);
  });
});

describe("packSquares", () => {
  test("keeps the smallest grid when everything fits", () => {
    const { cells, packer } = packSquares([1, 1, 1], { fill: 1, minSize: 4 });
    expect(packer.size).toBe(4);
    expect([...cells]).toEqual([0, 1, 2]);
  });

  test("grows the grid until every square fits, without overlaps", () => {
    const sides = [5, 1, 4, 1, 1, 3, 2, 2, 6, 1, 1, 1];
    const { cells, packer } = packSquares(sides, { fill: 1, minSize: 1 });
    expect(cells.length).toBe(sides.length);
    const held = cellsByOwner(packer);
    for (const [owner, side] of sides.entries()) {
      expect(held.get(owner)).toBe(side * side);
    }
  });

  test("names owners as asked", () => {
    const { packer } = packSquares([1, 1], {
      fill: 1,
      minSize: 2,
      owners: [7, 9],
    });
    expect([...packer.owners]).toEqual([7, 9, EMPTY, EMPTY]);
  });
});
