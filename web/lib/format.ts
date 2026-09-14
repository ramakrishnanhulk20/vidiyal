const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Every stamp on the desk is written in UTC by hand. A record read on one machine and a
 * page rendered on another must not disagree about what day a trade happened on, and
 * toLocaleString would make them disagree between the server and the browser.
 */
export function utcDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function utcClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function utcStamp(ts: number): string {
  return `${utcDay(ts)} ${utcClock(ts)} UTC`;
}

/** A gap in words, so a reader never has to subtract two stamps in their head. */
export function held(fromTs: number, toTs: number): string {
  const minutes = (toTs - fromTs) / 60_000;
  if (minutes < 1) return `${Math.round(minutes * 60)} seconds`;
  if (minutes < 90) return `${minutes.toFixed(1)} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function usdt(value: number, places = 4): string {
  return `${value.toFixed(places)} USDT`;
}

export function num(value: number, places = 2): string {
  return value.toFixed(places);
}

/** The words a null gets. A missing number is said out loud, never drawn as a zero. */
export function orMissing(value: number | null, write: (v: number) => string, missing: string): string {
  return value === null ? missing : write(value);
}

export function ticker(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}
