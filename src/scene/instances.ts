import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { BufferGeometry, Material, Vector3Tuple } from "three";

export interface Placement {
  colour?: string;
  position: Vector3Tuple;
  /** Turn about the vertical axis (radians). */
  rotationY?: number;
  scale: Vector3Tuple;
}

/** Many copies of one mesh in a single draw call. */
export const createInstances = (
  geometry: BufferGeometry,
  material: Material,
  placements: readonly Placement[]
) => {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const turn = new Euler();
  const colour = new Color();
  for (const [index, placement] of placements.entries()) {
    rotation.setFromEuler(turn.set(0, placement.rotationY ?? 0, 0));
    matrix.compose(
      position.fromArray(placement.position),
      rotation,
      scale.fromArray(placement.scale)
    );
    mesh.setMatrixAt(index, matrix);
    if (placement.colour) {
      mesh.setColorAt(index, colour.set(placement.colour));
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
  return mesh;
};

/** Frees an instanced mesh and what it was made of. */
export const disposeInstances = (mesh: InstancedMesh) => {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) {
    material.dispose();
  }
  mesh.dispose();
};
