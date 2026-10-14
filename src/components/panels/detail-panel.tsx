import { useSelection } from "@/hooks/use-selection";
import type { Selection } from "@/hooks/use-selection";
import { cn } from "@/lib/utils";

import { BlockDetailsView } from "./block-details";
import { NetworkDetailsView } from "./network-details";
import { Panel } from "./panel";
import { ProjectedDetailsView } from "./projected-details";
import { TxDetailsView } from "./tx-details";

const LABELS: Record<Selection["kind"], string> = {
  block: "Selected block",
  none: "Network",
  projected: "Selected mempool block",
  tx: "Selected transaction",
};

const SelectionDetails = ({ selection }: { selection: Selection }) => {
  switch (selection.kind) {
    case "block": {
      return <BlockDetailsView key={selection.hash} selection={selection} />;
    }
    case "projected": {
      return (
        <ProjectedDetailsView index={selection.index} key={selection.index} />
      );
    }
    case "tx": {
      return <TxDetailsView key={selection.txid} selection={selection} />;
    }
    default: {
      return <NetworkDetailsView />;
    }
  }
};

/**
 * The picked block or transaction, or the network when nothing is picked.
 * Mount once: it loads what is picked.
 */
export const DetailPanel = ({ className }: { className?: string }) => {
  const selection = useSelection();
  return (
    <Panel
      aria-label={LABELS[selection.kind]}
      className={cn("flex flex-col overflow-hidden", className)}
    >
      <SelectionDetails selection={selection} />
    </Panel>
  );
};
