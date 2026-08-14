import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Pure commit/reveal primitives. No database, no app state -- this is
 * the exact computation a player (or a third-party verifier we did not
 * write) must be able to reproduce from a revealed seed.
 *
 * Any change here silently invalidates every previously settled round,
 * because past rounds can no longer be re-derived. Treat this file as
 * append-only once a real round has settled.
 */

/** Delimiter between client seed and nonce in the HMAC message. */
const DELIMITER = ':';

/**
 * A client seed may not contain the delimiter.
 *
 * Otherwise a player-chosen seed of `abc:1` at nonce 2 produces the
 * same HMAC message as seed `abc` at nonce `1:2` -- two distinct rounds
 * with identical derivations. Enforced again at the schema boundary;
 * duplicated here so the primitive is safe on its own.
 */
export function isValidClientSeed(clientSeed: string): boolean {
  return (
    clientSeed.length >= 1 &&
    clientSeed.length <= 64 &&
    !clientSeed.includes(DELIMITER) &&
    /^[\x21-\x7e]+$/.test(clientSeed)
  );
}

/** 32 bytes of CSPRNG entropy, hex-encoded. */
export function generateServerSeed(): string {
  return randomBytes(32).toString('hex');
}

/** Default client seed for a fresh pair, until the player sets their own. */
export function generateClientSeed(): string {
  return randomBytes(8).toString('hex');
}

/**
 * The commitment published before any bet. SHA-256 over the seed's hex
 * STRING (not its bytes) -- this is what public verifiers expect, and
 * changing it would make our rounds uncheckable with existing tools.
 */
export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed, 'utf8').digest('hex');
}

/**
 * Derives a uniform float in [0, 1) from a round's three inputs.
 *
 * HMAC-SHA256 keyed by the server seed over `clientSeed:nonce`; the
 * first 4 bytes of the digest read as a big-endian uint32, divided by
 * 2^32. Uniform to within the 2^-32 granularity, which is far below
 * any bet resolution this product has.
 */
export function deriveFloat(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number {
  if (!Number.isInteger(nonce) || nonce < 0) {
    throw new Error(`nonce must be a non-negative integer, got ${nonce}`);
  }
  if (!isValidClientSeed(clientSeed)) {
    throw new Error('client seed failed validation at derivation time');
  }

  const message = `${clientSeed}${DELIMITER}${nonce}`;
  const digest = createHmac('sha256', serverSeed).update(message, 'utf8').digest('hex');
  return parseInt(digest.slice(0, 8), 16) / 0x1_0000_0000;
}

/**
 * Confirms a revealed seed matches the commitment published before the
 * round. This is the check a player performs after rotation; exported
 * so our own tests and any support tooling use the same code path they
 * do rather than a reimplementation that could diverge.
 */
export function verifyCommitment(serverSeed: string, serverSeedHash: string): boolean {
  return hashServerSeed(serverSeed) === serverSeedHash;
}
