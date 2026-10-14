import {
  BoxGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
} from "three";

/**
 * A slab with rounded corners, centred on the origin with its top at y = 0
 * (it hangs below). Its caps and sides are separate groups, for a material
 * each.
 */
export const roundedSlab = (
  width: number,
  depth: number,
  radius: number,
  thickness: number
) => {
  const r = Math.min(radius, width / 2, depth / 2);
  const [left, right] = [-width / 2, width / 2];
  const [near, far] = [-depth / 2, depth / 2];
  const shape = new Shape();
  shape.moveTo(left + r, near);
  shape.lineTo(right - r, near);
  shape.absarc(right - r, near + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(right, far - r);
  shape.absarc(right - r, far - r, r, 0, Math.PI / 2, false);
  shape.lineTo(left + r, far);
  shape.absarc(left + r, far - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(left, near + r);
  shape.absarc(left + r, near + r, r, Math.PI, Math.PI * 1.5, false);
  const bevel = Math.min(r / 4, thickness / 3);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 12,
    depth: thickness,
  });
  // The shape lies in x–y and extrudes along z: stand it up, top at y = 0.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -(thickness + bevel), 0);
  return geometry;
};

/** Faces of a `BoxGeometry`, in order, each with 4 vertices and 6 indices. */
const BOX_FACES = 6;
const TOP_FACE = 2;
const BOTTOM_FACE = 3;
/** Walls are a touch darker than roofs, to read as solid from above. */
const WALL_SHADE = 0.86;

/**
 * A unit box standing on the origin, without a floor (never seen), its roof
 * brighter than its walls through vertex colours.
 */
export const createBuildingGeometry = () => {
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const index = geometry.getIndex();
  if (index) {
    geometry.setIndex(
      [...index.array].filter(
        (_, position) => Math.floor(position / 6) !== BOTTOM_FACE
      )
    );
  }
  geometry.clearGroups();
  const shades = new Float32Array(BOX_FACES * 4 * 3);
  for (let vertex = 0; vertex < BOX_FACES * 4; vertex += 1) {
    const shade = Math.floor(vertex / 4) === TOP_FACE ? 1 : WALL_SHADE;
    shades.fill(shade, vertex * 3, vertex * 3 + 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(shades, 3));
  return geometry;
};
