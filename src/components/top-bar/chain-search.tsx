import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  ArrowRightLeft,
  Box,
  Layers,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { fetchBlockHash } from "@/data/mempool";
import type { Block, ProjectedBlock, TxSummary } from "@/data/types";
import { useClock } from "@/hooks/use-clock";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useMediaQuery } from "@/hooks/use-media-query";
import { COINBASE_COLOUR, feeColour } from "@/lib/fees";
import {
  formatAgo,
  formatBtc,
  formatHeight,
  formatNumber,
  formatRate,
  shortId,
} from "@/lib/format";
import { blockKey, projectedKey, txKey } from "@/lib/scene-key";
import { hitId, searchChain } from "@/lib/search";
import type { SearchHit } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useChainStore } from "@/stores/chain-store";
import { show } from "@/stores/selection";
import { getSource } from "@/stores/source-store";
import { useSummaryStore } from "@/stores/summary-store";

const NO_BLOCKS: readonly Block[] = [];
const NO_PROJECTED: readonly ProjectedBlock[] = [];
const NO_TXS: ReadonlyMap<string, TxSummary> = new Map();
const NO_SUMMARIES: Readonly<Record<string, readonly TxSummary[]>> = {};
/** Below this width the field folds into a button. */
const WIDE_QUERY = "(min-width: 640px)";
const MINUTES_PER_BLOCK = 10;
const lookUp = () => `Look it up on ${getSource().label}`;

interface HitView {
  Icon: LucideIcon;
  /** Fee colour of the dot by the title. */
  colour?: string;
  detail: string;
  /** Ids read better in a monospace font. */
  mono?: boolean;
  title: string;
  trailing?: string;
}

interface ViewContext {
  /** Height looked up last without success. */
  failed?: number;
  now: number;
  tip?: number;
}

const projectedTitle = (index: number) =>
  index === 0 ? "Next block" : `In ~${(index + 1) * MINUTES_PER_BLOCK} min`;

const txPlace = (hit: Extract<SearchHit, { kind: "tx" }>) => {
  if (!hit.mined) {
    return "Next block";
  }
  return hit.height === undefined
    ? "Mined"
    : `Block ${formatHeight(hit.height)}`;
};

const viewOf = (hit: SearchHit, { failed, now, tip }: ViewContext): HitView => {
  switch (hit.kind) {
    case "block": {
      const { block } = hit;
      return {
        Icon: Box,
        colour: feeColour(block.medianFee),
        detail: `${block.pool?.name ?? "Unknown miner"} · ${formatNumber(block.txCount)} txs`,
        title: `Block ${formatHeight(block.height)}`,
        trailing: formatAgo(block.time, now),
      };
    }
    case "block-hash": {
      return {
        Icon: Search,
        detail: lookUp(),
        mono: true,
        title: shortId(hit.hash, 10, 8),
      };
    }
    case "block-height": {
      return {
        Icon: Search,
        detail:
          failed === hit.height
            ? `Could not reach ${getSource().label}. Try again.`
            : lookUp(),
        title: `Block ${formatHeight(hit.height)}`,
      };
    }
    case "projected": {
      const { block, index } = hit;
      return {
        Icon: Layers,
        colour: feeColour(block.medianFee),
        detail: `${tip === undefined ? "In the mempool" : `Block ${formatHeight(tip + index + 1)}`} · ${formatNumber(block.txCount)} txs`,
        title: projectedTitle(index),
        trailing: `~${formatRate(block.medianFee)} sat/vB`,
      };
    }
    case "tx": {
      const { tx } = hit;
      return {
        Icon: ArrowRightLeft,
        colour: tx.coinbase ? COINBASE_COLOUR : feeColour(tx.rate),
        detail: tx.coinbase
          ? `${txPlace(hit)} · coinbase`
          : `${txPlace(hit)} · ${formatRate(tx.rate)} sat/vB`,
        mono: true,
        title: shortId(tx.txid, 10, 8),
        trailing: formatBtc(tx.value),
      };
    }
    default: {
      return {
        Icon: Search,
        detail: lookUp(),
        mono: true,
        title: shortId(hit.txid, 10, 8),
      };
    }
  }
};

interface SearchResultProps {
  context: ViewContext;
  hit: SearchHit;
  onPick: (hit: SearchHit) => void;
}

const SearchResult = ({ context, hit, onPick }: SearchResultProps) => {
  const { colour, detail, Icon, mono, title, trailing } = viewOf(hit, context);

  const handleClick = () => {
    onPick(hit);
  };

  return (
    <Autocomplete.Item
      className="data-highlighted:bg-accent flex cursor-default items-center gap-3 rounded-xl px-3 py-2 outline-none select-none"
      onClick={handleClick}
      value={hit}
    >
      <span className="text-muted-foreground bg-muted relative flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
        {colour ? (
          <span
            className="ring-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2"
            style={{ background: colour }}
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium",
            mono ? "font-mono text-[13px]" : "text-sm"
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {detail}
        </span>
      </span>
      {trailing ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {trailing}
        </span>
      ) : null}
    </Autocomplete.Item>
  );
};

/** Finds a block by height, hash or miner, or a transaction by its id. */
export const ChainSearch = () => {
  const [query, setQuery] = useState("");
  // On phones the field folds into a button and opens over the top bar.
  const [unfolded, setUnfolded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<number>();
  const wide = useMediaQuery(WIDE_QUERY);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const now = useClock(30_000);
  // Only follow the chain while there is something to search for.
  const searching = query.trim() !== "";
  const blocks = useChainStore((state) =>
    searching ? state.blocks : NO_BLOCKS
  );
  const pending = useChainStore((state) =>
    searching ? state.nextBlock.txs : NO_TXS
  );
  const projected = useChainStore((state) =>
    searching ? state.projected : NO_PROJECTED
  );
  const summaries = useSummaryStore((state) =>
    searching ? state.summaries : NO_SUMMARIES
  );
  const results = useMemo(
    () => searchChain({ blocks, pending, projected, summaries }, query),
    [blocks, pending, projected, summaries, query]
  );
  const context: ViewContext = { failed, now, tip: blocks[0]?.height };

  const focusInput = useCallback(() => {
    setUnfolded(true);
    inputRef.current?.focus();
  }, []);
  useKeyboardShortcut("/", focusInput);

  const handleValueChange = (
    value: string,
    details: Autocomplete.Root.ChangeEventDetails
  ) => {
    // Picking a result shows it rather than filling the box with its name.
    setQuery(details.reason === "item-press" ? "" : value);
  };

  const lookUpHeight = async (height: number) => {
    setBusy(true);
    setFailed(undefined);
    try {
      const hash = await fetchBlockHash(height);
      setBusy(false);
      show(blockKey(hash));
    } catch {
      // Back in the box, the result now says what went wrong.
      setBusy(false);
      setFailed(height);
      setQuery(String(height));
    }
  };

  const handlePick = (hit: SearchHit) => {
    setQuery("");
    setUnfolded(false);
    inputRef.current?.blur();
    switch (hit.kind) {
      case "block": {
        show(blockKey(hit.block.id));
        break;
      }
      case "block-hash": {
        show(blockKey(hit.hash));
        break;
      }
      case "block-height": {
        void lookUpHeight(hit.height);
        break;
      }
      case "projected": {
        show(projectedKey(hit.index));
        break;
      }
      case "tx": {
        show(txKey(hit.tx.txid));
        break;
      }
      default: {
        show(txKey(hit.txid));
        break;
      }
    }
  };

  const handleFold = () => {
    setQuery("");
    setUnfolded(false);
  };

  const field = (
    <div
      className="ring-primary/30 bg-muted/80 focus-within:bg-card flex h-10 w-full min-w-0 items-center gap-2 rounded-full px-3.5 transition-shadow focus-within:ring-2"
      ref={anchorRef}
    >
      {busy ? (
        <LoaderCircle className="text-muted-foreground size-4 shrink-0 animate-spin" />
      ) : (
        <Search className="text-muted-foreground size-4 shrink-0" />
      )}
      <Autocomplete.Input
        aria-label="Search the chain"
        autoFocus={!wide}
        className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
        placeholder={
          wide ? "Search block, transaction or miner…" : "Block, txid or miner…"
        }
        ref={inputRef}
        spellCheck={false}
      />
      {wide ? (
        <Kbd className="bg-card shadow-xs">/</Kbd>
      ) : (
        <Button
          aria-label="Close search"
          className="-mr-2 rounded-full"
          onClick={handleFold}
          size="icon-sm"
          variant="ghost"
        >
          <X />
        </Button>
      )}
    </div>
  );

  let control = field;
  if (!wide) {
    control = unfolded ? (
      <div className="bg-card absolute inset-0 z-20 flex items-center rounded-2xl px-3">
        {field}
      </div>
    ) : (
      <Button
        aria-label="Search the chain"
        className="rounded-full"
        onClick={focusInput}
        size="icon-lg"
        variant="ghost"
      >
        <Search />
      </Button>
    );
  }

  return (
    <Autocomplete.Root
      autoHighlight
      filter={null}
      items={results}
      itemToStringValue={hitId}
      onValueChange={handleValueChange}
      value={query}
    >
      {control}
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          align="start"
          anchor={anchorRef}
          className="z-50 outline-none"
          sideOffset={8}
        >
          <Autocomplete.Popup className="bg-popover text-popover-foreground ring-foreground/5 dark:ring-foreground/10 data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 w-(--anchor-width) max-w-(--available-width) min-w-80 origin-(--transform-origin) rounded-2xl p-1 shadow-2xl ring-1 duration-100">
            <Autocomplete.Empty>
              <p className="text-muted-foreground px-3 py-4 text-sm text-pretty">
                {searching
                  ? "Nothing on the page matches. Paste a full txid or block hash to look it up."
                  : "Type a block height, a block hash, a txid or a mining pool."}
              </p>
            </Autocomplete.Empty>
            <Autocomplete.List className="max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain">
              {(hit: SearchHit) => (
                <SearchResult
                  context={context}
                  hit={hit}
                  key={hitId(hit)}
                  onPick={handlePick}
                />
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
};
