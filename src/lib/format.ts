/**
 * Display helpers for integer minor units.
 *
 * Amounts are micro-USD (1_000_000 = $1.00), matching the on-chain
 * 6-decimal stablecoins and services/ledger's own unit. Formatting is
 * display-only -- never round-trip a formatted string back into an
 * amount.
 */

export const MICRO_PER_USD = 1_000_000n;

export function formatMicroUsd(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / MICRO_PER_USD;
  const cents = (abs % MICRO_PER_USD) / 10_000n;
  const body = `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}$${body}`;
}

/**
 * Parses a user-typed dollar string into micro-USD. Returns null for
 * anything not a clean non-negative decimal with at most 2 places --
 * the caller decides what to do about it rather than getting a
 * silently coerced 0n.
 */
export function parseUsdToMicro(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d{0,2})?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const paddedFraction = fraction.padEnd(6, "0");
  return BigInt(whole || "0") * MICRO_PER_USD + BigInt(paddedFraction);
}
