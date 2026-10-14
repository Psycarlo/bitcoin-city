import {
  Bell,
  BellOff,
  Box,
  Fish,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatClock } from "@/lib/format";
import type { SceneKey } from "@/lib/scene-key";
import { TONE_CLASSES } from "@/lib/tone";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { useActivityStore } from "@/stores/activity-store";
import type { ActivityEvent, ActivityKind } from "@/stores/activity-store";
import { show } from "@/stores/selection";

const KINDS: Record<ActivityKind, { Icon: LucideIcon; tone: Tone }> = {
  block: { Icon: Box, tone: "amber" },
  "price-down": { Icon: TrendingDown, tone: "red" },
  "price-up": { Icon: TrendingUp, tone: "green" },
  whale: { Icon: Fish, tone: "violet" },
};

interface EventRowProps {
  event: ActivityEvent;
  onPick: (key: SceneKey) => void;
}

const EventRow = ({ event, onPick }: EventRowProps) => {
  const { Icon, tone } = KINDS[event.kind];
  const { target } = event;
  const handleClick = () => {
    if (target) {
      onPick(target);
    }
  };
  return (
    <li>
      <button
        className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!target}
        onClick={handleClick}
        type="button"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            TONE_CLASSES[tone].badge
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {event.title}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {event.detail}
          </span>
        </span>
        <time
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
          dateTime={new Date(event.time).toISOString()}
        >
          {formatClock(event.time)}
        </time>
      </button>
    </li>
  );
};

const EventList = ({ onPick }: { onPick: (key: SceneKey) => void }) => {
  const events = useActivityStore((state) => state.events);
  if (events.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm text-pretty">
        <BellOff className="size-5" />
        New blocks, big transactions and price milestones show up here.
      </div>
    );
  }
  return (
    <ol className="-mx-2 max-h-96 overflow-y-auto overscroll-contain">
      {events.map((event) => (
        <EventRow event={event} key={event.id} onPick={onPick} />
      ))}
    </ol>
  );
};

/** What just happened: blocks found, whales on the move, the price crossing round numbers. */
export const ActivityMenu = () => {
  const [open, setOpen] = useState(false);
  const unseen = useActivityStore((state) => state.unseen);
  const { markSeen } = useActivityStore((state) => state.actions);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    markSeen();
  };

  const handlePick = (key: SceneKey) => {
    show(key);
    setOpen(false);
    markSeen();
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={unseen > 0 ? `Activity, ${unseen} new` : "Activity"}
            className="relative size-10 rounded-full"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Bell className="size-[18px]" />
        {unseen > 0 ? (
          <span className="absolute top-2 right-2.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] gap-3"
        sideOffset={8}
      >
        <PopoverHeader>
          <PopoverTitle>Activity</PopoverTitle>
          <PopoverDescription>
            On the network since you opened the page, newest first.
          </PopoverDescription>
        </PopoverHeader>
        <EventList onPick={handlePick} />
      </PopoverContent>
    </Popover>
  );
};
