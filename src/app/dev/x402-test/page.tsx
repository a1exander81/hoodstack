// Dev-only harness to drive a real signed deposit through the browser and
// prove /verify -> /settle end to end. Not part of the player-facing product
// surface -- delete or gate behind an env check before anything resembling
// a real launch.
//
// USDG on Robinhood Chain Testnet: the EIP-3009 path needs nothing beyond
// `address` + `signTypedData` on the signer below.
//
// BSC's MockUSDT goes through Permit2's ERC-20 approval gas sponsorship
// extension, which needs `signTransaction` / `getTransactionCount` /
// `estimateFeesPerGas` on the signer too (see ClientEvmSigner in
// @x402/evm) -- wired below. UNVERIFIED: on a wagmi-connected browser
// wallet, `signTransaction` falls through to `eth_signTransaction` (viem's
// real signTransaction action, confirmed by reading its source). MetaMask
// explicitly refuses to implement that RPC method
// (MetaMask/metamask-extension#3475, closed won't-fix). Rabby's support is
// NOT confirmed either way -- test empirically before trusting this path.
// If the BSC test throws "does not support eth_signTransaction", that's
// this limitation, not a bug in the wiring below -- the sponsorship path
// may need a different signer strategy entirely (e.g. a burner
// privateKeyToAccount for this dev page only, never a real player's
// wallet).
"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import type { Account, WalletClient } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { bscTestnet } from "@/lib/chains";

function wagmiToClientSigner(
  walletClient: WalletClient,
  publicClient: ReturnType<typeof usePublicClient>,
): ClientEvmSigner {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }
  const account = walletClient.account as Account;
  return {
    address: account.address,
    signTypedData: async (message) => {
      const diagnostic = `domainChainId=${message.domain?.chainId} walletClientChainId=${walletClient.chain?.id} primaryType=${message.primaryType}`;
      try {
        return await walletClient.signTypedData({
          account,
          domain: message.domain,
          types: message.types as Record<string, { name: string; type: string }[]>,
          primaryType: message.primaryType,
          message: message.message,
        });
      } catch (error) {
        throw new Error(
          `signTypedData failed [${diagnostic}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    // Needed for BSC/Permit2's ERC-20 approval gas sponsoring. See the
    // eth_signTransaction caveat in the file header -- this throws a clear
    // error instead of hanging if the connected wallet refuses the method.
    signTransaction: async (args) => {
      const transport = walletClient.transport as
        | { type?: string; url?: string; name?: string }
        | undefined;
      const transportDiagnostic =
        `transportType=${transport?.type} transportUrl=${transport?.url} ` +
        `transportName=${transport?.name}`;
      try {
        return await walletClient.signTransaction({ account, chain: walletClient.chain, ...args });
      } catch (error) {
        throw new Error(
          `signTransaction failed [${transportDiagnostic}]: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    getTransactionCount: publicClient
      ? async (args) => publicClient.getTransactionCount(args)
      : undefined,
    estimateFeesPerGas: publicClient
      ? async () => publicClient.estimateFeesPerGas()
      : undefined,
    // Without this, trySignErc20ApprovalExtension's very first check
    // (`if (!capabilities.readContract) return void 0;`, see @x402/evm's
    // compiled exact/client source) silently no-ops the entire approval
    // flow -- no error, no signTransaction attempt, the payload just goes
    // out with zero Permit2 allowance and the facilitator correctly
    // rejects it with 412/permit2_allowance_required. Root-caused
    // empirically: this was why signTransaction never fired on any BSC
    // attempt even after every other fix tonight.
    readContract: publicClient
      ? (args) => publicClient.readContract(args)
      : undefined,
  };
}

// Bypasses the connected wallet entirely for signing -- a local account
// signs fully offline in viem, so it sidesteps whatever Rabby is doing
// internally for eth_signTransaction on BSC Testnet (root-caused
// empirically: transportType=custom confirms the request DOES reach
// Rabby's injected provider, but Rabby's own response then references an
// unrelated external RPC URL and "unknown account" -- looks like an
// internal pre-flight simulation inside Rabby itself, not anything in
// this codebase). Dev-only, testnet-only, gated behind an env var that's
// never committed. Never use this pattern for a real player's funds --
// the whole point of this app's architecture is that the backend never
// holds private key material (see architecture.md's Auth and Access
// Model) and this intentionally breaks that for a throwaway dev key.
function burnerToClientSigner(
  publicClient: ReturnType<typeof usePublicClient>,
): ClientEvmSigner | undefined {
  const pk = process.env.NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY;
  if (!pk) return undefined;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const localClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(),
  });
  return {
    address: account.address,
    signTypedData: (message) =>
      localClient.signTypedData({
        account,
        domain: message.domain,
        types: message.types as Record<string, { name: string; type: string }[]>,
        primaryType: message.primaryType,
        message: message.message,
      }),
    signTransaction: (args) => localClient.signTransaction({ account, chain: bscTestnet, ...args }),
    getTransactionCount: publicClient
      ? async (args) => publicClient.getTransactionCount(args)
      : undefined,
    estimateFeesPerGas: publicClient
      ? async () => publicClient.estimateFeesPerGas()
      : undefined,
    readContract: publicClient
      ? (args) => publicClient.readContract(args)
      : undefined,
  };
}

export default function X402DepositTestPage() {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { getAccessToken } = usePrivy();
  const [amount, setAmount] = useState("1.0");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [useBurner, setUseBurner] = useState(false);

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function runDeposit() {
    if (!walletClient) {
      appendLog("No wallet connected.");
      return;
    }
    setBusy(true);
    setLog([]);
    try {
      // The deposit route now gates on identity BEFORE settlement (see
      // services/settlement/verify-session.ts) -- no Authorization header
      // means a 401 before any on-chain transaction is submitted.
      const accessToken = await getAccessToken();
      if (!accessToken) {
        appendLog("No Privy access token -- log in through the app first.");
        return;
      }

      const liveChainIdAtStart = await walletClient
        .request({ method: "eth_chainId" })
        .catch(() => "query-failed");
      appendLog(
        `Live wallet chainId at start: ${liveChainIdAtStart} (hooks report chain ${chain?.id})`,
      );

      const signer = useBurner
        ? burnerToClientSigner(publicClient)
        : wagmiToClientSigner(walletClient, publicClient);
      if (!signer) {
        appendLog(
          "Burner key not configured -- set NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY in .env.local.",
        );
        return;
      }
      const client = new x402Client();
      // Wildcard registration ("eip155:*", what registerExactEvmScheme
      // falls back to with no `networks` option) makes selectPaymentRequirements
      // accept every network in accepts[] and default to the first one --
      // ClientEvmSigner carries no chain identifier, so nothing here was ever
      // actually reading which chain the wallet is on. Root-caused empirically:
      // domainChainId=46630 kept appearing regardless of the wallet's real
      // chain. Scoping to the live connected chain is the documented fix.
      registerExactEvmScheme(client, {
        signer,
        networks: chain ? [`eip155:${chain.id}`] : undefined,
      });
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      appendLog(`Wallet: ${signer.address}`);
      appendLog(`Connected chain: ${chain?.name ?? "unknown"} (${chain?.id ?? "-"})`);
      appendLog(`Requesting deposit of ${amount}...`);

      const response = await fetchWithPayment("/api/x402/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ amount }),
      });

      appendLog(`Response status: ${response.status}`);
      const body = await response.json().catch(() => null);
      appendLog(`Response body: ${JSON.stringify(body, null, 2)}`);

      appendLog(
        response.ok
          ? "Deposit settled -- /verify -> /settle round-trip confirmed."
          : "Deposit did not settle. See body above.",
      );
    } catch (error) {
      appendLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 640 }}>
      <h1>x402 Deposit Test (dev only)</h1>
      <p>Connected address: {address ?? "not connected"}</p>
      <p>
        Connected chain: {chain?.name ?? "none"} ({chain?.id ?? "-"})
      </p>
      <label>
        Amount (decimal, e.g. 1.0):{" "}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div style={{ marginTop: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={useBurner}
            onChange={(e) => setUseBurner(e.target.checked)}
          />{" "}
          Use burner key for signing (bypasses connected wallet -- BSC only,
          dev-only, see NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY)
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={runDeposit} disabled={busy || !walletClient}>
          {busy ? "Running..." : "Run test deposit"}
        </button>
      </div>
      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
    </div>
  );
}
