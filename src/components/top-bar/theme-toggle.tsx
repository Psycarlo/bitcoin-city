import { Moon, Sun } from "lucide-react";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { switchTheme } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";
import { useTheme } from "@/stores/theme-store";

/** The sun and the moon cross-fade where they stand. */
const ICON =
  "absolute size-[18px] transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

/** Day or night: the new theme grows out of the button, over the old one. */
export const ThemeToggle = () => {
  const theme = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to day" : "Switch to night";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    void switchTheme(dark ? "light" : "dark", {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="relative size-10 rounded-full"
            onClick={handleClick}
            size="icon"
            variant="ghost"
          />
        }
      >
        <Sun
          className={cn(
            ICON,
            dark ? "scale-[0.25] opacity-0 blur-xs" : "scale-100"
          )}
          data-theme-icon
        />
        <Moon
          className={cn(
            ICON,
            dark ? "scale-100" : "scale-[0.25] opacity-0 blur-xs"
          )}
          data-theme-icon
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
