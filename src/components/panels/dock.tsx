import { ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useViewActions, useViewStore } from "@/stores/view-store";
import type { Dock as DockName } from "@/stores/view-store";

import { Panel } from "./panel";

interface DockProps {
  Icon: LucideIcon;
  children: ReactNode;
  className?: string;
  name: DockName;
  /** A line on what is inside, shown on the handle. */
  summary?: ReactNode;
  title: string;
}

/**
 * A panel at the foot of the screen that folds down to its handle, so the
 * city has the room. It opens upwards; whether it is open is remembered.
 */
export const Dock = ({
  Icon,
  children,
  className,
  name,
  summary,
  title,
}: DockProps) => {
  const open = useViewStore((state) => state.docks[name]);
  const { setDock } = useViewActions();
  const handleToggle = () => {
    setDock(name);
  };
  const id = `dock-${name}`;
  return (
    <Panel
      aria-label={title}
      className={cn("group flex flex-col overflow-hidden", className)}
      data-open={open || undefined}
    >
      <div
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out data-open:grid-rows-[1fr]"
        data-open={open || undefined}
        id={id}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="hover:bg-accent/60 focus-visible:bg-accent/60 group-data-open:border-border/70 flex h-12 w-full shrink-0 items-center gap-2.5 border-t border-transparent px-3.5 text-left transition-colors outline-none"
        onClick={handleToggle}
        type="button"
      >
        <Icon className="text-primary size-4 shrink-0" />
        <span className="shrink-0 text-sm font-semibold">{title}</span>
        {summary ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronUp
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-300",
            open && "rotate-180"
          )}
        />
      </button>
    </Panel>
  );
};
