import { useMemo } from "react";
import type { Ref } from "react";

import { Attribution } from "@/components/panels/attribution";
import { BlocksList } from "@/components/panels/blocks-list";
import { DetailPanel } from "@/components/panels/detail-panel";
import { FeeLegend } from "@/components/panels/fee-legend";
import { KpiCards } from "@/components/panels/kpi-cards";
import { MapControls } from "@/components/panels/map-controls";
import { PriceChart } from "@/components/panels/price-chart";
import { StatusBanner } from "@/components/panels/status-banner";
import { SceneArea } from "@/components/scene-area";
import { TopBar } from "@/components/top-bar/top-bar";
import { useInsets } from "@/hooks/use-insets";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Insets } from "@/scene/camera-rig";
import { PALETTE } from "@/scene/palette";
import { clearSelection } from "@/stores/selection";
import { useViewStore } from "@/stores/view-store";

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Room the panels take over the scene (px): the view centres in what is left
 * and the home view fits the city in it. On phones it is measured, as the
 * sheet at the bottom grows with what it shows.
 */
const DESKTOP_INSETS: Insets = { bottom: 240, left: 72, right: 384, top: 232 };
const MOBILE_INSETS: Insets = { bottom: 300, left: 8, right: 8, top: 184 };
/** The map controls stand in the room on phones, along its right edge. */
const MOBILE_CONTROLS_WIDTH = 48;

/** Wide screens: panels around the edges, the city in the middle. */
const DesktopPanels = () => (
  <div className="relative min-h-0 flex-1">
    <div className="absolute top-0 left-0 flex w-[min(60rem,calc(100%-23.5rem))] flex-col items-start gap-3">
      <KpiCards className="w-full" />
      <div className="flex flex-wrap items-center gap-2">
        <FeeLegend />
        <StatusBanner />
      </div>
    </div>
    <MapControls className="absolute top-1/2 left-0 -translate-y-1/2" />
    <PriceChart className="absolute bottom-0 left-0 w-[min(40rem,calc(100%-24rem))]" />
    <aside
      aria-label="Details"
      className="absolute inset-y-0 right-0 flex w-88 flex-col gap-3"
    >
      <DetailPanel className="min-h-0" />
      <BlocksList className="mt-auto shrink-0" />
      <Attribution className="self-end text-right" />
    </aside>
  </div>
);

/** Phones and small tablets: numbers on top, a sheet at the bottom with the list or the pick. */
const MobilePanels = ({ roomRef }: { roomRef: Ref<HTMLDivElement> }) => {
  const picked = useViewStore((state) => state.selected !== undefined);
  return (
    <>
      <KpiCards className="shrink-0" />
      <StatusBanner className="self-center" />
      <div className="relative min-h-0 flex-1" ref={roomRef}>
        <MapControls className="absolute top-0 right-0" />
      </div>
      <div className="flex max-h-[55dvh] min-h-0 shrink-0 flex-col gap-2">
        {picked ? (
          <DetailPanel className="min-h-0" />
        ) : (
          <BlocksList listClassName="h-44" />
        )}
        <Attribution className="self-center text-center" />
      </div>
    </>
  );
};

/** The app: the Bitcoin blockchain as a 3D city, live, with a dashboard over it. */
export const BlockCity = () => {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [room, roomRef] = useInsets(MOBILE_INSETS);
  useKeyboardShortcut("Escape", clearSelection);
  const insets = useMemo(
    () =>
      desktop
        ? DESKTOP_INSETS
        : { ...room, right: room.right + MOBILE_CONTROLS_WIDTH },
    [desktop, room]
  );

  return (
    <main
      className="text-foreground relative h-dvh w-full overflow-hidden"
      style={{ background: PALETTE.background }}
    >
      <div className="absolute inset-0 isolate">
        <SceneArea insets={insets} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2 lg:gap-4 lg:p-4">
        <TopBar />
        {desktop ? <DesktopPanels /> : <MobilePanels roomRef={roomRef} />}
      </div>
    </main>
  );
};
