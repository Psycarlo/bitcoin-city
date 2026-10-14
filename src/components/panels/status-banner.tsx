import { LoaderCircle, TriangleAlert } from "lucide-react";

import type { FeedStatus } from "@/data/types";
import { cn } from "@/lib/utils";
import { useChainStore } from "@/stores/chain-store";
import { usePriceStore } from "@/stores/price-store";
import { useSource } from "@/stores/source-store";

interface Feed {
  /** Something arrived already: a reconnect then keeps showing it. */
  loaded: boolean;
  name: string;
  status: FeedStatus;
}

const lost = (feeds: readonly Feed[]) =>
  feeds.filter(
    (feed) => feed.status === "reconnecting" || feed.status === "closed"
  );

const joining = (feeds: readonly Feed[]) =>
  feeds.filter((feed) => feed.status === "connecting" && !feed.loaded);

const names = (feeds: readonly Feed[]) =>
  feeds.map((feed) => feed.name).join(" and ");

/** Tells the user when the chain or the price is not flowing in. */
export const StatusBanner = ({ className }: { className?: string }) => {
  const chainStatus = useChainStore((state) => state.status);
  const chainLoaded = useChainStore((state) => state.blocks.length > 0);
  const priceStatus = usePriceStore((state) => state.status);
  const priceLoaded = usePriceStore((state) => state.last !== undefined);
  const { label } = useSource();
  const feeds: Feed[] = [
    { loaded: chainLoaded, name: label, status: chainStatus },
    { loaded: priceLoaded, name: "Binance", status: priceStatus },
  ];

  const down = lost(feeds);
  const starting = joining(feeds);
  let message: string | undefined;
  if (down.length > 0) {
    message = `Lost ${names(down)}, reconnecting…`;
  } else if (starting.length > 0) {
    message = `Connecting to ${names(starting)}…`;
  }
  if (!message) {
    return null;
  }

  const warning = down.length > 0;
  const Icon = warning ? TriangleAlert : LoaderCircle;
  return (
    <output
      className={cn(
        "pointer-events-auto flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm ring-1 backdrop-blur-md",
        warning
          ? "bg-amber-50/95 text-amber-800 ring-amber-600/20 dark:bg-amber-950/90 dark:text-amber-200 dark:ring-amber-400/25"
          : "bg-card/95 text-muted-foreground ring-foreground/5",
        className
      )}
    >
      <Icon
        className={cn("size-3.5 shrink-0", warning ? "" : "animate-spin")}
      />
      {message}
    </output>
  );
};
