import { Box } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { poolLogoUrl } from "@/data/mempool";
import type { Block, ProjectedBlock } from "@/data/types";
import { useClock } from "@/hooks/use-clock";
import { BLOCK_VSIZE } from "@/lib/bitcoin";
import { feeColour, feeGradient } from "@/lib/fees";
import {
  formatAgo,
  formatCount,
  formatHeight,
  formatNumber,
  formatRate,
  formatVsize,
} from "@/lib/format";
import { blockKey, projectedKey } from "@/lib/scene-key";
import type { SceneKey } from "@/lib/scene-key";
import { cn } from "@/lib/utils";
import { CONFIRMED_SHOWN, PROJECTED_SHOWN } from "@/scene/slots";
import { useChainStore } from "@/stores/chain-store";
import { show } from "@/stores/selection";
import { useViewActions, useViewStore } from "@/stores/view-store";
import type { ListTab } from "@/stores/view-store";

/** A block found live counts as new for this long. */
const NEW_FOR = 60_000;
/** The mempool's blocks-to-be listed one by one: the next block and the ghosts. */
const QUEUED = PROJECTED_SHOWN + 1;
/** Blocks-to-be have no identity of their own: they are places in line. */
const PLACES = Array.from({ length: QUEUED }, (_, index) => index);
const BACKLOG_KEY = projectedKey(QUEUED);
const MINUTES_PER_BLOCK = 10;

const TABS: readonly { label: string; value: ListTab }[] = [
  { label: "Blocks", value: "blocks" },
  { label: "Mempool", value: "mempool" },
];

const isListTab = (value: unknown): value is ListTab =>
  TABS.some((tab) => tab.value === value);

interface RowProps {
  children: ReactNode;
  sceneKey: SceneKey;
  selected: boolean;
}

/** A pickable line of the list, tied to its place in the city. */
const Row = ({ children, sceneKey, selected }: RowProps) => {
  const { hover, unhover } = useViewActions();
  const handleClick = () => {
    show(sceneKey);
  };
  const handleEnter = () => {
    hover(sceneKey);
  };
  const handleLeave = () => {
    unhover(sceneKey);
  };
  return (
    <li>
      <button
        aria-current={selected || undefined}
        className={cn(
          "hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none",
          selected && "bg-primary/8 ring-primary/20 hover:bg-primary/10 ring-1"
        )}
        onBlur={handleLeave}
        onClick={handleClick}
        onFocus={handleEnter}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        type="button"
      >
        {children}
      </button>
    </li>
  );
};

/** Two stacked lines: the main one and a quieter one below. */
const Lines = ({
  className,
  main,
  sub,
}: {
  className?: string;
  main: ReactNode;
  sub: ReactNode;
}) => (
  <span className={cn("min-w-0", className)}>
    <span className="flex items-center gap-1.5 text-sm font-semibold">
      {main}
    </span>
    <span className="text-muted-foreground block truncate text-xs tabular-nums">
      {sub}
    </span>
  </span>
);

/** A dot of a rate's colour and the rate. */
const FeeTag = ({ rate }: { rate: number }) => (
  <span className="flex items-center justify-end gap-1.5 text-xs font-medium tabular-nums">
    <span
      className="ring-foreground/10 size-2 shrink-0 rounded-full ring-1"
      style={{ background: feeColour(rate) }}
    />
    ~{formatRate(rate)} sat/vB
  </span>
);

const initialsOf = (name: string) =>
  name
    .split(/[\s.-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

const PoolAvatar = ({ block }: { block: Block }) => (
  <Avatar className="size-9 bg-white">
    {block.pool ? (
      <AvatarImage
        alt=""
        className="object-contain"
        src={poolLogoUrl(block.pool.slug)}
      />
    ) : null}
    <AvatarFallback className="text-[11px] font-semibold">
      {block.pool ? initialsOf(block.pool.name) : <Box className="size-4" />}
    </AvatarFallback>
  </Avatar>
);

const NewTag = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase dark:bg-emerald-500/20 dark:text-emerald-300">
    <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
    New
  </span>
);

interface BlockRowProps {
  /** When this page saw it arrive, if it did: truer than its miner's clock. */
  arrived?: number;
  block: Block;
  now: number;
  selected: boolean;
}

const BlockRow = ({ arrived, block, now, selected }: BlockRowProps) => (
  <Row sceneKey={blockKey(block.id)} selected={selected}>
    <PoolAvatar block={block} />
    <Lines
      className="flex-1"
      main={
        <>
          {formatHeight(block.height)}
          {arrived !== undefined && now - arrived < NEW_FOR ? <NewTag /> : null}
        </>
      }
      sub={`${block.pool?.name ?? "Unknown miner"} · ${formatCount(block.txCount, "tx", "txs")}`}
    />
    <span className="shrink-0 text-right">
      <FeeTag rate={block.medianFee} />
      <span className="text-muted-foreground block text-xs tabular-nums">
        {formatAgo(arrived ?? block.time, now)}
      </span>
    </span>
  </Row>
);

/** A tile in the colours of a block-to-be's fees, cheapest to dearest. */
const FeeSwatch = ({ feeRange }: { feeRange: readonly number[] }) => (
  <span
    className="ring-foreground/10 size-9 shrink-0 rounded-xl ring-1"
    style={{ background: feeGradient(feeRange[0], feeRange.at(-1)) }}
  />
);

const projectedTitle = (index: number) =>
  index === 0 ? "Next block" : `In ~${(index + 1) * MINUTES_PER_BLOCK} min`;

interface ProjectedRowProps {
  block: ProjectedBlock;
  index: number;
  selected: boolean;
}

const ProjectedRow = ({ block, index, selected }: ProjectedRowProps) => (
  <Row sceneKey={projectedKey(index)} selected={selected}>
    <FeeSwatch feeRange={block.feeRange} />
    <Lines
      className="flex-1"
      main={projectedTitle(index)}
      sub={`${formatCount(block.txCount, "tx", "txs")} · ${formatVsize(block.vsize)}`}
    />
    <span className="shrink-0 text-right">
      <FeeTag rate={block.medianFee} />
      <span className="text-muted-foreground block text-xs tabular-nums">
        from {formatRate(block.feeRange[0] ?? block.medianFee)}
      </span>
    </span>
  </Row>
);

/** Everything queued beyond the blocks listed one by one. */
const BacklogRow = ({
  queue,
  selected,
}: {
  queue: readonly ProjectedBlock[];
  selected: boolean;
}) => {
  let txs = 0;
  let vsize = 0;
  for (const block of queue) {
    txs += block.txCount;
    vsize += block.vsize;
  }
  const blocks = Math.ceil(vsize / BLOCK_VSIZE);
  const cheapest = queue.at(-1)?.feeRange[0];
  const [front] = queue;
  return (
    <Row sceneKey={BACKLOG_KEY} selected={selected}>
      <FeeSwatch feeRange={[cheapest ?? 1, front?.feeRange.at(-1) ?? 1]} />
      <Lines
        className="flex-1"
        main={
          <>
            Backlog
            <span className="text-muted-foreground text-xs font-normal">
              {formatNumber(blocks)} {blocks === 1 ? "block" : "blocks"}
            </span>
          </>
        }
        sub={`${formatCount(txs, "tx", "txs")} · ${formatVsize(vsize)}`}
      />
      {front ? (
        <span className="shrink-0 text-right">
          <FeeTag rate={front.medianFee} />
          <span className="text-muted-foreground block text-xs tabular-nums">
            from {formatRate(cheapest ?? front.medianFee)}
          </span>
        </span>
      ) : null}
    </Row>
  );
};

const LoadingRows = () => (
  <div className="flex flex-col gap-2 p-2">
    {[0, 1, 2, 3].map((index) => (
      <div className="flex items-center gap-3" key={index}>
        <Skeleton className="size-9 rounded-xl" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground flex h-full items-center justify-center px-6 py-8 text-center text-sm">
    {children}
  </p>
);

const BlocksTab = () => {
  const blocks = useChainStore((state) => state.blocks);
  const arrivals = useChainStore((state) => state.arrivals);
  const selected = useViewStore((state) => state.selected);
  const now = useClock(5000);
  if (blocks.length === 0) {
    return <LoadingRows />;
  }
  return (
    <ul className="flex flex-col gap-0.5 p-1">
      {blocks.slice(0, CONFIRMED_SHOWN).map((block) => (
        <BlockRow
          arrived={arrivals[block.id]}
          block={block}
          key={block.id}
          now={now}
          selected={selected === blockKey(block.id)}
        />
      ))}
    </ul>
  );
};

const MempoolTab = () => {
  const projected = useChainStore((state) => state.projected);
  const loaded = useChainStore((state) => state.blocks.length > 0);
  const selected = useViewStore((state) => state.selected);
  const queue = useMemo(() => projected.slice(QUEUED), [projected]);
  if (projected.length === 0) {
    return loaded ? (
      <EmptyState>
        The mempool is empty: every transaction made it into a block.
      </EmptyState>
    ) : (
      <LoadingRows />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5 p-1">
      {PLACES.map((index) => {
        const block = projected[index];
        return block ? (
          <ProjectedRow
            block={block}
            index={index}
            key={index}
            selected={selected === projectedKey(index)}
          />
        ) : null;
      })}
      {queue.length > 0 ? (
        <BacklogRow queue={queue} selected={selected === BACKLOG_KEY} />
      ) : null}
    </ul>
  );
};

/** Blocks waiting their turn in the mempool's queue, by their summed size. */
const useQueuedBlocks = () =>
  useChainStore((state) => {
    let vsize = 0;
    for (const block of state.projected) {
      vsize += block.vsize;
    }
    return Math.ceil(vsize / BLOCK_VSIZE);
  });

const Count = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground bg-muted-foreground/10 rounded-full px-1.5 text-[11px] tabular-nums">
    {children}
  </span>
);

/**
 * The newest blocks, and the blocks the mempool would fill next, in tabs.
 * Bare: it sits in a dock or a panel.
 */
export const BlocksList = ({
  className,
  listClassName,
}: {
  className?: string;
  listClassName?: string;
}) => {
  const tab = useViewStore((state) => state.tab);
  const { setTab } = useViewActions();
  const listed = useChainStore((state) =>
    Math.min(state.blocks.length, CONFIRMED_SHOWN)
  );
  const queued = useQueuedBlocks();
  const counts: Record<ListTab, number> = { blocks: listed, mempool: queued };

  const handleTabChange = (value: unknown) => {
    if (isListTab(value)) {
      setTab(value);
    }
  };

  return (
    <div className={cn("flex flex-col p-2", className)}>
      <Tabs
        className="min-h-0 flex-1 gap-1"
        onValueChange={handleTabChange}
        value={tab}
      >
        <TabsList className="w-full">
          {TABS.map(({ label, value }) => (
            <TabsTrigger key={value} value={value}>
              {label}
              {counts[value] > 0 ? (
                <Count>{formatNumber(counts[value])}</Count>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent className="min-h-0" value="blocks">
          <ScrollArea className={cn("h-64", listClassName)}>
            <BlocksTab />
          </ScrollArea>
        </TabsContent>
        <TabsContent className="min-h-0" value="mempool">
          <ScrollArea className={cn("h-64", listClassName)}>
            <MempoolTab />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
