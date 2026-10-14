import { Check, Info, LoaderCircle, RotateCcw, Server } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setSourceDialogOpen, useDialogStore } from "@/stores/dialog-store";
import {
  DEFAULT_SOURCE,
  probeSource,
  useSource,
  useSourceActions,
} from "@/stores/source-store";
import type { Source } from "@/stores/source-store";

/** What a kind of source brings, in a word. */
const KIND_LABELS: Record<Source["kind"], string> = {
  esplora: "Esplora · polled",
  mempool: "mempool · live",
};

const KindBadge = ({ kind }: { kind: Source["kind"] }) => (
  <Badge
    className={cn(
      "shrink-0",
      kind === "mempool"
        ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
        : "bg-amber-500/12 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
    )}
  >
    {KIND_LABELS[kind]}
  </Badge>
);

type Probe =
  | { state: "idle" }
  | { state: "checking" }
  | { message: string; state: "failed" };

/**
 * The dialog's body: what it is connected to, and an address to try. It
 * mounts afresh each time the dialog opens, starting from the source in use.
 */
const SourceForm = () => {
  const source = useSource();
  const { resetSource, setSource } = useSourceActions();
  const [address, setAddress] = useState(source.api);
  const [check, setCheck] = useState<Probe>({ state: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  // A check still running when the dialog closes is dropped.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const handleAddress = (event: ChangeEvent<HTMLInputElement>) => {
    setAddress(event.target.value);
    setCheck({ state: "idle" });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setCheck({ state: "checking" });
    try {
      const found = await probeSource(address, controller.signal);
      if (!controller.signal.aborted) {
        setSource(found);
        setSourceDialogOpen(false);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setCheck({
          message:
            error instanceof Error
              ? error.message
              : "That address did not work.",
          state: "failed",
        });
      }
    }
  };

  const handleReset = () => {
    resetSource();
    setSourceDialogOpen(false);
  };

  const checking = check.state === "checking";
  const custom = source.api !== DEFAULT_SOURCE.api;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Data source</DialogTitle>
        <DialogDescription>
          Where blocks, the mempool and fees come from. Use mempool.space, your
          own mempool instance, or any Esplora API that allows cross-origin
          requests.
        </DialogDescription>
      </DialogHeader>

      <div className="bg-muted/60 ring-border/60 flex items-center gap-3 rounded-2xl p-3 ring-1">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Server className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[11px]">
            Connected to
          </span>
          <span className="block truncate font-medium">{source.label}</span>
        </span>
        <KindBadge kind={source.kind} />
      </div>

      <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
        <label className="text-xs font-medium" htmlFor="source-address">
          API address
        </label>
        <Input
          aria-describedby="source-hint"
          aria-invalid={check.state === "failed" || undefined}
          autoComplete="url"
          id="source-address"
          inputMode="url"
          onChange={handleAddress}
          placeholder="https://mempool.space/api"
          readOnly={checking}
          spellCheck={false}
          value={address}
        />
        {check.state === "failed" ? (
          <p className="text-destructive text-xs" role="alert">
            {check.message}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs" id="source-hint">
            e.g. https://mempool.second.tech/api or mempool.space/testnet4
          </p>
        )}
        {source.kind === "esplora" ? (
          <p className="text-muted-foreground flex items-start gap-2 text-xs text-pretty">
            <Info className="mt-px size-3.5 shrink-0" />
            Esplora APIs are polled and know less than mempool: no mining pools,
            and only blocks found while the page is open get a city.
          </p>
        ) : null}
        <DialogFooter className="mt-2">
          {custom ? (
            <Button
              className="mr-auto"
              disabled={checking}
              onClick={handleReset}
              size="sm"
              type="button"
              variant="ghost"
            >
              <RotateCcw />
              Use mempool.space
            </Button>
          ) : null}
          <Button
            disabled={checking || address.trim() === ""}
            size="sm"
            type="submit"
          >
            {checking ? <LoaderCircle className="animate-spin" /> : <Check />}
            {checking ? "Checking…" : "Connect"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
};

/**
 * Where blocks, the mempool and fees come from: mempool.space, or any other
 * mempool instance or Esplora API (self-hosted, say). The address is checked
 * before it is used: what kind of API it is decides how the city is fed.
 * Mount once.
 */
export const SourceDialog = () => {
  const open = useDialogStore((state) => state.source);
  return (
    <Dialog onOpenChange={setSourceDialogOpen} open={open}>
      <DialogContent>
        <SourceForm />
      </DialogContent>
    </Dialog>
  );
};
