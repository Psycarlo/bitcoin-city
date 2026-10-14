import { Html } from "@react-three/drei";
import { createContext, use, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

/**
 * The layer the scene's HTML (labels, the hover card) is drawn in. drei's
 * `Html` moves its content when the element it draws in changes, which can
 * leave it blank, so nothing is drawn until the layer is in place, and the
 * layer stays put.
 */
const LayerContext = createContext<HTMLElement | null>(null);

/**
 * Lays a layer for the scene's HTML over the canvas inside it (it covers its
 * positioned parent). The layer sits beside the canvas, not in it, so
 * pointing at a label never points at the buildings behind it too. Nothing
 * in it takes the pointer unless it asks to (`pointer-events-auto`).
 */
export const HtmlLayer = ({ children }: { children: ReactNode }) => {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <LayerContext value={layer}>{children}</LayerContext>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        ref={setLayer}
      />
    </>
  );
};

/** drei's `Html`, drawn in the scene's HTML layer once it is in place. */
export const SceneHtml = (props: ComponentProps<typeof Html>) => {
  const layer = use(LayerContext);
  return layer ? <Html {...props} portal={{ current: layer }} /> : null;
};
