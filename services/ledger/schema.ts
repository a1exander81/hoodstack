import { z } from 'zod';
import { toMoney } from './money';

export const creditDepositInputSchema = z.object({
  userId: z.string().min(1), // Privy DID (user.id) — table balance ownership key, NOT a wallet address
  amountMicroUsd: z.coerce.bigint().positive().transform(toMoney),
  asset: z.enum(['USDG', 'USDT']),
  chainId: z.union([z.literal(46630), z.literal(97)]), // Robinhood Chain Testnet | BSC Testnet
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 32-byte on-chain tx hash'),
});

export type CreditDepositInput = z.input<typeof creditDepositInputSchema>;
