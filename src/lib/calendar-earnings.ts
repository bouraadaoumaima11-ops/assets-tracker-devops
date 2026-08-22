const DAY_MS = 86_400_000;

export type EarningsSession = "BMO" | "AMC" | "UNKNOWN";

const US_EQUITY_EXCHANGES = new Set([
  "nasdaqgs",
  "nasdaqcm",
  "nasdaqgm",
  "ncm",
  "ngm",
  "nasdaq",
  "nasdaq global select market",
  "nasdaq capital market",
  "nasdaq global market",
  "nms",
  "nyq",
  "nyse",
  "nysearca",
  "new york stock exchange",
  "nyse american",
  "nyse arca",
  "amex",
  "american stock exchange",
  "ase",
  "pcx",
  "arcx",
  "bats",
  "bts",
  "bats global markets",
  "cboe",
  "cboe us",
  "cboe bzx",
  "cboe edgx",
]);

export function isUsEquityExchange(exchange: string): boolean {
  const normalized = exchange.trim().toLowerCase();
  return US_EQUITY_EXCHANGES.has(normalized);
}

/** Taiwan calendar day (UTC+8, no DST) — same as taiwanCalendarDay. */
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000;

function taiwanDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TAIWAN_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** The calendar day of `date` in America/New_York, as YYYY-MM-DD. */
function etDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** True if `when` falls before noon Eastern Time (i.e. a pre-market call). */
export function deriveSessionFromCallTime(callStart: Date): EarningsSession {
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(callStart),
  );
  return etHour < 12 ? "BMO" : "AMC";
}

export function mapEarningsTimestampToTaiwanDay(timestamp: Date): {
  date: string;
  session: EarningsSession;
} {
  // Date-only timestamps are stored as UTC midnight of the intended ET
  // announcement date. Conservative: no session known, no day shift.
  return {
    date: timestamp.toISOString().slice(0, 10),
    session: "UNKNOWN",
  };
}

export function mapEarningsCallToTaiwanDay(callStart: Date): {
  date: string;
  session: EarningsSession;
} {
  const session = deriveSessionFromCallTime(callStart);
  // Anchor to the call's ET calendar day, then shift a full day for AMC
  // (ET after-hours = Taiwan early next day).
  const etMidnight = new Date(`${etDateKey(callStart)}T00:00:00.000Z`);
  const shift = session === "AMC" ? DAY_MS : 0;
  const shifted = new Date(etMidnight.getTime() + shift);
  return { date: taiwanDateKey(shifted), session };
}
