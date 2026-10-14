import { useEffect } from "react";

export interface Disposable {
  dispose: () => void;
}

type Resource = Disposable | readonly Disposable[] | undefined;

const disposeAll = (resource: Resource) => {
  if (!resource) {
    return;
  }
  if ("dispose" in resource) {
    resource.dispose();
  } else {
    for (const item of resource) {
      item.dispose();
    }
  }
};

/**
 * Frees GPU resources (geometries, materials, textures) built outside JSX,
 * once they are replaced or their component unmounts. Pass a stable value
 * (from `useMemo`).
 */
export const useDisposable = (resource: Resource) => {
  useEffect(
    () => () => {
      disposeAll(resource);
    },
    [resource]
  );
};
