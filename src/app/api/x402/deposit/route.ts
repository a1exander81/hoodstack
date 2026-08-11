// 402 challenge/response endpoint for moving a user's wallet funds into
// their Hoodstack table balance. See x402-payment-architecture.md.
//
// This only builds and returns payment REQUIREMENTS -- it never decides
// a balance changed. That's services/ledger's job exclusively, invoked
// only after services/settlement independently confirms on-chain
// settlement (architecture.md Invariant #1).

import { NextRequest, NextResponse } from "next/server";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  ROBINHOOD_TESTNET_NETWORK,
  BSC_TESTNET_NETWORK,
  getUsdgAddress,
  getUsdtBscAddress,
} from "@/lib/x402-assets";

const FACILITATOR_URL = process.env.FACILITATOR_URL;
if (!FACILITATOR_URL) {
  throw new Error(
    "FACILITATOR_URL is not set -- point this at our self-hosted facilitator, never x402.org (Base Sepolia/Solana devnet only)."
  );
}

const HOUSE_TREASURY_ADDRESS = process.env.HOUSE_TREASURY_ADDRESS;
if (!HOUSE_TREASURY_ADDRESS) {
  throw new Error("HOUSE_TREASURY_ADDRESS is not set.");
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(ROBINHOOD_TESTNET_NETWORK, new ExactEvmScheme())
  .register(BSC_TESTNET_NETWORK, new ExactEvmScheme());

let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await resourceServer.initialize();
    initialized = true;
  }
}

// Body: { network: "robinhood-testnet" | "bsc-testnet", amount: string }
// amount is a decimal string, never a JS number, per code-standards.md.
export async function POST(request: NextRequest) {
  await ensureInitialized();

  const body = await request.json();
  const { network, amount } = body ?? {};

  if (network !== "robinhood-testnet" && network !== "bsc-testnet") {
    return NextResponse.json(
      { error: "network must be 'robinhood-testnet' or 'bsc-testnet'" },
      { status: 400 }
    );
  }
  if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount)) {
    return NextResponse.json({ error: "amount must be a decimal string" }, { status: 400 });
  }

  const requirements =
    network === "robinhood-testnet"
      ? { scheme: "exact" as const, network: ROBINHOOD_TESTNET_NETWORK, asset: getUsdgAddress(), payTo: HOUSE_TREASURY_ADDRESS, amount }
      : { scheme: "exact" as const, network: BSC_TESTNET_NETWORK, asset: getUsdtBscAddress(), payTo: HOUSE_TREASURY_ADDRESS, amount };

  // NEXT INCREMENT (deliberately not here): check the X-PAYMENT header for
  // an already-signed authorization, verify + settle via the facilitator,
  // then hand off to services/settlement. That path touches the
  // idempotency-key logic code-standards.md requires and abuts
  // services/ledger -- protected per ai-workflow-rules.md, gets its own
  // reviewed step rather than being folded in here.

  return NextResponse.json({ x402Version: 2, accepts: [requirements] }, { status: 402 });
}