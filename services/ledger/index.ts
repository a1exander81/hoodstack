// Public API only. No raw Prisma access is exported from this module —
// every balance mutation must go through creditDeposit
// (architecture.md invariant 1: "No route mutates a user's table
// balance except through services/ledger").
export { creditDeposit } from './credit-deposit';
export type { CreditDepositResult } from './credit-deposit';
export { getTableBalanceMicroUsd } from './get-balance';
export type { CreditDepositInput } from './schema';
export type { Money } from './money';
export { settleInstantRound, InsufficientBalanceError } from './settle-round';
export type { SettleRoundResult } from './settle-round';
export type { SettleRoundInput } from './round-schema';

export { placeCrashBet, settleCrashBet, RoundNotOpenForBettingError } from './settle-crash-bet';
export type { PlaceCrashBetResult, SettleCrashBetResult } from './settle-crash-bet';
export type { PlaceCrashBetInput, SettleCrashBetInput } from './crash-schema';
