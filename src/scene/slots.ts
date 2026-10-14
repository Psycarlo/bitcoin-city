/**
 * The places along the city's path and what stands on them. Plain numbers,
 * free of three.js, so the panels can match the city.
 */

export const COLUMNS = 5;
export const ROWS = 4;
/** Places along the path. */
export const SLOTS = COLUMNS * ROWS;

/** Place of the mempool's queue: what would take more than a few blocks to clear. */
export const QUEUE_SLOT = 0;
/** Place of the next block, the one being mined. */
export const NEXT_SLOT = 4;
/** Place of the newest confirmed block. */
export const TIP_SLOT = 5;
/** Projected blocks after the next one shown on their own; the rest wait in the queue. */
export const PROJECTED_SHOWN = NEXT_SLOT - QUEUE_SLOT - 1;
/** Confirmed blocks on show. */
export const CONFIRMED_SHOWN = SLOTS - TIP_SLOT;
/** Of those, the newest stand as cities; older ones are sealed until picked. */
export const CITIES_SHOWN = 10;
