const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const SATS_PER_BTC = 100_000_000;
/** Below this many sats, an amount reads better in sats than in BTC. */
const SATS_BELOW = 100_000;
const KILO = 1000;
const MEGA = 1_000_000;
const TERA = 1e12;

const numberFormat = new Intl.NumberFormat("en-GB");
/** en-US: some engines write en-GB's thousands as a lowercase "k". */
const compactFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const usdFormat = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});
const usdWholeFormat = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const DASH = "—";

export const formatNumber = (value: number) =>
  numberFormat.format(Math.round(value));

/** "81.7K". */
export const formatCompact = (value: number) => compactFormat.format(value);

/** A number with a set count of decimals: "3.50". */
export const formatFixed = (value: number, digits: number) =>
  value.toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

/** "$86,038.42". */
export const formatUsd = (usd?: number) =>
  usd === undefined ? DASH : usdFormat.format(usd);

/** "$86,038", or "$0.53" for small amounts, where the cents matter. */
export const formatUsdWhole = (usd: number) =>
  Math.abs(usd) < 100 ? usdFormat.format(usd) : usdWholeFormat.format(usd);

const btcDigits = (btc: number) => {
  if (btc >= KILO) {
    return 0;
  }
  if (btc >= 10) {
    return 2;
  }
  return btc >= 0.001 ? 4 : 8;
};

/** "0.5310 BTC", "314.48 BTC". */
export const formatBtc = (sats: number) => {
  const btc = sats / SATS_PER_BTC;
  return `${formatFixed(btc, btcDigits(Math.abs(btc)))} BTC`;
};

/** "4,210 sats" for small amounts, BTC for larger ones. */
export const formatAmount = (sats: number) =>
  Math.abs(sats) < SATS_BELOW ? `${formatNumber(sats)} sats` : formatBtc(sats);

const rateDigits = (rate: number) => {
  if (rate < 1) {
    return 2;
  }
  return rate < 10 ? 1 : 0;
};

/** A fee rate without its unit: "0.15", "3.5", "120". */
export const formatRate = (rate: number) => formatFixed(rate, rateDigits(rate));

/** "3.5 sat/vB". */
export const formatFeeRate = (rate?: number) =>
  rate === undefined ? DASH : `${formatRate(rate)} sat/vB`;

/** "245 vB", "12.3 kvB", "1.00 MvB". */
export const formatVsize = (vbytes: number) => {
  if (vbytes >= MEGA) {
    return `${formatFixed(vbytes / MEGA, 2)} MvB`;
  }
  if (vbytes >= KILO) {
    return `${formatFixed(vbytes / KILO, 1)} kvB`;
  }
  return `${formatNumber(vbytes)} vB`;
};

/** "1.62 MB", "312 kB". */
export const formatBytes = (bytes: number) => {
  if (bytes >= MEGA) {
    return `${formatFixed(bytes / MEGA, 2)} MB`;
  }
  if (bytes >= KILO) {
    return `${formatNumber(bytes / KILO)} kB`;
  }
  return `${formatNumber(bytes)} B`;
};

/** "3.99 MWU". */
export const formatWeight = (units: number) =>
  `${formatFixed(units / MEGA, 2)} MWU`;

export const formatPercent = (value: number, digits = 1) =>
  `${formatFixed(value, digits)}%`;

/** "+1.23%", "−0.40%", "±0%". */
export const formatSignedPercent = (value: number, digits = 2) => {
  if (value === 0) {
    return "±0%";
  }
  return `${value > 0 ? "+" : "−"}${formatFixed(Math.abs(value), digits)}%`;
};

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export const formatAgo = (time: number, now: number) => {
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  return `${Math.floor(elapsed / DAY)} d ago`;
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** Time gone by as a running clock: "4:07", "1:02:30". */
export const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes}:${twoDigits(seconds)}`;
};

/** A rough time ahead: "~8 min", "~3 h", "~12 days", "~1.6 years". */
export const formatDuration = (ms: number) => {
  if (ms < HOUR) {
    return `~${Math.max(1, Math.round(ms / MINUTE))} min`;
  }
  if (ms < 2 * DAY) {
    return `~${Math.round(ms / HOUR)} h`;
  }
  if (ms < 60 * DAY) {
    return `~${Math.round(ms / DAY)} days`;
  }
  return `~${formatFixed(ms / YEAR, 1)} years`;
};

/** "14:05", local time. */
export const formatClock = (time: number) => clockFormat.format(time);

/** "6 Oct, 14:05". */
export const formatDateTime = (time: number) => dateTimeFormat.format(time);

/** "6 Oct 2026". */
export const formatDate = (time: number) => dateFormat.format(time);

const HASHRATE_UNITS: readonly (readonly [number, string])[] = [
  [1e21, "ZH/s"],
  [1e18, "EH/s"],
  [1e15, "PH/s"],
  [TERA, "TH/s"],
];

/** "958 EH/s". */
export const formatHashrate = (hashes: number) => {
  const [scale, unit] = HASHRATE_UNITS.find(([size]) => hashes >= size) ?? [
    1,
    "H/s",
  ];
  const value = hashes / scale;
  return `${formatFixed(value, value < 10 ? 2 : 0)} ${unit}`;
};

/** "132.72 T". */
export const formatDifficulty = (difficulty: number) =>
  `${formatFixed(difficulty / TERA, 2)} T`;

/** "#970,182". */
export const formatHeight = (height: number) => `#${formatNumber(height)}`;

/** "66aa6f…f76501". */
export const shortId = (id: string, head = 6, tail = 6) =>
  id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
