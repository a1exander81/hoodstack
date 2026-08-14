// Public API only. Raw Prisma access and, critically, the server seed
// of any ACTIVE pair are never exported from this module — a caller
// that could read an unrevealed seed could compute every future
// outcome under it before betting (architecture.md invariant 2).
//
// reserveRound() returns a derived float, not the material to derive
// one. The seed leaves this module only through rotateSeedPair(),
// which reveals it and closes the pair in the same transaction.

export { getActiveCommitment, setClientSeed, rotateSeedPair } from './seed-pair';
export type { SeedCommitment, RevealedPair } from './seed-pair';

export { reserveRound } from './reserve-round';
export type { ReservedRound } from './reserve-round';

// Exported for player-facing verification tooling and tests — these are
// pure functions over already-revealed material, safe to expose.
export { deriveFloat, hashServerSeed, verifyCommitment } from './commit-reveal';
