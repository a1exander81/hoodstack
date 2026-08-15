import { z } from 'zod';
import { toMoney } from './money';

/**
 * Validated at the boundary before anything touches the ledger
 * (code-standards.md: validate all external input with zod).
 *
 * `float` and `seedPairId`/`nonce` are NOT client-supplied -- the route
 * must take them from services/rng's reserveRound() in the same request.
 * Accepting them from a client would let a player pick their own outcome.
 */
export const settleRoundInputSchema = z.object({
  userId: z.string().min(1), // Privy DID (user.id) -- NOT a wallet address
  game: z.enum(['COINFLIP', 'CRASH', 'MINES', 'ROULETTE']),
  side: z.enum(['HEADS', 'TAILS']),
  wagerMicroUsd: z.coerce.bigint().positive().transform(toMoney),
  seedPairId: z.string().min(1),
  nonce: z.number().int().positive(),
  float: z.number().gte(0).lt(1),
  expectedPayoutMicroUsd: z.coerce.bigint().nonnegative().optional(),
});

export type SettleRoundInput = z.input<typeof settleRoundInputSchema>;
