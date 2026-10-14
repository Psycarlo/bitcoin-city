/** Small guards for reading JSON from the outside world. */

export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isDefined = <T>(value: T | undefined): value is T =>
  value !== undefined;

/** A finite number, from a number or a numeric string, else undefined. */
export const optionalNumber = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : undefined;
};

export const numberOf = (value: unknown, fallback = 0) =>
  optionalNumber(value) ?? fallback;

export const stringOf = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const numbersOf = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => numberOf(item)) : [];

/** The value a JSON string holds, else undefined. */
export const parseJson = (text: unknown): unknown => {
  let value: unknown;
  if (typeof text === "string") {
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      // Not JSON: nothing to read.
    }
  }
  return value;
};
