import { Crosshair, ExternalLink, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { clamp } from "@/lib/collections";
import { feeColour, feeGradient } from "@/lib/fees";
import { DASH, formatFeeRate, formatRate } from "@/lib/format";
import type { SceneKey } from "@/lib/scene-key";
import { TONE_CLASSES } from "@/lib/tone";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { sendCameraCommand } from "@/stores/camera-store";
import { clearSelection } from "@/stores/selection";

import { PanelEyebrow } from "./panel";

/** Building blocks shared by the transaction, block and network detail views. */

interface DetailHeaderProps {
  actions?: ReactNode;
  eyebrow: string;
  subtitle?: string;
  title: string;
}

export const DetailHeader = ({
  actions,
  eyebrow,
  subtitle,
  title,
}: DetailHeaderProps) => (
  <header className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <PanelEyebrow>{eyebrow}</PanelEyebrow>
      <h2 className="mt-1 truncate text-lg leading-tight font-semibold tracking-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-muted-foreground mt-0.5 truncate text-sm">
          {subtitle}
        </p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    ) : null}
  </header>
);

/** The top of a detail view: its header and where things stand. */
export const DetailTop = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-3 p-4 pb-3">{children}</div>
);

/**
 * The rest of a detail view, scrolling when it runs long. Its foot fades, so
 * a row cut off reads as more to come.
 */
export const DetailBody = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] px-4 pb-4">
    {children}
  </div>
);

interface StatusProps {
  children: ReactNode;
  description?: ReactNode;
  tone: Tone;
}

/** A coloured word for where something stands, and what that means. */
export const Status = ({ children, description, tone }: StatusProps) => (
  <div className="flex items-start gap-2">
    <Badge className={cn("shrink-0 gap-1.5", TONE_CLASSES[tone].badge)}>
      <span className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} />
      {children}
    </Badge>
    {description ? (
      <span className="text-muted-foreground pt-0.5 text-xs text-pretty">
        {description}
      </span>
    ) : null}
  </div>
);

/** A label and its value; rows without a value are left out. */
export type DetailRow = readonly [label: string, value: string | undefined];

const hasValue = (row: DetailRow): row is readonly [string, string] =>
  row[1] !== undefined && row[1] !== DASH;

export const DetailRows = ({ rows }: { rows: readonly DetailRow[] }) => (
  <dl className="divide-y divide-slate-100">
    {rows.filter(hasValue).map(([label, value]) => (
      <div
        className="flex items-baseline justify-between gap-4 py-2 text-sm"
        key={label}
      >
        <dt className="text-muted-foreground shrink-0">{label}</dt>
        <dd className="min-w-0 truncate text-right font-medium tabular-nums">
          {value}
        </dd>
      </div>
    ))}
  </dl>
);

/** A dot in a colour, such as a fee rate's. */
export const ColourDot = ({
  className,
  colour,
}: {
  className?: string;
  colour: string;
}) => (
  <span
    className={cn(
      "size-2 shrink-0 rounded-full ring-1 ring-slate-900/10",
      className
    )}
    style={{ background: colour }}
  />
);

export interface Stat {
  colour?: string;
  /** A quieter line under the value. */
  hint?: string;
  label: string;
  value?: string;
}

/** The few figures that matter most, side by side. */
export const StatTiles = ({
  className,
  stats,
}: {
  className?: string;
  stats: readonly Stat[];
}) => (
  <dl className={cn("grid grid-cols-3 gap-2", className)}>
    {stats.map(({ colour, hint, label, value }) => (
      <div
        className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100"
        key={label}
      >
        <dt className="text-muted-foreground truncate text-[11px]">{label}</dt>
        <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          {colour ? <ColourDot colour={colour} /> : null}
          <span className="truncate">{value ?? DASH}</span>
        </dd>
        {hint ? (
          <dd className="text-muted-foreground truncate text-[11px] tabular-nums">
            {hint}
          </dd>
        ) : null}
      </div>
    ))}
  </dl>
);

/** A titled part of a detail view. */
export const Section = ({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) => (
  <section>
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

/** Raw text, such as a hash, in a quiet monospace box. */
export const MonoBox = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-relaxed break-all text-slate-600 ring-1 ring-slate-100">
    {children}
  </p>
);

/** A short aside, with an icon. */
export const Note = ({
  Icon = Info,
  children,
}: {
  Icon?: LucideIcon;
  children: ReactNode;
}) => (
  <p className="text-muted-foreground flex items-start gap-2 text-xs text-pretty">
    <Icon className="mt-px size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

/** Stand-in rows while the details load. */
export const LoadingRows = ({ count = 5 }: { count?: number }) => (
  <div className="flex flex-col gap-3 py-1">
    {Array.from({ length: count }, (_, index) => index).map((index) => (
      <div className="flex items-center justify-between gap-4" key={index}>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    ))}
  </div>
);

const LOWEST = 0.1;

/** Where a rate sits between two others, on a log scale (0–1). */
const logShare = (rate: number, low: number, high: number) => {
  const from = Math.log(Math.max(low, LOWEST));
  const to = Math.log(Math.max(high, LOWEST));
  return to > from
    ? clamp((Math.log(Math.max(rate, LOWEST)) - from) / (to - from), 0, 1)
    : 0.5;
};

/** The spread of a block's fee rates, cheapest to dearest, in their colours. */
export const FeeRange = ({
  feeRange,
  median,
}: {
  feeRange: readonly number[];
  median?: number;
}) => {
  const [low] = feeRange;
  const high = feeRange.at(-1);
  if (low === undefined || high === undefined) {
    return null;
  }
  return (
    <Section
      action={
        <span className="text-xs font-medium tabular-nums">
          {formatRate(low)} – {formatFeeRate(high)}
        </span>
      }
      title="Fee rates"
    >
      <div
        className="relative h-2.5 rounded-full ring-1 ring-slate-900/5"
        style={{ background: feeGradient(low, high) }}
      >
        {median === undefined ? null : (
          <span
            className="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-900/15"
            style={{
              background: feeColour(median),
              left: `${logShare(median, low, high) * 100}%`,
            }}
            title={`Median ${formatFeeRate(median)}`}
          />
        )}
      </div>
      <div className="text-muted-foreground mt-1.5 flex justify-between gap-2 text-[11px] tabular-nums">
        <span>Cheapest</span>
        {median === undefined ? null : (
          <span>Median {formatFeeRate(median)}</span>
        )}
        <span>Dearest</span>
      </div>
    </Section>
  );
};

interface IconActionProps extends ComponentProps<typeof Button> {
  label: string;
}

/** A round icon button with its name in a tooltip. */
export const IconAction = ({ children, label, ...props }: IconActionProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          aria-label={label}
          className="rounded-full"
          size="icon-sm"
          variant="outline"
          {...props}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

/** Takes the camera to a block or transaction. */
export const FocusAction = ({ sceneKey }: { sceneKey: SceneKey }) => {
  const handleFocus = () => {
    sendCameraCommand({ key: sceneKey, kind: "focus" });
  };
  return (
    <IconAction label="Show in the city" onClick={handleFocus}>
      <Crosshair />
    </IconAction>
  );
};

/** Opens a page elsewhere, in a new tab. */
export const LinkAction = ({
  href,
  label,
}: {
  href: string;
  label: string;
}) => (
  <IconAction
    label={label}
    nativeButton={false}
    render={
      <a aria-label={label} href={href} rel="noreferrer" target="_blank" />
    }
  >
    <ExternalLink />
  </IconAction>
);

const handleClose = () => {
  clearSelection();
};

export const CloseAction = () => (
  <IconAction label="Close" onClick={handleClose} variant="ghost">
    <X />
  </IconAction>
);
