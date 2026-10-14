/** Owner of a free cell. */
export const EMPTY = -1;

/** Grid sides tried in turn when a packing does not fit. */
const GROW = 2;

/**
 * A square grid that squares of whole cells are packed into, first fit, row
 * by row from the top-left (the north-west, in a city). Each cell remembers
 * which item owns it.
 */
export class GridPacker {
  readonly size: number;
  /** Owner of each cell, row by row: an item's number, or `EMPTY`. */
  readonly owners: Int32Array;
  /** Per square side, the first place worth trying: nothing before it fits. */
  private readonly cursors = new Map<number, number>();

  constructor(size: number) {
    this.size = size;
    this.owners = new Int32Array(size * size).fill(EMPTY);
  }

  /** Column offset of the right-most taken cell in a square, or −1 if it is free. */
  private blocker(row: number, column: number, side: number) {
    const { owners, size } = this;
    for (let across = side - 1; across >= 0; across -= 1) {
      for (let down = 0; down < side; down += 1) {
        if (owners[(row + down) * size + column + across] !== EMPTY) {
          return across;
        }
      }
    }
    return -1;
  }

  /** First free place for a square of `side` cells (its top-left cell), or −1. */
  find(side: number) {
    const { size } = this;
    const last = size - side;
    if (last < 0) {
      return -1;
    }
    const start = this.cursors.get(side) ?? 0;
    const startRow = Math.floor(start / size);
    for (let row = startRow; row <= last; row += 1) {
      let column = row === startRow ? start % size : 0;
      while (column <= last) {
        const blocked = this.blocker(row, column, side);
        if (blocked < 0) {
          const cell = row * size + column;
          this.cursors.set(side, cell);
          return cell;
        }
        // Every square starting up to the taken cell holds it too.
        column += blocked + 1;
      }
    }
    this.cursors.set(side, size * size);
    return -1;
  }

  /** Marks the square of `side` cells at `cell` as `owner`'s. */
  fill(cell: number, side: number, owner: number) {
    for (let down = 0; down < side; down += 1) {
      const start = cell + down * this.size;
      this.owners.fill(owner, start, start + side);
    }
  }

  /** Takes the first free place for a square; −1 if none is left. */
  place(side: number, owner: number) {
    const cell = this.find(side);
    if (cell >= 0) {
      this.fill(cell, side, owner);
    }
    return cell;
  }

  /** Frees a square, so later ones may take its place. */
  release(cell: number, side: number) {
    this.fill(cell, side, EMPTY);
    const row = Math.floor(cell / this.size);
    for (const [other, cursor] of this.cursors) {
      // Squares of that side starting this far up may now fit.
      const earliest = Math.max(0, row - other + 1) * this.size;
      if (cursor > earliest) {
        this.cursors.set(other, earliest);
      }
    }
  }
}

export interface PackOptions {
  /** Share of the grid the squares should fill, which sets its first size. */
  fill: number;
  /** Smallest grid side. */
  minSize: number;
  /** Owner of each square in the grid (its position in the list by default). */
  owners?: ArrayLike<number>;
}

export interface Packing {
  /** Top-left cell of each square, in the order given. */
  cells: Int32Array;
  packer: GridPacker;
}

/**
 * Packs squares, in the order given, into the smallest grid they fit (from
 * the one they would fill at `fill`), growing it until they do.
 */
export const packSquares = (
  sides: readonly number[],
  { fill, minSize, owners }: PackOptions
): Packing => {
  let area = 0;
  let largest = 0;
  for (const side of sides) {
    area += side * side;
    largest = Math.max(largest, side);
  }
  let size = Math.max(minSize, largest, Math.ceil(Math.sqrt(area / fill)));
  for (;;) {
    const packer = new GridPacker(size);
    const cells = new Int32Array(sides.length);
    let fitted = true;
    for (const [index, side] of sides.entries()) {
      const cell = packer.place(side, owners ? owners[index] : index);
      if (cell < 0) {
        fitted = false;
        break;
      }
      cells[index] = cell;
    }
    if (fitted) {
      return { cells, packer };
    }
    size += GROW;
  }
};
