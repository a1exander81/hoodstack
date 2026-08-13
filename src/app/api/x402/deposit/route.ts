// 402 challenge/response + verify/settle endpoint for moving a user's wallet
// funds into their Hoodstack table balance. See x402-payment-architecture.md.
//
// The route handler itself only gates on identity -- it runs BEFORE the
// real on-chain settlement (see x402-next-adapter.ts's handleSettlement),
// so returning a 4xx here cancels settlement before any transaction is
// submitted. The actual ledger credit happens in reconcileSettledDeposit,
// registered below as resourceServer.onAfterSettle(...) -- that's the only
// point where the SDK exposes the confirmed on-chain tx hash. See
// services/settlement/reconcile-deposit.ts for why.
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
import { reconcileSettledDeposit, resolveAuthenticatedDid } from "@services/settlement";

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
  .register(BSC_TESTNET_NETWORK, new ExactEvmScheme())
  .onAfterSettle(reconcileSettledDeposit);

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
      // MockUSDT has neither EIP-3009 nor EIP-2612 (confirmed on-chain,
      // see progress-tracker.md), so this MUST go through Permit2, not
      // the client SDK's default EIP-3009 path. Without this,
      // ExactEvmScheme.createPaymentPayload defaults
      // `assetTransferMethod` to "eip3009" (paymentRequirements.extra?.assetTransferMethod
      // ?? "eip3009", see @x402/evm's compiled exact/client source) and
      // tries to build an EIP-712 domain this asset doesn't have,
      // throwing "EIP-712 domain parameters (name, version) are
      // required" -- root-caused empirically against a real BSC
      // deposit attempt, not assumed from docs.
      extra: { assetTransferMethod: "permit2" },
    },
  ],
  // Declared once for the whole route -- RouteConfig.extensions is not
  // per-network-entry, so this also applies to the Robinhood/USDG accept
  // option above. Expected to be harmless there (USDG signs via EIP-3009
  // directly and shouldn't enter the Permit2-approval-signing path this
  // gates), but that's not independently confirmed -- watch for it in
  // testing. Value is unused beyond truthiness by the client SDK
  // (trySignErc20ApprovalExtension only checks
  // context?.extensions?.[key] for existence) -- see erc20ApprovalGasSponsoring
  // in @x402/evm's compiled source (src/shared/extensions/gasSponsoring.ts).
  // MUST be an object, not a bare boolean. validateExtensions (in
  // @x402/core's server module) compares this advertised value against
  // whatever the client echoes back in paymentPayload.extensions --
  // getExtensionInfo(true) stays the raw boolean `true`, and
  // objectContainsSubset(true, {...signed approval info...}) hits its
  // non-object branch and does a raw deepEqual(true, {...}), which can
  // never pass. An empty object takes the object-comparison branch
  // instead, where Object.entries({}).every(...) is vacuously true
  // regardless of what the client echoes. Root-caused empirically: the
  // first payload that ever built successfully (burner signer, after the
  // readContract / BSC assetTransferMethod / network-scoping fixes) was
  // rejected locally by this check as extension_echo_mismatch -- silently,
  // before /verify, with an empty-body 402 and no server-side log. The
  // replaced comment ("unused beyond truthiness by the client SDK") was
  // right about the CLIENT's decision to attempt the extension, but the
  // SERVER's echo-validation cares about shape, not truthiness.
  extensions: { erc20ApprovalGasSponsoring: {} },
};

export const POST = withX402(
  async function handleVerifiedDeposit(request: NextRequest) {
    // Runs BEFORE settlement -- see x402-next-adapter.ts's handleSettlement.
    // A >=400 response here cancels settlement before any on-chain
    // transaction is submitted, so an unauthenticated caller never has
    // funds moved with no way to credit them.
    try {
      await resolveAuthenticatedDid(request.headers.get("authorization"));
    } catch (error) {
      console.warn("[deposit] rejecting unauthenticated settlement attempt:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The actual ledger credit happens in reconcileSettledDeposit
    // (resourceServer.onAfterSettle, registered above) -- that's the only
    // point with the confirmed on-chain tx hash. This response just needs
    // to succeed (status < 400) so settlement proceeds.
    return NextResponse.json({ status: "settling" });
  },
  routeConfig,
  resourceServer,
);
