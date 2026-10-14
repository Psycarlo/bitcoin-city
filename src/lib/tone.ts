export type Tone = "amber" | "blue" | "green" | "red" | "slate" | "violet";

export interface ToneClasses {
  /** Soft background with matching text, for badges and chips. */
  badge: string;
  /** Solid fill, for dots and indicators. */
  dot: string;
  /** Text only. */
  text: string;
}

/** Tailwind classes of each semantic tone. */
export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  amber: {
    badge:
      "bg-amber-500/12 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  blue: {
    badge:
      "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    dot: "bg-blue-600",
    text: "text-blue-700 dark:text-blue-300",
  },
  green: {
    badge:
      "bg-green-500/12 text-green-700 dark:bg-green-500/20 dark:text-green-300",
    dot: "bg-green-600",
    text: "text-green-700 dark:text-green-300",
  },
  red: {
    badge: "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    dot: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
  },
  slate: {
    badge: "bg-slate-500/10 text-muted-foreground",
    dot: "bg-slate-400",
    text: "text-muted-foreground",
  },
  violet: {
    badge:
      "bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    dot: "bg-violet-600",
    text: "text-violet-700 dark:text-violet-300",
  },
};
