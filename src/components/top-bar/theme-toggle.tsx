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
            "absolute size-[18px] transition-all duration-500",
            dark ? "scale-50 -rotate-90 opacity-0" : "scale-100 rotate-0"
          )}
        />
        <Moon
          className={cn(
            "absolute size-[18px] transition-all duration-500",
            dark ? "scale-100 rotate-0" : "scale-50 rotate-90 opacity-0"
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
