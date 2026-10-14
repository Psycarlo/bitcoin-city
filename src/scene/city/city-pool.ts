import { useEffect, useMemo } from "react";

import { CityMesh } from "./city-mesh";

/** A city no longer on show is kept this long, in case it comes back (ms). */
const GRACE = 4000;

/** Every city, by the id of what it shows. */
const cities = new Map<string, CityMesh>();
/** Components showing each city. */
const mounted = new Map<string, number>();

const release = (id: string, city: CityMesh) => {
  if ((mounted.get(id) ?? 0) > 0 || cities.get(id) !== city) {
    return;
  }
  cities.delete(id);
  city.removeFromParent();
  city.dispose();
};

/**
 * The city with this id, made the first time it is asked for. A new id may
 * take over the city of another (`adoptFrom`): the next block's city
 * becomes the block that was just found, buildings and all.
 */
export const useCity = (id: string, adoptFrom?: string) => {
  const city = useMemo(() => {
    const known = cities.get(id);
    if (known) {
      return known;
    }
    const adopted = adoptFrom === undefined ? undefined : cities.get(adoptFrom);
    if (adopted && adoptFrom !== undefined) {
      cities.delete(adoptFrom);
      cities.set(id, adopted);
      return adopted;
    }
    const created = new CityMesh();
    cities.set(id, created);
    return created;
  }, [adoptFrom, id]);

  useEffect(() => {
    mounted.set(id, (mounted.get(id) ?? 0) + 1);
    return () => {
      const left = (mounted.get(id) ?? 1) - 1;
      if (left > 0) {
        mounted.set(id, left);
      } else {
        mounted.delete(id);
      }
      setTimeout(() => {
        release(id, city);
      }, GRACE);
    };
  }, [city, id]);

  return city;
};

/** A transaction standing in any city. */
export const findInCities = (txid: string) => {
  for (const city of cities.values()) {
    const tx = city.find(txid);
    if (tx) {
      return tx;
    }
  }
};
