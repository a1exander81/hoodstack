import { z } from 'zod';

/**
 * Client seeds are player-controlled input and reach a cryptographic
 * message, so they are validated at the boundary before touching
 * anything (code-standards.md: validate all external input with zod).
 *
 * The `:` exclusion is load-bearing, not cosmetic -- see
 * commit-reveal.ts's isValidClientSeed for why.
 */
export const clientSeedSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\x21-\x7e]+$/, 'must be printable ASCII with no spaces')
  .refine((value) => !value.includes(':'), {
    message: 'client seed may not contain ":"',
  });

export const userIdSchema = z.string().min(1); // Privy DID (user.id)

export type ClientSeed = z.infer<typeof clientSeedSchema>;
