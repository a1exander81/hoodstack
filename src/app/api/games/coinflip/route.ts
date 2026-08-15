// One coinflip round: reserve a nonce, settle it, return the outcome.
//
// Order matters and is deliberate:
//   1. Identity from the Privy access token -- NEVER from the request body.
//      A DID in the body would let any caller wager another player's balance.
//   2. Confirm the client is betting against the commitment it was shown.
//      getActiveCommitment() would happily create a pair here, which would
//      mean the round and the commitment came into existence together --
//      invariant 2 requires the hash to be published BEFORE the bet.
//   3. reserveRound() claims the nonce atomically and derives the float.
//   4. settleInstantRound() takes the balance check, both ledger rows and
//      the GameRound row in one transaction under an advisory lock.
//
// A round that fails at step 4 leaves a GAP in the nonce sequence. That is
// harmless by design (see services/rng/reserve-round.ts): a skipped nonce is
// still derivable from the revealed seed, so a player can confirm nothing was
// hidden. Reuse would not be recoverable; a gap is.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveCommitment, reserveRound } from "@services/rng";
import { settleInstantRound, InsufficientBalanceError } from "@services/ledger";
import { resolveAuthenticatedDid } from "@services/settlement";

const betSchema = z.object({
  // Decimal string in integer micro-USD, because bigint has no JSON form.
  wagerMicroUsd: z.string().regex(/^[1-9]\d*$/, "must be a positive integer string"),
  side: z.enum(["HEADS", "TAILS"]),
  // The commitment the player was actually shown. Proves they saw it.
  serverSeedHash: z.string().regex(/^[a-f0-9]{64}$/, "must be a sha-256 hex digest"),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await resolveAuthenticatedDid(request.headers.get("authorization"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bet: z.infer<typeof betSchema>;
  try {
    bet = betSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid bet", detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const active = await getActiveCommitment(userId);
    if (active.serverSeedHash !== bet.serverSeedHash) {
      // Either the pair rotated mid-session, or this is the first request
      // this player has ever made and the commitment was never published.
      // Both mean the client should re-read GET /api/games/session first.
      return NextResponse.json(
        {
          error: "Stale seed commitment",
          commitment: {
            serverSeedHash: active.serverSeedHash,
            clientSeed: active.clientSeed,
            nonce: active.nonce,
          },
        },
        { status: 409 },
      );
    }

    const round = await reserveRound(userId);

    const settled = await settleInstantRound({
      userId,
      game: "COINFLIP",
      side: bet.side,
      wagerMicroUsd: BigInt(bet.wagerMicroUsd),
      seedPairId: round.seedPairId,
      nonce: round.nonce,
      float: round.float,
    });

    const outcome = settled.outcome as { side: string; result: string; won: boolean };

    return NextResponse.json({
      gameRoundId: settled.gameRoundId,
      side: outcome.side,
      result: outcome.result,
      won: outcome.won,
      wagerMicroUsd: bet.wagerMicroUsd,
      payoutMicroUsd: settled.payoutMicroUsd.toString(),
      balanceMicroUsd: settled.balanceMicroUsd.toString(),
      // Returned so the player can verify this exact round later against the
      // seed revealed at rotation.
      serverSeedHash: round.serverSeedHash,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json(
        {
          error: "Insufficient table balance",
          balanceMicroUsd: error.balanceMicroUsd.toString(),
        },
        { status: 402 },
      );
    }
    console.error("[games/coinflip] round failed:", error);
    return NextResponse.json({ error: "Round failed" }, { status: 500 });
  }
}
