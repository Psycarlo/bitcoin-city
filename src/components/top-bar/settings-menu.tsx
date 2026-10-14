import {
  ChartCandlestick,
  House,
  Radar,
  Server,
  SlidersHorizontal,
  Tags,
  Trees,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendCameraCommand } from "@/stores/camera-store";
import { openSourceDialog } from "@/stores/dialog-store";
import { useSource } from "@/stores/source-store";
import { useViewActions, useViewStore } from "@/stores/view-store";
import type { SceneToggles } from "@/stores/view-store";

interface Toggle {
  Icon: LucideIcon;
  label: string;
  layer: keyof SceneToggles;
}

const CITY_TOGGLES: readonly Toggle[] = [
  { Icon: Tags, label: "Labels", layer: "labels" },
  { Icon: ChartCandlestick, label: "Price skyline", layer: "skyline" },
  { Icon: Trees, label: "Trees", layer: "trees" },
];

const handleResetView = () => {
  sendCameraCommand({ kind: "home" });
};

const ToggleItem = ({ Icon, label, layer }: Toggle) => {
  const checked = useViewStore((state) => state.toggles[layer]);
  const { toggle } = useViewActions();
  const handleCheckedChange = () => {
    toggle(layer);
  };
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={handleCheckedChange}
    >
      <Icon />
      {label}
    </DropdownMenuCheckboxItem>
  );
};

const SourceItem = () => {
  const { label } = useSource();
  return (
    <DropdownMenuItem onClick={openSourceDialog}>
      <Server />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">Change…</span>
    </DropdownMenuItem>
  );
};

/** What the city shows, how the camera behaves, and where the data comes from. */
export const SettingsMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          aria-label="View settings"
          className="size-10 rounded-full"
          size="icon"
          variant="ghost"
        />
      }
    >
      <SlidersHorizontal className="size-[18px]" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto min-w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>City</DropdownMenuLabel>
        {CITY_TOGGLES.map((entry) => (
          <ToggleItem key={entry.layer} {...entry} />
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Camera</DropdownMenuLabel>
        <ToggleItem
          Icon={Radar}
          label="Follow new blocks"
          layer="followBlocks"
        />
        <DropdownMenuItem onClick={handleResetView}>
          <House />
          Reset view
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Data source</DropdownMenuLabel>
        <SourceItem />
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
