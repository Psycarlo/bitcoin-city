/**
 * Names of what can be picked in the scene, also used to find it there: a
 * confirmed block by hash, a projected block by its place in the queue (0 is
 * the next one), or a transaction by txid.
 */
export type SceneKey =
  | `block:${string}`
  | `projected:${number}`
  | `tx:${string}`;

export type ParsedKey =
  | { hash: string; kind: "block" }
  | { index: number; kind: "projected" }
  | { kind: "tx"; txid: string };

export const blockKey = (hash: string): SceneKey => `block:${hash}`;
export const projectedKey = (index: number): SceneKey => `projected:${index}`;
export const txKey = (txid: string): SceneKey => `tx:${txid}`;

export const parseKey = (key: SceneKey): ParsedKey => {
  const split = key.indexOf(":");
  const id = key.slice(split + 1);
  switch (key.slice(0, split)) {
    case "block": {
      return { hash: id, kind: "block" };
    }
    case "projected": {
      return { index: Number(id), kind: "projected" };
    }
    default: {
      return { kind: "tx", txid: id };
    }
  }
};
