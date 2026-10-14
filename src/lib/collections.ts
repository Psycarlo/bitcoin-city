/** Items grouped by key, in first-seen order. */
export const groupBy = <T, K>(items: Iterable<T>, keyOf: (item: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
