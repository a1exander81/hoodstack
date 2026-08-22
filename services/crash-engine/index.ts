// Round-lifecycle orchestration: the only place that drives a
// CrashRound through BETTING -> RUNNING -> CRASHED and sweeps its
// unresolved bets. Coordinates services/rng (commitment), services/games
// (crash point + curve), and services/ledger (placeCrashBet/settleCrashBet)
// -- it owns none of their invariants itself, only the sequencing.

export { runCrashRound, RoundTransitionError } from './round-loop';
export type { RunCrashRoundOptions, RunningRoundHandle, CrashRoundSummary } from './round-loop';
