// Balance + the active seed commitment for the signed-in player.
//
// The commitment MUST reach the player before any bet is accepted
// (architecture.md invariant 2). This route is what publishes it:
// getActiveCommitment() creates the pair on first call and returns its
// SHA-256 hash, never the seed itself. POST /api/games/coinflip then
// requires the client to echo that hash back, so a round can never be the
// first thing that brings a pair into existence.

import { NextRequest, NextResponse } from "next/server";
import { getActiveCommitment } from "@services/rng";
import { getTableBalanceMicroUsd } from "@services/ledger";
import { resolveAuthenticatedDid } from "@services/settlement";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await resolveAuthenticatedDid(request.headers.get("authorization"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [balanceMicroUsd, commitment] = await Promise.all([
      getTableBalanceMicroUsd(userId),
      getActiveCommitment(userId),
    ]);

    return NextResponse.json({
      // bigint does not survive JSON.stringify -- every amount crosses as a
      // decimal string and is parsed back with BigInt() on the client.
      balanceMicroUsd: balanceMicroUsd.toString(),
      commitment: {
        serverSeedHash: commitment.serverSeedHash,
        clientSeed: commitment.clientSeed,
        nonce: commitment.nonce,
      },
    });
  } catch (error) {
    console.error("[games/session] failed:", error);
    return NextResponse.json({ error: "Could not load session" }, { status: 500 });
  }
}
