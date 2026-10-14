import { cn } from "@/lib/utils";

const SOURCES = [
  { href: "https://mempool.space", label: "Blocks & mempool: mempool.space" },
  { href: "https://www.binance.com", label: "Price: Binance" },
] as const;

/** Credits where the data comes from. */
export const Attribution = ({ className }: { className?: string }) => (
  <p
    className={cn(
      "pointer-events-auto w-fit rounded-md bg-white/60 px-2 py-0.5 text-[10px] leading-relaxed text-balance text-slate-500 backdrop-blur-sm",
      className
    )}
  >
    {SOURCES.map(({ href, label }, index) => (
      <span key={href}>
        {index > 0 ? " · " : null}
        <a
          className="hover:text-slate-700 hover:underline"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {label}
        </a>
      </span>
    ))}
  </p>
);
