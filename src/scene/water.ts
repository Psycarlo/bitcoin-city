import { Color, PlaneGeometry, ShaderMaterial, Vector2, Vector4 } from "three";

import { PILE_RADIUS, PILES } from "./island-plan";
import {
  BEACH_DROP,
  BEACH_SLOPE,
  GRASS_DEPTH,
  ISLAND,
  SHORE_OUT,
  WATER_Y,
} from "./layout";
import { track } from "./paint";

/**
 * The sea around the island: one flat plane, shaded by how far each point is
 * from the shore (worked out exactly from the island's rounded outline). It
 * is pale and shallow by the beach and deepens offshore; waves of foam roll
 * in to the sand; the tide breathes up and down the beach's slope; sunlight
 * (or moonlight) glitters on it; things that fall in send out rings; and far
 * off it fades into the sky.
 */
const SIZE = 80_000;
/** Rings at once, at most. */
const RIPPLES = 4;
/** How long a ripple runs (s). */
const RIPPLE_LIFE = 4.5;
/** Piles the water laps around, at most. */
const MAX_PILES = 8;

/** The tide's rise and fall (units), as two slow swells. */
const TIDE = [
  { amplitude: 1.6, rate: 0.9 },
  { amplitude: 0.8, rate: 0.37 },
] as const;

/**
 * How far the waterline moves along the beach for each unit the sea rises:
 * the slope of its quarter ellipse where the sea rests.
 */
/** Piles out past the waterline (the others stand in the sand). */
const PILES_IN_WATER = PILES.filter(
  ([x, z]) =>
    Math.abs(x - ISLAND.centreX) > ISLAND.halfX + SHORE_OUT ||
    Math.abs(z - ISLAND.centreZ) > ISLAND.halfZ + SHORE_OUT
).map(([x, z]) => new Vector2(x, z));

const SHORE_RUN = (() => {
  const depth = -GRASS_DEPTH - WATER_Y;
  const cos = (BEACH_DROP - depth) / BEACH_DROP;
  const sin = Math.sqrt(1 - cos * cos);
  return (BEACH_SLOPE * cos) / (BEACH_DROP * sin);
})();

const VERTEX = `
  varying vec2 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = `
  uniform float uTime;
  uniform float uTide;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSand;
  uniform vec3 uFar;
  /** The waterline at rest: centre (xy) and half its size (zw). */
  uniform vec4 uShore;
  uniform float uRadius;
  /** Ripples: centre (xy), start time (z), strength (w; 0 is none). */
  uniform vec4 uRipples[${RIPPLES}];
  /** Piles standing in the water, which it laps around. */
  uniform vec2 uPiles[${MAX_PILES}];
  uniform float uPileRadius;
  /** The camera's zoom (px per unit): fine detail shows only up close. */
  uniform float uZoom;
  varying vec2 vWorld;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /** Signed distance to a rounded rectangle: negative inside. */
  float roundedBox(vec2 p, vec2 half_, float r) {
    vec2 q = abs(p) - half_ + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = vWorld;
    float t = uTime;
    // Distance out from where the water meets the sand now: the tide moves
    // the waterline up and down the slope; a little noise keeps it natural.
    float wobble = noise(p * 0.018 + vec2(t * 0.06, -t * 0.04));
    float d = roundedBox(p - uShore.xy, uShore.zw, uRadius) + uTide;
    float dn = d + (wobble - 0.5) * 7.0;

    // Pale over the shallows, deep blue offshore.
    float depth = smoothstep(0.0, 420.0, dn);
    vec3 colour = mix(uShallow, uDeep, depth);
    // A film of water over the sand right at the edge.
    colour = mix(colour, uSand, (1.0 - smoothstep(0.0, 16.0, dn)) * 0.5);

    // Slow swells drifting across.
    float swell =
      noise(p * 0.0045 + vec2(t * 0.03, t * 0.017)) * 0.6 +
      noise(p * 0.011 - vec2(t * 0.026, -t * 0.038)) * 0.4;
    colour *= 1.0 + (swell - 0.5) * (0.14 + 0.1 * depth);

    // Crests: faint broken lines drifting in from the open sea, bent by the
    // swell; seen from afar (up close the glitter takes over).
    float crest = sin(dot(p, vec2(0.011, 0.015)) + swell * 4.0 - t * 0.8);
    float broken = smoothstep(0.45, 0.75, noise(p * 0.004 - vec2(t * 0.02)));
    colour = mix(
      colour,
      uFoam,
      smoothstep(0.9, 1.0, crest) *
        broken *
        0.07 *
        smoothstep(60.0, 320.0, dn) *
        (1.0 - smoothstep(0.5, 1.4, uZoom))
    );

    // Glitter: short glints that come and go, away from the beach and only
    // up close, where they are big enough to read.
    float sparkle =
      noise(p * vec2(0.045, 0.11) + vec2(t * 0.5, -t * 0.3)) *
      noise(p * vec2(0.09, 0.05) - vec2(t * 0.4, t * 0.25));
    float glitter =
      smoothstep(0.72, 0.8, sparkle) *
      smoothstep(40.0, 220.0, dn) *
      smoothstep(0.45, 1.1, uZoom);

    // Foam: a lip along the shore, and waves rolling in to it, each rising
    // out at sea and breaking on the sand.
    float foam = 1.0 - smoothstep(1.0, 6.0 + wobble * 5.0, dn);
    // Lapping around the pier's piles.
    for (int i = 0; i < ${MAX_PILES}; i++) {
      float around = length(p - uPiles[i]) - uPileRadius;
      float lap = 2.5 + 1.5 * sin(t * 2.2 + float(i) * 1.7);
      foam = max(foam, (1.0 - smoothstep(0.0, lap, around)) * 0.9);
    }
    for (int k = 0; k < 3; k++) {
      float phase = fract(t * 0.16 + float(k) / 3.0);
      float at = mix(70.0, 0.0, phase * phase * (3.0 - 2.0 * phase));
      float width = 2.0 + 4.0 * phase;
      float band = 1.0 - smoothstep(0.0, width, abs(dn - at));
      float strength = sin(phase * 3.14159) * (0.45 + 0.55 * wobble);
      foam = max(foam, band * strength * 0.8);
    }

    // Rings where something fell in.
    for (int i = 0; i < ${RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      float age = t - ripple.z;
      if (ripple.w <= 0.0 || age < 0.0 || age > ${RIPPLE_LIFE.toFixed(1)}) {
        continue;
      }
      float from = length(p - ripple.xy);
      float fade = 1.0 - age / ${RIPPLE_LIFE.toFixed(1)};
      for (int j = 0; j < 3; j++) {
        float radius = age * 105.0 - float(j) * 42.0;
        if (radius <= 0.0) {
          continue;
        }
        float ring = 1.0 - smoothstep(0.0, 6.0 + age * 3.0, abs(from - radius));
        foam = max(foam, ring * fade * ripple.w * (1.0 - float(j) * 0.25));
      }
    }

    colour = mix(colour, uFoam, clamp(foam * 0.85 + glitter * 0.6, 0.0, 1.0));
    // Far off, into the haze.
    colour = mix(colour, uFar, smoothstep(4500.0, 15000.0, length(p - uShore.xy)));
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

const uniforms = {
  uDeep: { value: track(new Color(), "water") },
  uFar: { value: track(new Color(), "background") },
  uFoam: { value: track(new Color(), "foam") },
  uPileRadius: { value: PILE_RADIUS },
  uPiles: {
    value: Array.from(
      { length: MAX_PILES },
      (_, index) => PILES_IN_WATER[index] ?? new Vector2(1e6, 1e6)
    ),
  },
  uRadius: { value: ISLAND.radius + SHORE_OUT },
  uRipples: {
    value: Array.from({ length: RIPPLES }, () => new Vector4(0, 0, 0, 0)),
  },
  uSand: { value: track(new Color(), "beach") },
  uShallow: { value: track(new Color(), "shallow") },
  uShore: {
    value: new Vector4(
      ISLAND.centreX,
      ISLAND.centreZ,
      ISLAND.halfX + SHORE_OUT,
      ISLAND.halfZ + SHORE_OUT
    ),
  },
  uTide: { value: 0 },
  uTime: { value: 0 },
  uZoom: { value: 1 },
};

export const WATER_MATERIAL = new ShaderMaterial({
  fragmentShader: FRAGMENT,
  uniforms,
  vertexShader: VERTEX,
});
export const WATER_PLANE = new PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2);

let nextRipple = 0;

/** Sends rings out over the water from a point (strength 0–1). */
export const addRipple = (x: number, z: number, strength = 1) => {
  const slot = uniforms.uRipples.value[nextRipple % RIPPLES];
  nextRipple += 1;
  slot?.set(x, z, uniforms.uTime.value, strength);
};

/** How far the sea stands above its rest height right now. */
let rise = 0;

/** Height of the sea right now. */
export const waterLevel = () => WATER_Y + rise;

/**
 * Moves the sea on to `time` (s) for a camera at `zoom`: the tide, the waves
 * and the rings. Returns the sea's height.
 */
export const stepWater = (time: number, zoom: number) => {
  rise = 0;
  for (const { amplitude, rate } of TIDE) {
    rise += Math.sin(time * rate) * amplitude;
  }
  uniforms.uTime.value = time;
  uniforms.uTide.value = rise * SHORE_RUN;
  uniforms.uZoom.value = zoom;
  return WATER_Y + rise;
};
