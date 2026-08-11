// 402 challenge/response + verify/settle endpoint for moving a user's wallet
// funds into their Hoodstack table balance. See x402-payment-architecture.md.
//
// This proves /verify -> /settle against the facilitator for a real signed
// payment. It deliberately does NOT touch services/ledger -- crediting the
// user's table balance is a separate, protected, reviewed increment per
// ai-workflow-rules.md. Once settlement is confirmed here, the next
// increment wires the confirmed tx hash into services/ledger.
//
// Network is NOT taken from the client's request body. Per
// project-overview.md ("chain choice is a backend/operator decision, not
// something a typical player picks"), both testnets are offered as
// alternatives in `accepts[]`; the client SDK picks whichever matches the
// network the connected wallet is actually signing on.

import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { HTTPAdapter, HTTPRequestContext, RouteConfig } from "@x402/core/server";
import type { AssetAmount } from "@x402/core/types";
import { withX402 } from "@/lib/x402-next-adapter";
import {
  ROBINHOOD_TESTNET_NETWORK,
  BSC_TESTNET_NETWORK,
  getUsdgAddress,
  getUsdtBscAddress,
} from "@/lib/x402-assets";

const FACILITATOR_URL = process.env.FACILITATOR_URL;
if (!FACILITATOR_URL) {
  throw new Error(
    "FACILITATOR_URL is not set -- point this at our self-hosted facilitator, never x402.org (Base Sepolia/Solana devnet only).",
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

// Both assets are 6 decimals: USDG verified on-chain against the deployed
// testnet contract (`decimals()` call, not assumed), MockUSDT deployed with
// 6 decimals deliberately (see progress-tracker.md). If either asset ever
// changes, this must be re-verified on-chain, not edited from memory.
const ASSET_DECIMALS = 6;

// A DynamicPrice function is evaluated once per PaymentOption when building
// the 402 challenge, and again on the signed retry. Both `accepts[]` entries
// below share the same request, so getBody() -- which reads the body stream
// exactly once -- must be memoized per-request or the second option always
// fails. Keyed on `adapter` identity, which is fresh per request.
const bodyCache = new WeakMap<HTTPAdapter, Promise<unknown>>();
function getParsedBody(context: HTTPRequestContext): Promise<unknown> {
  let cached = bodyCache.get(context.adapter);
  if (!cached) {
    cached = Promise.resolve(context.adapter.getBody?.());
    bodyCache.set(context.adapter, cached);
  }
  return cached;
}

function priceForAsset(getAssetAddress: () => string) {
  return async (context: HTTPRequestContext): Promise<AssetAmount> => {
    const body = (await getParsedBody(context)) as { amount?: unknown } | undefined;
    const amount = body?.amount;
    if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount)) {
      throw new Error("amount must be a decimal string");
    }
    return {
      asset: getAssetAddress(),
      amount: parseUnits(amount, ASSET_DECIMALS).toString(),
    };
  };
}

const routeConfig: RouteConfig = {
  description: "Move wallet funds into a Hoodstack table balance",
  mimeType: "application/json",
  accepts: [
    {
      scheme: "exact",
      network: ROBINHOOD_TESTNET_NETWORK,
      payTo: HOUSE_TREASURY_ADDRESS,
      price: priceForAsset(getUsdgAddress),
      maxTimeoutSeconds: 300,
      extra: { name: "Global Dollar", version: "1" },
    },
    {
      scheme: "exact",
      network: BSC_TESTNET_NETWORK,
      payTo: HOUSE_TREASURY_ADDRESS,
      price: priceForAsset(getUsdtBscAddress),
      maxTimeoutSeconds: 300,
    },
  ],
};

export const POST = withX402(
  async function handleVerifiedDeposit(_request: NextRequest) {
    // Reached only after the facilitator has verified the signed payment.
    // Settlement itself happens after this returns (see
    // src/lib/x402-next-adapter.ts's handleSettlement) -- this response
    // just needs to succeed (status < 400) so settlement proceeds.
    //
    // NEXT INCREMENT (deliberately not here): once settlement is confirmed,
    // hand the confirmed tx hash to services/settlement for ledger
    // reconciliation. Protected per ai-workflow-rules.md -- separate review.
    return NextResponse.json({ status: "settling" });
  },
  routeConfig,
  resourceServer,
);
