/**
 * Integer minor units. USDG and USDT here are both 6-decimal
 * stablecoins, so a Money value equals the raw on-chain token amount
 * 1:1 — no scaling between "chain units" and "ledger units".
 */
export type Money = bigint & { readonly __brand: unique symbol };

export function toMoney(raw: bigint): Money {
  return raw as Money;
}
