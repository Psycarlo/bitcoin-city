import { Separator } from "@/components/ui/separator";
import { useViewStore } from "@/stores/view-store";

import { ActivityMenu } from "./activity-menu";
import { Brand } from "./brand";
import { ChainSearch } from "./chain-search";
import { LiveMenu } from "./live-menu";
import { SettingsMenu } from "./settings-menu";
import { ThemeToggle } from "./theme-toggle";
import { ZenToggle } from "./zen-toggle";

const SURFACE =
  "bg-card/90 ring-foreground/5 dark:ring-foreground/10 pointer-events-auto shadow-sm ring-1 shadow-black/5 backdrop-blur-md";

/** With the panels tucked away: the brand, whether it is live, and the way back. */
const ZenBar = () => (
  <header
    className={`${SURFACE} animate-in fade-in zoom-in-95 flex h-14 w-fit shrink-0 items-center gap-1.5 rounded-full py-2 pr-2 pl-2.5 duration-300`}
  >
    <Brand compact />
    <LiveMenu />
    <ZenToggle />
  </header>
);

export const TopBar = () => {
  const zen = useViewStore((state) => state.zen);
  if (zen) {
    return <ZenBar />;
  }
  return (
    <header
      className={`${SURFACE} animate-in fade-in relative flex h-16 shrink-0 items-center gap-2 rounded-2xl px-3 duration-300`}
    >
      <Brand />
      <div className="max-w-md min-w-0 flex-1">
        <ChainSearch />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <LiveMenu />
        <ActivityMenu />
        <Separator
          className="mx-1 hidden h-8 self-center sm:block"
          orientation="vertical"
        />
        <ThemeToggle />
        <ZenToggle />
        <SettingsMenu />
      </div>
    </header>
  );
};
