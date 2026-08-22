// Pure game rules. No database, no network, no app state -- every export
// here is a deterministic function of (float, bet, wager).
//
// Deliberately separate from services/ledger: code-standards.md keeps a
// game's round logic and its ledger effects in different files. The ledger
// IMPORTS these to compute a payout authoritatively rather than trusting a
// caller-supplied figure, so the separation costs nothing in safety.

export { resolveCoinflip, isCoinSide, COINFLIP_PAYOUT_BPS } from './coinflip';
export type { CoinSide } from './coinflip';

export {
  deriveCrashPoint,
  resolveCrashBet,
  multiplierBpsAtElapsedMs,
  elapsedMsForMultiplierBps,
} from './crash';

export type { RoundResolution } from './types';
