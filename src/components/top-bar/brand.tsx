import { Bitcoin } from "lucide-react";

/** The mark, and the name beside it on wide screens (never when `compact`). */
export const Brand = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex shrink-0 items-center gap-2.5 pr-1">
    <span className="bg-primary text-primary-foreground shadow-primary/30 flex size-9 items-center justify-center rounded-xl shadow-md">
      <Bitcoin className="size-5" />
    </span>
    {compact ? null : (
      <span className="hidden text-[15px] font-semibold tracking-tight xl:block">
        Bitcoin City
      </span>
    )}
  </div>
);
