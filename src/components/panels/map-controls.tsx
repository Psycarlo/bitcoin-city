import { House, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { cn } from "@/lib/utils";
import { sendCameraCommand } from "@/stores/camera-store";

const ZOOM_STEP = 1.6;
const ROTATE_STEP = 45;

const handleZoomIn = () => {
  sendCameraCommand({ factor: ZOOM_STEP, kind: "zoom" });
};

const handleZoomOut = () => {
  sendCameraCommand({ factor: 1 / ZOOM_STEP, kind: "zoom" });
};

const handleRotateLeft = () => {
  sendCameraCommand({ degrees: ROTATE_STEP, kind: "rotate" });
};

const handleRotateRight = () => {
  sendCameraCommand({ degrees: -ROTATE_STEP, kind: "rotate" });
};

const handleHome = () => {
  sendCameraCommand({ kind: "home" });
};

interface ControlButtonProps {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  shortcut: string;
}

const ControlButton = ({
  Icon,
  label,
  onPress,
  shortcut,
}: ControlButtonProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          aria-label={label}
          className="rounded-full text-slate-600"
          onClick={onPress}
          size="icon-sm"
          variant="ghost"
        />
      }
    >
      <Icon />
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={10}>
      {label}
      <Kbd>{shortcut}</Kbd>
    </TooltipContent>
  </Tooltip>
);

/** Zoom, rotate and reset the 3D view (also with + − Q E H). */
export const MapControls = ({ className }: { className?: string }) => {
  useKeyboardShortcut("+", handleZoomIn);
  useKeyboardShortcut("=", handleZoomIn);
  useKeyboardShortcut("-", handleZoomOut);
  useKeyboardShortcut("q", handleRotateLeft);
  useKeyboardShortcut("e", handleRotateRight);
  useKeyboardShortcut("h", handleHome);

  return (
    <nav
      aria-label="Map"
      className={cn(
        "pointer-events-auto flex w-fit flex-col items-center gap-1 rounded-full bg-white/95 p-1 shadow-sm ring-1 shadow-slate-900/5 ring-slate-900/5 backdrop-blur-md",
        className
      )}
    >
      <ControlButton
        Icon={Plus}
        label="Zoom in"
        onPress={handleZoomIn}
        shortcut="+"
      />
      <ControlButton
        Icon={Minus}
        label="Zoom out"
        onPress={handleZoomOut}
        shortcut="−"
      />
      <Separator className="w-5" />
      <ControlButton
        Icon={RotateCcw}
        label="Rotate left"
        onPress={handleRotateLeft}
        shortcut="Q"
      />
      <ControlButton
        Icon={RotateCw}
        label="Rotate right"
        onPress={handleRotateRight}
        shortcut="E"
      />
      <Separator className="w-5" />
      <ControlButton
        Icon={House}
        label="Reset view"
        onPress={handleHome}
        shortcut="H"
      />
    </nav>
  );
};
