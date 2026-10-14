import { Canvas } from "@react-three/fiber";
import { useState } from "react";

import { clearSelection } from "@/stores/selection";
import { useViewStore } from "@/stores/view-store";

import { CameraRig } from "./camera-rig";
import type { Insets } from "./camera-rig";
import { HoverCard } from "./hover-card";
import { HtmlLayer } from "./html-layer";
import { LabelDeclutter } from "./label-declutter";
import { ChainLayer } from "./layers/chain";
import { Island } from "./layers/island";
import { LinksLayer } from "./layers/links";
import { MempoolLayer } from "./layers/mempool";
import { Skyline, Terrace } from "./layers/skyline";
import { Trees } from "./layers/trees";
import { Water } from "./layers/water";
import { Lights } from "./lights";
import { Markers, PointerCursor } from "./markers";
import { usePalette } from "./palette";
import { ShadowUpdater } from "./shadows";

interface WorldSceneProps {
  /** Room the UI panels take around the edges, kept clear by the camera. */
  insets: Insets;
  /** Room a panel floating over the city takes, which what is picked is framed clear of. */
  panel: Insets;
}

/**
 * The chain as a city on an island: the mempool's blocks-to-be queue up at
 * the front, the newest blocks follow them, each a city of its transactions,
 * and the price stands behind as a skyline. The oldest block leaves by the
 * dock, into the sea.
 */
export const WorldScene = ({ insets, panel }: WorldSceneProps) => {
  const skyline = useViewStore((state) => state.toggles.skyline);
  const trees = useViewStore((state) => state.toggles.trees);
  const palette = usePalette();
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);

  return (
    <div className="relative size-full" ref={setFrame}>
      <HtmlLayer>
        <Canvas
          camera={{
            far: 40_000,
            near: 1,
            position: [0, 6000, 6000],
            zoom: 0.2,
          }}
          dpr={[1, 2]}
          flat
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onPointerMissed={clearSelection}
          orthographic
          shadows="percentage"
        >
          <color args={[palette.background]} attach="background" />
          <Lights />
          <ShadowUpdater />
          <Water />
          <Island />
          <Terrace />
          <ChainLayer />
          <MempoolLayer />
          <LinksLayer />
          {skyline ? <Skyline /> : null}
          {trees ? <Trees /> : null}
          <Markers />
          <HoverCard />
          <CameraRig frame={frame} insets={insets} panel={panel} />
          <LabelDeclutter />
          <PointerCursor />
        </Canvas>
      </HtmlLayer>
    </div>
  );
};
