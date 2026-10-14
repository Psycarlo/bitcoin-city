import { Bitcoin } from "lucide-react";

export const Brand = () => (
  <div className="flex shrink-0 items-center gap-2.5 pr-1">
    <span className="bg-primary text-primary-foreground shadow-primary/30 flex size-9 items-center justify-center rounded-xl shadow-md">
      <Bitcoin className="size-5" />
    </span>
    <span className="hidden text-[15px] font-semibold tracking-tight xl:block">
      BlockCity
    </span>
  </div>
);
