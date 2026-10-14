import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** The frosted card every overlay panel sits on. */
export const Panel = ({ className, ...props }: ComponentProps<"section">) => (
  <section
    className={cn(
      "pointer-events-auto rounded-2xl bg-white/95 shadow-sm ring-1 shadow-slate-900/5 ring-slate-900/5 backdrop-blur-md",
      className
    )}
    {...props}
  />
);

/** Small uppercase heading of a panel, in the brand colour. */
export const PanelEyebrow = ({ className, ...props }: ComponentProps<"p">) => (
  <p
    className={cn(
      "text-primary-ink text-[11px] font-semibold tracking-wider uppercase",
      className
    )}
    {...props}
  />
);
