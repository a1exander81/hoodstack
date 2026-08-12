import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { UptoEvmScheme } from "@x402/evm/upto/facilitator";
import dotenv from "dotenv";
import express from "express";
import { createWalletClient, defineChain, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { z } from "zod";

dotenv.config();

// ---------------------------------------------------------------------------
// Env validation — same "hard guard, no silent fallback" pattern as the
// x402 deposit route (src/app/api/x402/deposit/route.ts).
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "4022", 10);
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
if (!EVM_PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(EVM_PRIVATE_KEY)) {
  console.error(
    "EVM_PRIVATE_KEY is missing or malformed (expected 0x + 64 hex chars). " +
      "This must be a DEDICATED GAS WALLET key — never the house treasury key.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Chains
//
// bscTestnet ships in viem/chains. Robinhood Chain Testnet does not, so it's
// defined by hand here — chain ID 46630 / rpc.testnet.chain.robinhood.com,
// native currency ETH, per docs.robinhood.com (see progress-tracker.md).
//
// This app already has a hand-rolled definition in src/lib/chains.ts for the
// Next.js/wagmi side. This facilitator is a separate standalone Node process
// (own package.json, run via tsx, not part of the Next.js build), so it
// can't cleanly import across the `@/*` path alias — the definition below is
// duplicated on purpose. If src/lib/chains.ts's RPC URL, explorer, or native
// currency ever changes, mirror the change here too.
// ---------------------------------------------------------------------------

const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  testnet: true,
});

const account = privateKeyToAccount(EVM_PRIVATE_KEY as `0x${string}`);
console.info(`Facilitator gas wallet: ${account.address}`);

/**
 * Builds a FacilitatorEvmSigner bound to one chain's RPC. One signer per
 * chain because nonce/gas management is chain-specific even though the
 * underlying EOA address is the same on both networks.
 */
function buildSigner(chain: typeof bscTestnet | typeof robinhoodChainTestnet) {
  const client = createWalletClient({
    account,
    chain,
    transport: http(),
  }).extend(publicActions);

  return toFacilitatorEvmSigner({
    address: account.address,
    getCode: client.getCode,
    readContract: (args) => client.readContract({ ...args, args: args.args ?? [] } as never),
    // viem's verifyTypedData has overloads TS can't line up with the SDK's
    // generic signer shape — the SDK's own reference facilitator example
    // hits the same mismatch and casts it the same way.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verifyTypedData: (args) => client.verifyTypedData(args as any),
    writeContract: (args) => client.writeContract({ ...args, args: args.args ?? [] } as never),
    sendTransaction: client.sendTransaction,
    waitForTransactionReceipt: client.waitForTransactionReceipt,
  });
}

const robinhoodSigner = buildSigner(robinhoodChainTestnet);
const bscSigner = buildSigner(bscTestnet);

// ---------------------------------------------------------------------------
// Facilitator: exact (deposits) + upto (withdrawals) on both testnets.
// Smart-wallet deployment via ERC-6492 stays disabled (eip6492AllowedFactories: [])
// — Privy smart wallets are OFF for this project, everything signs as a plain EOA.
// ---------------------------------------------------------------------------

const facilitator = new x402Facilitator()
  .onBeforeVerify(async (ctx) => console.log("[verify:before]", ctx))
  .onAfterVerify(async (ctx) => console.log("[verify:after]", ctx))
  .onVerifyFailure(async (ctx) => console.warn("[verify:failure]", ctx))
  .onBeforeSettle(async (ctx) => console.log("[settle:before]", ctx))
  .onAfterSettle(async (ctx) => console.log("[settle:after]", ctx))
  .onSettleFailure(async (ctx) => console.error("[settle:failure]", ctx));

facilitator.register("eip155:46630", new ExactEvmScheme(robinhoodSigner, { eip6492AllowedFactories: [] }));
facilitator.register("eip155:46630", new UptoEvmScheme(robinhoodSigner));
facilitator.register("eip155:97", new ExactEvmScheme(bscSigner, { eip6492AllowedFactories: [] }));
facilitator.register("eip155:97", new UptoEvmScheme(bscSigner));

// ---------------------------------------------------------------------------
// HTTP surface: /verify, /settle, /supported — the exact shape
// HTTPFacilitatorClient (already used in the deposit route) expects.
// ---------------------------------------------------------------------------

const settleRequestSchema = z.object({
  paymentPayload: z.record(z.string(), z.unknown()),
  paymentRequirements: z.record(z.string(), z.unknown()),
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, signers: { evm: account.address } });
});

app.post("/verify", async (req, res) => {
  const parsed = settleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
  }

  try {
    const { paymentPayload, paymentRequirements } = parsed.data;
    const response: VerifyResponse = await facilitator.verify(
      paymentPayload as unknown as PaymentPayload,
      paymentRequirements as unknown as PaymentRequirements,
    );
    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  const parsed = settleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
  }

  try {
    const { paymentPayload, paymentRequirements } = parsed.data;
    const response: SettleResponse = await facilitator.settle(
      paymentPayload as unknown as PaymentPayload,
      paymentRequirements as unknown as PaymentRequirements,
    );
    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);
    if (error instanceof Error && error.message.includes("Settlement aborted:")) {
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.accepted?.network ?? "unknown",
      } as SettleResponse);
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", (_req, res) => {
  try {
    res.json(facilitator.getSupported());
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.listen(PORT, () => {
  console.log(`x402 facilitator listening on http://localhost:${PORT}`);
  console.log(`Registered networks: eip155:46630 (Robinhood Chain Testnet), eip155:97 (BSC Testnet)`);
});
