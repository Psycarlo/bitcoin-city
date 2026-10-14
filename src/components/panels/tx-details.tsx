import { Building2, CircleAlert } from "lucide-react";

import { mempoolLinks } from "@/data/mempool";
import type {
  Block,
  TxDetails,
  TxInput,
  TxOutput,
  TxSummary,
} from "@/data/types";
import { useClock } from "@/hooks/use-clock";
import type { Selection } from "@/hooks/use-selection";
import { SATS_PER_BTC } from "@/lib/bitcoin";
import { COINBASE_COLOUR, feeColour } from "@/lib/fees";
import {
  formatAgo,
  formatAmount,
  formatBtc,
  formatDateTime,
  formatHeight,
  formatNumber,
  formatRate,
  formatUsdWhole,
  formatVsize,
  formatWeight,
  shortId,
} from "@/lib/format";
import { txKey } from "@/lib/scene-key";
import type { Tone } from "@/lib/tone";
import { useChainStore, useTip } from "@/stores/chain-store";
import { usePrice } from "@/stores/price-store";

import {
  CloseAction,
  DetailBody,
  DetailHeader,
  DetailRows,
  DetailTop,
  FocusAction,
  LinkAction,
  LoadingRows,
  MonoBox,
  Note,
  Section,
  StatTiles,
  Status,
} from "./detail-parts";
import type { DetailRow, Stat } from "./detail-parts";

type TxSelection = Extract<Selection, { kind: "tx" }>;

/** Inputs and outputs listed; mempool.space has the rest. */
const LISTED = 5;
/** Sequence numbers below this signal the sender may replace it (BIP 125). */
const RBF_BELOW = 0xff_ff_ff_fe;
const WITNESS_SCALE = 4;

/** Plain names of output types that carry no address. */
const OUTPUT_TYPES: Readonly<Record<string, string>> = {
  op_return: "Data (OP_RETURN)",
  p2pk: "Public key",
  unknown: "Unknown script",
};

const usdOf = (sats: number, price?: number) =>
  price === undefined
    ? undefined
    : formatUsdWhole((sats / SATS_PER_BTC) * price);

interface StatusInfo {
  description: string;
  label: string;
  tone: Tone;
}

interface Facts {
  coinbase: boolean;
  confirmations?: number;
  confirmed: boolean;
  missing: boolean;
  nextBlock: boolean;
}

const statusOf = ({
  coinbase,
  confirmations,
  confirmed,
  missing,
  nextBlock,
}: Facts): StatusInfo | undefined => {
  if (confirmed) {
    const count =
      confirmations === undefined
        ? "Mined"
        : `${formatNumber(confirmations)} ${confirmations === 1 ? "confirmation" : "confirmations"}`;
    return coinbase
      ? {
          description: `${count}. The miner's reward: new coins and the block's fees.`,
          label: "Coinbase",
          tone: "amber",
        }
      : { description: `${count}.`, label: "Confirmed", tone: "green" };
  }
  if (nextBlock) {
    return {
      description: "Pays enough to be in the next block, as fees stand now.",
      label: "Next block",
      tone: "amber",
    };
  }
  if (missing) {
    return {
      description:
        "mempool.space has no record of it. It may have been replaced or dropped.",
      label: "Not found",
      tone: "red",
    };
  }
  return undefined;
};

const pendingStatus: StatusInfo = {
  description: "Waiting in the mempool for a block with room at its fee rate.",
  label: "In the mempool",
  tone: "blue",
};

const outputName = (output: TxOutput) =>
  output.address
    ? shortId(output.address, 10, 8)
    : (OUTPUT_TYPES[output.type] ?? output.type);

const inputName = (input: TxInput) => {
  if (input.coinbase) {
    return "New coins";
  }
  return input.address ? shortId(input.address, 10, 8) : "Unknown script";
};

interface Transfer {
  amount?: number;
  /** Its place in the transaction: inputs and outputs are known by it. */
  id: number;
  name: string;
}

/** Where the coins come from or go to, the first few of them. */
const Transfers = ({
  href,
  items,
  title,
}: {
  href: string;
  items: readonly Transfer[];
  title: string;
}) => (
  <Section
    action={
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatNumber(items.length)}
      </span>
    }
    title={title}
  >
    <ul className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-100">
      {items.slice(0, LISTED).map((item) => (
        <li
          className="flex items-baseline justify-between gap-3 py-1.5 text-xs"
          key={item.id}
        >
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-600">
            {item.name}
          </span>
          <span className="shrink-0 font-medium tabular-nums">
            {item.amount === undefined ? "" : formatAmount(item.amount)}
          </span>
        </li>
      ))}
      {items.length > LISTED ? (
        <li className="py-1.5 text-xs">
          <a
            className="text-primary-ink font-medium hover:underline"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {formatNumber(items.length - LISTED)} more on mempool.space
          </a>
        </li>
      ) : null}
    </ul>
  </Section>
);

const replaceableText = (details: TxDetails) =>
  details.inputs.some((input) => input.sequence < RBF_BELOW)
    ? "Yes, by a higher fee (RBF)"
    : "No";

/** What is known of a transaction, from its details, its summary and its block. */
interface TxFacts {
  coinbase: boolean;
  confirmations?: number;
  confirmed: boolean;
  fee?: number;
  height?: number;
  /** Whether there is anything to show beyond its id. */
  known: boolean;
  rate?: number;
  time?: number;
  value?: number;
  vsize?: number;
}

/** Fee, size, rate and value, from the full details or else the block's summary. */
const amountsOf = (details?: TxDetails, summary?: TxSummary) => {
  const fee = details?.fee ?? summary?.fee;
  const vsize = details
    ? Math.ceil(details.weight / WITNESS_SCALE)
    : summary?.vsize;
  return {
    fee,
    rate:
      summary?.rate ?? (fee !== undefined && vsize ? fee / vsize : undefined),
    value:
      summary?.value ??
      details?.outputs.reduce((sum, output) => sum + output.value, 0),
    vsize,
  };
};

/** Where and when it was mined, from its details or else the loaded block. */
const minedAt = (details?: TxDetails, block?: Block) => ({
  height: details?.status.blockHeight ?? block?.height,
  time: details?.status.blockTime ?? block?.time,
});

const factsOf = (
  { blockHash, details, summary }: TxSelection,
  block: Block | undefined,
  tipHeight: number | undefined
): TxFacts => {
  const { height, time } = minedAt(details, block);
  return {
    ...amountsOf(details, summary),
    coinbase: summary?.coinbase ?? details?.inputs[0]?.coinbase ?? false,
    confirmations:
      height !== undefined && tipHeight !== undefined
        ? Math.max(1, tipHeight - height + 1)
        : undefined,
    confirmed: blockHash !== undefined,
    height,
    known: details !== undefined || summary !== undefined,
    time,
  };
};

const txStatus = (
  { details, error, inNextBlock, loading }: TxSelection,
  { coinbase, confirmations, confirmed, known }: TxFacts
) =>
  statusOf({
    coinbase,
    confirmations,
    confirmed,
    missing: !(loading || known) && error !== undefined,
    nextBlock: inNextBlock,
  }) ?? (details ? pendingStatus : undefined);

/** The coinbase is gold; others are coloured by their fee rate. */
const rateColour = ({ coinbase, rate }: TxFacts) => {
  if (rate === undefined) {
    return;
  }
  return coinbase ? COINBASE_COLOUR : feeColour(rate);
};

const txStats = (facts: TxFacts, price: number | undefined): Stat[] => {
  const { coinbase, fee, rate, value } = facts;
  return [
    {
      colour: rateColour(facts),
      hint: "sat/vB",
      label: "Fee rate",
      value: coinbase || rate === undefined ? undefined : formatRate(rate),
    },
    {
      hint: fee === undefined ? undefined : usdOf(fee, price),
      label: "Fee",
      value: coinbase || fee === undefined ? undefined : formatAmount(fee),
    },
    {
      hint: value === undefined ? undefined : usdOf(value, price),
      label: coinbase ? "Paid out" : "Moves",
      value: value === undefined ? undefined : formatBtc(value),
    },
  ];
};

const txRows = (
  { coinbase, confirmed, height, time, vsize }: TxFacts,
  { details, summary }: TxSelection,
  now: number
): DetailRow[] => [
  [
    "Block",
    confirmed && height !== undefined
      ? `${formatHeight(height)}${time === undefined ? "" : ` · ${formatAgo(time, now)}`}`
      : undefined,
  ],
  ["Mined", time === undefined ? undefined : formatDateTime(time)],
  [
    "First seen",
    !confirmed && summary?.time !== undefined
      ? formatAgo(summary.time, now)
      : undefined,
  ],
  [
    "Size",
    vsize === undefined
      ? undefined
      : `${formatVsize(vsize)}${details ? ` · ${formatWeight(details.weight)}` : ""}`,
  ],
  [
    "Inputs → outputs",
    details
      ? `${formatNumber(details.inputs.length)} → ${formatNumber(details.outputs.length)}`
      : undefined,
  ],
  [
    "Replaceable",
    details && !confirmed && !coinbase ? replaceableText(details) : undefined,
  ],
];

/** Where its coins come from and where they go. */
const TxTransfers = ({
  details,
  href,
}: {
  details: TxDetails;
  href: string;
}) => (
  <>
    <Transfers
      href={href}
      items={details.inputs.map((input, id) => ({
        amount: input.value,
        id,
        name: inputName(input),
      }))}
      title="From"
    />
    <Transfers
      href={href}
      items={details.outputs.map((output, id) => ({
        amount: output.value,
        id,
        name: outputName(output),
      }))}
      title="To"
    />
  </>
);

/** One transaction: what it paid, what it moved and whether it is mined yet. */
export const TxDetailsView = ({ selection }: { selection: TxSelection }) => {
  const { blockHash, details, error, inNextBlock, loading, txid } = selection;
  const tip = useTip();
  const price = usePrice();
  const now = useClock(10_000);
  const block = useChainStore((state) =>
    blockHash ? state.blocks.find((item) => item.id === blockHash) : undefined
  );
  const facts = factsOf(selection, block, tip?.height);
  const { coinbase, confirmed, height, known } = facts;
  const status = txStatus(selection, facts);
  const href = mempoolLinks.tx(txid);

  return (
    <>
      <DetailTop>
        <DetailHeader
          actions={
            <>
              <FocusAction sceneKey={txKey(txid)} />
              <LinkAction href={href} label="Open on mempool.space" />
              <CloseAction />
            </>
          }
          eyebrow={coinbase ? "Coinbase transaction" : "Transaction"}
          subtitle={
            confirmed && height !== undefined
              ? `In block ${formatHeight(height)}`
              : "Not in a block yet"
          }
          title={shortId(txid, 8, 8)}
        />
        {status ? (
          <Status description={status.description} tone={status.tone}>
            {status.label}
          </Status>
        ) : null}
      </DetailTop>
      <DetailBody>
        {known ? (
          <>
            <StatTiles stats={txStats(facts, price)} />
            <DetailRows rows={txRows(facts, selection, now)} />
          </>
        ) : null}
        {loading && !known ? <LoadingRows /> : null}
        {details ? <TxTransfers details={details} href={href} /> : null}
        {error !== undefined && known && !details ? (
          <Note Icon={CircleAlert}>
            Could not load its inputs and outputs from mempool.space.
          </Note>
        ) : null}
        <Section title="Transaction ID">
          <MonoBox>{txid}</MonoBox>
        </Section>
        {confirmed || inNextBlock ? (
          <Note Icon={Building2}>
            {coinbase
              ? "The gold tower: the block's own first transaction, paying the miner."
              : "Its building stands in its block's city: as wide as its size, as tall and as warm as its fee rate."}
          </Note>
        ) : null}
      </DetailBody>
    </>
  );
};
