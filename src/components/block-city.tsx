import { CandlestickChart, Layers3 } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode, Ref } from "react";

import { BlocksList } from "@/components/panels/blocks-list";
import { DetailPanel } from "@/components/panels/detail-panel";
import { Dock } from "@/components/panels/dock";
import { FeeLegend } from "@/components/panels/fee-legend";
import { MapControls } from "@/components/panels/map-controls";
import { PriceChart } from "@/components/panels/price-chart";
import { StatsStrip } from "@/components/panels/stats-strip";
import { StatusBanner } from "@/components/panels/status-banner";
import { SceneArea } from "@/components/scene-area";
import { SourceDialog } from "@/components/top-bar/source-dialog";
import { TopBar } from "@/components/top-bar/top-bar";
import { useClock } from "@/hooks/use-clock";
import { useInsets } from "@/hooks/use-insets";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  formatAgo,
  formatHeight,
  formatSignedPercent,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Insets } from "@/scene/camera-rig";
import { useLastBlockTime, useTip } from "@/stores/chain-store";
import { usePrice, usePriceStore } from "@/stores/price-store";
import { clearSelection } from "@/stores/selection";
import { useViewStore } from "@/stores/view-store";

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Room the panels take over the scene (px): the view centres in what is left
 * and the home view fits the city in it. The docks and the details float
 * over the city instead (what is picked is framed clear of the details). On
 * phones it is measured, as the sheet at the bottom grows with what it shows.
 */
const DESKTOP_INSETS: Insets = { bottom: 72, left: 72, right: 24, top: 176 };
const ZEN_INSETS: Insets = { bottom: 24, left: 24, right: 24, top: 88 };
const NO_PANEL: Insets = { bottom: 0, left: 0, right: 0, top: 0 };
/** The details' column on wide screens, and the gap beside it. */
const DETAILS_PANEL: Insets = { ...NO_PANEL, right: 368 };
const MOBILE_INSETS: Insets = { bottom: 120, left: 8, right: 8, top: 140 };
/** The map controls stand in the room on phones, along its right edge. */
const MOBILE_CONTROLS_WIDTH = 48;

const toggleZen = () => {
  useViewStore.getState().actions.toggleZen();
};

/** Fades its panels away (and out of reach) while the city has the screen. */
const Tuck = ({
  children,
  className,
  hidden,
}: {
  children: ReactNode;
  className?: string;
  hidden: boolean;
}) => (
  <div
    aria-hidden={hidden || undefined}
    className={cn(
      "transition-[opacity,translate,scale] duration-300 ease-out data-tucked:pointer-events-none data-tucked:scale-[0.98] data-tucked:opacity-0",
      className
    )}
    data-tucked={hidden || undefined}
    inert={hidden}
  >
    {children}
  </div>
);

const BlocksSummary = () => {
  const tip = useTip();
  const lastBlock = useLastBlockTime();
  const now = useClock(5000);
  if (!tip) {
    return null;
  }
  return (
    <>
      {formatHeight(tip.height)}
      {lastBlock === undefined ? null : ` · ${formatAgo(lastBlock, now)}`}
    </>
  );
};

const PriceSummary = () => {
  const price = usePrice();
  const ticker = usePriceStore((state) => state.ticker);
  if (price === undefined) {
    return null;
  }
  return (
    <>
      {formatUsd(price)}
      {ticker ? (
        <span
          className={cn(
            "ml-1.5",
            ticker.change >= 0
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-400"
          )}
        >
          {formatSignedPercent(ticker.changePercent)}
        </span>
      ) : null}
    </>
  );
};

const BlocksDock = ({
  className,
  listClassName,
}: {
  className?: string;
  listClassName?: string;
}) => (
  <Dock
    className={className}
    Icon={Layers3}
    name="blocks"
    summary={<BlocksSummary />}
    title="Blocks"
  >
    <BlocksList className="pb-0" listClassName={listClassName} />
  </Dock>
);

/** Wide screens: figures top left, details and blocks on the right, the price bottom left. */
const DesktopPanels = ({ zen }: { zen: boolean }) => (
  <div className="relative min-h-0 flex-1">
    <Tuck
      className="absolute top-0 left-0 flex max-w-[calc(100%-23.5rem)] flex-col items-start gap-2"
      hidden={zen}
    >
      <StatsStrip />
      <div className="flex flex-wrap items-center gap-2">
        <FeeLegend />
        <StatusBanner />
      </div>
    </Tuck>
    <Tuck className="absolute top-1/2 left-0 -translate-y-1/2" hidden={zen}>
      <MapControls />
    </Tuck>
    <Tuck
      className="absolute bottom-0 left-0 w-[min(36rem,calc(100%-24rem))]"
      hidden={zen}
    >
      <Dock
        Icon={CandlestickChart}
        name="price"
        summary={<PriceSummary />}
        title="BTC/USDT"
      >
        <PriceChart />
      </Dock>
    </Tuck>
    <Tuck
      className="absolute inset-y-0 right-0 flex w-88 flex-col gap-3"
      hidden={zen}
    >
      <aside aria-label="Details" className="flex min-h-0 flex-1 flex-col">
        <DetailPanel className="max-h-full min-h-0" />
      </aside>
      <BlocksDock className="shrink-0" />
    </Tuck>
  </div>
);

/** Phones and small tablets: figures on top, a sheet at the bottom with the blocks or the pick. */
const MobilePanels = ({
  roomRef,
  zen,
}: {
  roomRef: Ref<HTMLDivElement>;
  zen: boolean;
}) => {
  const picked = useViewStore((state) => state.selected !== undefined);
  return (
    <>
      <Tuck className="flex shrink-0 flex-col items-center gap-2" hidden={zen}>
        <StatsStrip className="w-full" />
        <StatusBanner />
      </Tuck>
      <div className="relative min-h-0 flex-1" ref={roomRef}>
        <Tuck className="absolute top-0 right-0" hidden={zen}>
          <MapControls />
        </Tuck>
      </div>
      <Tuck
        className="flex max-h-[55dvh] min-h-0 shrink-0 flex-col"
        hidden={zen}
      >
        {picked ? (
          <DetailPanel className="min-h-0" />
        ) : (
          <BlocksDock listClassName="h-44" />
        )}
      </Tuck>
    </>
  );
};

/** The app: the bitcoin blockchain as a 3D city, live, with a dashboard over it. */
export const BlockCity = () => {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const zen = useViewStore((state) => state.zen);
  const picked = useViewStore((state) => state.selected !== undefined);
  const [room, roomRef] = useInsets(MOBILE_INSETS);
  useKeyboardShortcut("Escape", clearSelection);
  useKeyboardShortcut("z", toggleZen);
  const insets = useMemo(() => {
    if (zen) {
      return ZEN_INSETS;
    }
    return desktop
      ? DESKTOP_INSETS
      : { ...room, right: room.right + MOBILE_CONTROLS_WIDTH };
  }, [desktop, room, zen]);
  const panel = desktop && picked && !zen ? DETAILS_PANEL : NO_PANEL;

  return (
    <main className="bg-scene text-foreground relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0 isolate">
        <SceneArea insets={insets} panel={panel} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2 lg:gap-4 lg:p-4">
        <TopBar />
        {desktop ? (
          <DesktopPanels zen={zen} />
        ) : (
          <MobilePanels roomRef={roomRef} zen={zen} />
        )}
      </div>
      <SourceDialog />
    </main>
  );
};
