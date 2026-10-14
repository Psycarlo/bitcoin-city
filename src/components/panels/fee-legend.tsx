import { feeGradient, feeScalePosition, LEGEND_RATES } from "@/lib/fees";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRADIENT = feeGradient();

/** What the colours of the city mean: fee rates, from cool and cheap to hot and pricey. */
export const FeeLegend = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "pointer-events-auto flex items-center gap-3 rounded-full bg-white/90 py-1.5 pr-4 pl-3.5 shadow-sm ring-1 shadow-slate-900/5 ring-slate-900/5 backdrop-blur-md",
      className
    )}
  >
    <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
      Fee rate
    </span>
    <div className="w-40">
      <div
        className="h-2 rounded-full ring-1 ring-slate-900/5"
        style={{ background: GRADIENT }}
      />
      <div className="relative mt-0.5 h-3">
        {LEGEND_RATES.map((rate) => (
          <span
            className="text-muted-foreground absolute -translate-x-1/2 text-[10px] leading-3 tabular-nums"
            key={rate}
            style={{ left: `${feeScalePosition(rate) * 100}%` }}
          >
            {formatRate(rate)}
          </span>
        ))}
      </div>
    </div>
    <span className="text-muted-foreground text-xs whitespace-nowrap">
      sat/vB
    </span>
  </div>
);
