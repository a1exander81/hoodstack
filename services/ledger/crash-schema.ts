import { z } from 'zod';
import { toMoney } from './money';

/**
 * Validated at the boundary before anything touches the ledger
 * (code-standards.md: validate all external input with zod).
 *
 * `crashRoundId` is not client-supplied in the sense that matters --
 * the round it names must already exist and be in BETTING status,
 * checked (and row-locked) inside placeCrashBet's transaction, not
 * assumed from this schema.
 */
export const placeCrashBetInputSchema = z.object({
  userId: z.string().min(1), // Privy DID (user.id) -- NOT a wallet address
  crashRoundId: z.string().min(1),
  wagerMicroUsd: z.coerce.bigint().positive().transform(toMoney),
});

export type PlaceCrashBetInput = z.input<typeof placeCrashBetInputSchema>;

/**
 * `crashMultiplierBps` and `cashoutMultiplierBps` are NOT client-supplied
 * -- the round engine (Milestone 3) is the only caller, passing the
 * crash point it privately holds from round start (not yet written to
 * CrashRound.crashMultiplierBps, which only reflects the REVEALED,
 * post-crash record -- see the schema comment) and a live-multiplier
 * value it derived server-side from elapsed time, never a client-echoed
 * number. `cashoutMultiplierBps: null` means "no cashout" -- the
 * round-end loss sweep calls this for every bet still PLACED.
 */
export const settleCrashBetInputSchema = z.object({
  userId: z.string().min(1),
  crashRoundId: z.string().min(1),
  crashMultiplierBps: z.number().int().min(10_000),
  cashoutMultiplierBps: z.number().int().min(10_000).nullable(),
});

export type SettleCrashBetInput = z.input<typeof settleCrashBetInputSchema>;
