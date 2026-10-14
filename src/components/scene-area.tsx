import { Box, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { Button } from "@/components/ui/button";
import { supportsWebGL } from "@/lib/webgl";
import type { Insets } from "@/scene/camera-rig";

// three.js is most of the code: it loads while the panels already show.
const WorldScene = lazy(async () => {
  const { WorldScene: Scene } = await import("@/scene/world-scene");
  return { default: Scene };
});

const WEBGL = supportsWebGL();

interface SceneMessageProps {
  Icon: LucideIcon;
  action?: ReactNode;
  spin?: boolean;
  text?: string;
  title: string;
}

/** A short note in a card, centred in the space it is given. */
const SceneMessage = ({
  Icon,
  action,
  spin = false,
  text,
  title,
}: SceneMessageProps) => (
  <div className="flex size-full items-center justify-center p-6">
    <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/85 px-6 py-5 text-center shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md">
      <Icon
        className={
          spin ? "text-primary size-6 animate-spin" : "text-primary size-6"
        }
      />
      <output className="block">
        <span className="block font-semibold">{title}</span>
        {text ? (
          <span className="text-muted-foreground mt-1 block text-sm text-pretty">
            {text}
          </span>
        ) : null}
      </output>
      {action}
    </div>
  </div>
);

/** Keeps a message in the part of the scene the panels leave free. */
const InsetBox = ({
  children,
  insets,
}: {
  children: ReactNode;
  insets: Insets;
}) => (
  <div
    className="size-full"
    style={{
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingTop: insets.top,
    }}
  >
    {children}
  </div>
);

const handleReload = () => {
  globalThis.location.reload();
};

const ReloadButton = () => (
  <Button onClick={handleReload} size="sm" variant="outline">
    <RotateCcw />
    Reload
  </Button>
);

/** The 3D city, or what stands in for it while it loads or when it cannot be drawn. */
export const SceneArea = ({ insets }: { insets: Insets }) => {
  if (!WEBGL) {
    return (
      <InsetBox insets={insets}>
        <SceneMessage
          Icon={Box}
          text="This browser cannot draw 3D graphics (WebGL 2 is off or missing). The panels still show the chain and the price live."
          title="No 3D view"
        />
      </InsetBox>
    );
  }
  return (
    <ErrorBoundary
      fallback={
        <InsetBox insets={insets}>
          <SceneMessage
            action={<ReloadButton />}
            Icon={TriangleAlert}
            text="Something went wrong while drawing the city. The panels still work."
            title="The 3D view stopped"
          />
        </InsetBox>
      }
    >
      <Suspense
        fallback={
          <InsetBox insets={insets}>
            <SceneMessage Icon={LoaderCircle} spin title="Building the city…" />
          </InsetBox>
        }
      >
        <WorldScene insets={insets} />
      </Suspense>
    </ErrorBoundary>
  );
};
