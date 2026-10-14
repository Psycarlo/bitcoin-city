import { Separator } from "@/components/ui/separator";

import { ActivityMenu } from "./activity-menu";
import { Brand } from "./brand";
import { ChainSearch } from "./chain-search";
import { LiveMenu } from "./live-menu";
import { SettingsMenu } from "./settings-menu";

export const TopBar = () => (
  <header className="pointer-events-auto relative flex h-16 shrink-0 items-center gap-2 rounded-2xl bg-white/90 px-3 shadow-sm ring-1 shadow-slate-900/5 ring-slate-900/5 backdrop-blur-md">
    <Brand />
    <div className="max-w-md min-w-0 flex-1">
      <ChainSearch />
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      <LiveMenu />
      <ActivityMenu />
      <Separator
        className="mx-1 hidden h-8 self-center sm:block"
        orientation="vertical"
      />
      <SettingsMenu />
    </div>
  </header>
);
