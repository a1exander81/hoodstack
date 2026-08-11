// Dev-only harness to drive a real signed deposit through the browser and
// prove /verify -> /settle end to end. Not part of the player-facing product
// surface -- delete or gate behind an env check before anything resembling
// a real launch.
//
// USDG on Robinhood Chain Testnet only, for now: the EIP-3009 path needs
// nothing beyond `address` + `signTypedData` on the signer below. BSC's
// MockUSDT goes through Permit2's ERC-20 approval gas sponsorship
// extension, which needs `signTransaction` / `getTransactionCount` /
// `estimateFeesPerGas` on the signer too (see ClientEvmSigner in
// @x402/evm) -- add those before testing the BSC path.
"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Account, WalletClient } from "viem";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";

function wagmiToClientSigner(walletClient: WalletClient): ClientEvmSigner {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }
  return {
    address: walletClient.account.address,
    signTypedData: async (message) => {
      return walletClient.signTypedData({
        account: walletClient.account as Account,
        domain: message.domain,
        types: message.types as Record<string, { name: string; type: string }[]>,
        primaryType: message.primaryType,
        message: message.message,
      });
    },
  };
}

export default function X402DepositTestPage() {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("1.0");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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
      const signer = wagmiToClientSigner(walletClient);
      const client = new x402Client();
      registerExactEvmScheme(client, { signer });
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      appendLog(`Wallet: ${signer.address}`);
      appendLog(`Connected chain: ${chain?.name ?? "unknown"} (${chain?.id ?? "-"})`);
      appendLog(`Requesting deposit of ${amount}...`);

      const response = await fetchWithPayment("/api/x402/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      <div style={{ marginTop: 12 }}>
        <button onClick={runDeposit} disabled={busy || !walletClient}>
          {busy ? "Running..." : "Run test deposit"}
        </button>
      </div>
      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
    </div>
  );
}
