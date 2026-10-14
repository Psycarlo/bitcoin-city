import { useSelection } from "@/hooks/use-selection";
import type { Selection } from "@/hooks/use-selection";
import { cn } from "@/lib/utils";

import { BlockDetailsView } from "./block-details";
import { Panel } from "./panel";
import { ProjectedDetailsView } from "./projected-details";
import { TxDetailsView } from "./tx-details";

const LABELS: Record<Exclude<Selection["kind"], "none">, string> = {
  block: "Selected block",
  projected: "Selected mempool block",
  tx: "Selected transaction",
};

type Picked = Exclude<Selection, { kind: "none" }>;

const SelectionDetails = ({ selection }: { selection: Picked }) => {
  switch (selection.kind) {
    case "block": {
      return <BlockDetailsView key={selection.hash} selection={selection} />;
    }
    case "projected": {
      return (
        <ProjectedDetailsView index={selection.index} key={selection.index} />
      );
    }
    default: {
      return <TxDetailsView key={selection.txid} selection={selection} />;
    }
  }
};

/**
 * The picked block or transaction, sliding in while something is picked.
 * Mount once: it loads what is picked (and tells the scene which block holds
 * a picked transaction).
 */
export const DetailPanel = ({ className }: { className?: string }) => {
  const selection = useSelection();
  if (selection.kind === "none") {
    return null;
  }
  return (
    <Panel
      aria-label={LABELS[selection.kind]}
      className={cn(
        "animate-in fade-in slide-in-from-right-6 flex flex-col overflow-hidden duration-300 ease-out",
        className
      )}
    >
      <SelectionDetails selection={selection} />
    </Panel>
  );
};
