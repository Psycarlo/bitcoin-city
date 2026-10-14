import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewActions, useViewStore } from "@/stores/view-store";

/** Tucks every panel away for the city alone, and brings them back (also Z). */
export const ZenToggle = ({ className }: { className?: string }) => {
  const zen = useViewStore((state) => state.zen);
  const { toggleZen } = useViewActions();
  const label = zen ? "Show panels" : "Hide panels";
  const Icon = zen ? Minimize2 : Maximize2;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={zen}
            className={cn("size-10 rounded-full", className)}
            onClick={toggleZen}
            size="icon"
            variant="ghost"
          />
        }
      >
        <Icon className="size-[18px]" />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <Kbd>Z</Kbd>
      </TooltipContent>
    </Tooltip>
  );
};
