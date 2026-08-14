import { x402Facilitator } from "@x402/core/facilitator";
import type {
  FacilitatorExtension,
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
import {
  createWalletClient,
  defineChain,
  http,
  parseTransaction,
  publicActions,
  recoverTransactionAddress,
} from "viem";
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
// ERC-20 Approval Gas Sponsorship extension (BSC / MockUSDT deposit path).
//
// MockUSDT has neither EIP-3009 nor EIP-2612 (contracts/mock-usdt/src/Counter.sol
// — see progress-tracker.md), so its one-time Permit2 approval can't be
// sponsored via an EIP-2612 permit signature. @x402/evm's client SDK instead
// has the user *locally sign* (not broadcast) a raw approve(Permit2, maxUint256)
// transaction and hands it to us inside the payment payload's
// erc20ApprovalGasSponsoring extension. Broadcasting a pre-signed transaction
// doesn't make the broadcaster pay its gas -- gas is deducted from whoever
// signed it, baked into the signature. So before broadcasting, we top up the
// payer's own address with just enough native gas token from our gas wallet
// to cover that specific approval transaction. That top-up IS the
// "sponsorship"; everything else here is relaying already-signed data.
//
// Deliberately NOT a flat top-up amount: we decode the actual signed
// transaction (gas * maxFeePerGas) to know precisely what's owed, and only
// send the shortfall against the payer's current balance.
// ---------------------------------------------------------------------------

// Hard cap on what a single top-up will ever send, independent of what the
// decoded transaction claims to need. A malformed or malicious signed
// transaction must not be able to drain the gas wallet in one call -- see
// code-standards.md's "financial correctness beats convenience." Roughly
// 40x the SDK's own 70,000-gas approval estimate at 1 gwei (see
// ERC20_APPROVE_GAS_LIMIT / DEFAULT_MAX_FEE_PER_GAS in @x402/evm).
const MAX_GAS_TOPUP_WEI = 3_000_000_000_000_000n; // 0.003 native token

interface Erc20ApprovalSponsorSigner {
  sendTransactions(
    txs: readonly (`0x${string}` | { to: `0x${string}`; data: `0x${string}`; gas?: bigint })[],
  ): Promise<readonly `0x${string}`[]>;
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
}

function buildErc20ApprovalSponsorSigner(
  chain: typeof bscTestnet | typeof robinhoodChainTestnet,
): Erc20ApprovalSponsorSigner {
  const client = createWalletClient({ account, chain, transport: http() }).extend(publicActions);

  return {
    async sendTransactions(txs) {
      const [signedApprovalTx, settleTxRequest] = txs;
      if (typeof signedApprovalTx !== "string") {
        throw new Error("Expected first sponsored transaction to be a pre-signed raw transaction");
      }
      if (typeof settleTxRequest === "string") {
        throw new Error("Expected second sponsored transaction to be an unsigned settle request");
      }

      // Decode exactly what the pre-signed approval needs and who it's from --
      // never trust an externally supplied amount for a real fund transfer.
      const parsed = parseTransaction(signedApprovalTx);
      if (parsed.gas == null || parsed.maxFeePerGas == null) {
        throw new Error("Sponsored approval transaction is missing gas or maxFeePerGas");
      }
      const requiredWei = parsed.gas * parsed.maxFeePerGas;
      // Instrument the boundary before patching across it: print every
      // decoded field, not just the two we multiply, so a wrong value can
      // be located rather than guessed at from the resulting figure.
      console.log(
        "[erc20ApprovalGasSponsoring] decoded approval tx",
        JSON.stringify(parsed, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
      );
      console.log(
        `[erc20ApprovalGasSponsoring] gas=${parsed.gas} maxFeePerGas=${parsed.maxFeePerGas} requiredWei=${requiredWei} cap=${MAX_GAS_TOPUP_WEI}`,
      );
      if (requiredWei > MAX_GAS_TOPUP_WEI) {
        throw new Error(
          `Sponsored approval requires ${requiredWei} wei, exceeding the ${MAX_GAS_TOPUP_WEI} wei hard cap -- refusing to sponsor`,
        );
      }
      // Same generic-signer type mismatch as elsewhere in this file: viem
      // narrows serializedTransaction to a per-tx-type literal union it
      // can't infer from the SDK's plain `0x${string}`.
      const payer = await recoverTransactionAddress({
        serializedTransaction: signedApprovalTx,
      } as never);

      const payerBalance = await client.getBalance({ address: payer });
      if (payerBalance < requiredWei) {
        const topUpHash = await client.sendTransaction({
          to: payer,
          value: requiredWei - payerBalance,
        });
        const topUpReceipt = await client.waitForTransactionReceipt({ hash: topUpHash });
        if (topUpReceipt.status !== "success") {
          throw new Error(`Gas top-up transaction to payer ${payer} failed on-chain`);
        }
      }

      const approvalHash = await client.sendRawTransaction({
        serializedTransaction: signedApprovalTx,
      });
      const approvalReceipt = await client.waitForTransactionReceipt({ hash: approvalHash });
      if (approvalReceipt.status !== "success") {
        throw new Error(`Sponsored approval transaction ${approvalHash} failed on-chain`);
      }

      const settleHash = await client.sendTransaction({
        to: settleTxRequest.to,
        data: settleTxRequest.data,
        gas: settleTxRequest.gas,
      });

      return [approvalHash, settleHash];
    },
    waitForTransactionReceipt: client.waitForTransactionReceipt,
  };
}

interface Erc20ApprovalGasSponsoringExtension extends FacilitatorExtension {
  signerForNetwork(network: string): Erc20ApprovalSponsorSigner | undefined;
}

const robinhoodSponsorSigner = buildErc20ApprovalSponsorSigner(robinhoodChainTestnet);
const bscSponsorSigner = buildErc20ApprovalSponsorSigner(bscTestnet);

const erc20ApprovalGasSponsoringExtension: Erc20ApprovalGasSponsoringExtension = {
  key: "erc20ApprovalGasSponsoring",
  signerForNetwork(network) {
    if (network === "eip155:97") return bscSponsorSigner;
    if (network === "eip155:46630") return robinhoodSponsorSigner;
    return undefined;
  },
};


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

facilitator.registerExtension(erc20ApprovalGasSponsoringExtension);
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
