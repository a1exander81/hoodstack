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
// (MetaMask/metamask-extension#3475, closed won't-fix). Rabby was tested
// empirically and ALSO rejects it. This is not a Rabby quirk: other
// wallet implementers explicitly track eth_signTransaction as
// "MetaMask refuse to add, we should follow them," citing the same
// issue. Treat NO injected browser wallet as capable of this method.
// The only viable signers are ones that hold key material outside an
// injected provider: the dev burner below, or a Privy EMBEDDED wallet
// (whose signTransaction goes through Privy's own RPC, not the
// injected provider -- confirmed by reading @privy-io/react-auth's
// compiled source). Privy FORWARDS eth_signTransaction to the injected
// provider for externally-connected wallets, so it is no workaround
// for Rabby/MetaMask.
// If the BSC test throws "does not support eth_signTransaction", that's
// this limitation, not a bug in the wiring below -- the sponsorship path
// may need a different signer strategy entirely (e.g. a burner
// privateKeyToAccount for this dev page only, never a real player's
// wallet).
"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Account, WalletClient } from "viem";
import { createWalletClient, http, toHex } from "viem";
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

type PrivySignTransaction = ReturnType<typeof usePrivy>["signTransaction"];
type PrivySignTypedData = ReturnType<typeof usePrivy>["signTypedData"];
type SignerMode = "connected" | "burner" | "privy";

// Privy EMBEDDED wallet signer. Unlike the wagmi signer above, this never
// touches an injected provider -- Privy holds the key material and signs
// through its own RPC, which is why it can do eth_signTransaction at all.
// (Privy FORWARDS that method to the injected provider for externally
// connected wallets, so it is no workaround for Rabby/MetaMask.)
// Privy's on-device wallet proxy JSON-serializes everything it sends to
// its iframe, and JSON.stringify throws on BigInt. EIP-712 numeric values
// are valid as decimal strings, so convert recursively rather than
// field-by-field -- the Permit2 witness message carries bigints in
// permitted.amount, nonce, deadline and expiration, and a field-by-field
// pass already missed some of them once.
function stripBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stripBigInts);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        stripBigInts(v),
      ]),
    );
  }
  return value;
}

function privyToClientSigner(
  address: `0x${string}`,
  privySignTransaction: PrivySignTransaction,
  privySignTypedData: PrivySignTypedData,
  publicClient: ReturnType<typeof usePublicClient>,
): ClientEvmSigner {
  return {
    address,
    signTypedData: async (message) => {
      const { signature } = await privySignTypedData(
        {
          domain: stripBigInts(message.domain),
          types: message.types as Record<string, { name: string; type: string }[]>,
          primaryType: message.primaryType,
          message: stripBigInts(message.message),
        } as Parameters<PrivySignTypedData>[0],
        // Suppress Privy's confirmation modal for THIS call only, not
        // app-wide. `showWalletUIs` is unset in app-providers.tsx and
        // stays that way: every other embedded-wallet signature Privy
        // ever performs keeps its prompt. Verified in the installed
        // dts that this per-call option exists on usePrivy()'s own
        // signTypedData, and in dist/esm/solana.mjs that Privy relies
        // on the same per-call false internally with app config left
        // at its default.
        //
        // PREREQUISITE, not optional: this removes the only consent
        // surface the player sees. It is acceptable here because
        // /dev/x402-test is a dev harness with no player. Before this
        // reaches a real deposit UI, an app-level confirmation must
        // sit in front of it -- see Architecture Decisions in
        // progress-tracker.md.
        { address, uiOptions: { showWalletUIs: false } },
      );
      return signature as `0x${string}`;
    },
    // TRAP 1: @x402/evm hardcodes `gas` (70000, ERC20_APPROVE_GAS_LIMIT
    // -- read from the installed @x402/evm@2.21.0 compiled source, not
    // the 55,000 an earlier version of this comment claimed). Privy's
    // TEE path resolves `gas_limit: gasLimit ?? gas` AND
    // `gas_price: gasPrice ?? gas` -- confirmed verbatim in the
    // installed dist/esm/privy-provider-*.mjs -- so a leaked `gas`
    // would be submitted as a gas PRICE on that path.
    //
    // Both `gas` and `gasLimit` are sent below, deliberately. An
    // earlier version of this comment said to strip `gas`; the code
    // never did, and stripping it now would be a change to the only
    // configuration ever proven to settle a deposit. The on-device
    // path (the one this adapter actually takes -- proven by TRAP 3's
    // BigInt crash, which only that path can produce) forwards the
    // request object untouched and does neither resolution, so which
    // field it reads is unknown. Do not "clean this up" by guessing:
    // the decoded-transaction log in facilitator/index.ts's
    // sendTransactions answers it empirically in one run.
    //
    // The TEE-path hazard is real but not live today. It becomes live
    // if a unified wallet is used or Privy changes the default branch.
    // TRAP 2: the SDK uses this return value directly as a raw serialized
    // transaction, but Privy returns `{ signature }`. Unwrap it.
    signTransaction: async ({
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...rest
    }) => {
      // TRAP 3: Privy's on-device wallet proxy JSON-serializes this
      // request, and JSON.stringify throws on BigInt. @x402/evm hands
      // us bigints for gas and both fee fields, so hex-encode them at
      // this boundary. (The TEE path hex-encodes internally; the dev
      // burner signs locally in viem, which takes bigints natively --
      // which is why neither ever hit this.) nonce and chainId arrive
      // as JS numbers and serialize fine.
      const hex = (v: bigint | undefined) =>
        v === undefined ? undefined : toHex(v);
      // TRAP 4: the gas limit must NOT be pre-hex-encoded, even though
      // the fee fields must be. Privy re-encodes the gas-limit field
      // with viem's toHex, which on a STRING encodes its UTF-8 bytes
      // instead of passing it through: "0x11170" (70000, the SDK's
      // ERC20_APPROVE_GAS_LIMIT) became 0x30783131313730 =
      // 13642951556151088, so requiredWei came out at 1.36e24 against a
      // 3e15 cap. Confirmed by decoding the signed tx in the
      // facilitator's sendTransactions log -- the ASCII of the bad
      // value is literally the string we sent. The fee fields are
      // forwarded untouched, which is why maxFeePerGas was always
      // correct at 1e8 and only gas was poisoned. 70000 is far below
      // 2^53, so a JS number is exact and JSON-serializable.
      const num = (v: bigint | undefined) =>
        v === undefined ? undefined : Number(v);
      const { signature } = await privySignTransaction(
        {
          ...rest,
          gasLimit: num(gas),
          gas: num(gas),
          maxFeePerGas: hex(maxFeePerGas),
          maxPriorityFeePerGas: hex(maxPriorityFeePerGas),
        } as Parameters<PrivySignTransaction>[0],
        // Same per-call suppression as the witness signature above, and
        // the more important of the two: this is the approval prompt
        // the player never initiated. Privy's decoder renders it as
        // "would like your permission for <spender> to spend tokens on
        // your behalf" (see the Pv send-transaction screen in
        // dist/esm/privy-provider-*.mjs), which is accurate and
        // unreadable to a non-crypto player.
        { address, uiOptions: { showWalletUIs: false } },
      );
      return signature as `0x${string}`;
    },
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
  const {
    getAccessToken,
    signTransaction: privySignTransaction,
    signTypedData: privySignTypedData,
  } = usePrivy();
  // Privy's linked wallets, embedded and external together. The only
  // way to tell them apart is walletClientType === "privy" (the same
  // check Privy uses internally). createOnLogin is
  // "users-without-wallets", so a DID that linked an external wallet
  // first may have NO embedded wallet provisioned at all.
  const { wallets: privyWallets } = useWallets();
  const [amount, setAmount] = useState("1.0");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [signerMode, setSignerMode] = useState<SignerMode>("connected");

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

      let signer: ClientEvmSigner | undefined;
      // Scope x402 to the network the CHOSEN SIGNER can actually act on.
      // The burner and the embedded wallet are both BSC-only here; only
      // the connected-wallet path should follow wagmi's chain.
      let network: `${string}:${string}` | undefined;
      if (signerMode === "burner") {
        signer = burnerToClientSigner(publicClient);
        network = `eip155:${bscTestnet.id}`;
      } else if (signerMode === "privy") {
        const embedded = privyWallets.find(
          (w) => w.walletClientType === "privy",
        );
        if (!embedded) {
          appendLog(
            "No Privy embedded wallet on this DID -- createOnLogin is " +
              '"users-without-wallets", so a DID that linked an external ' +
              "wallet first may never have been provisioned one.",
          );
          return;
        }
        appendLog(`Using Privy embedded wallet: ${embedded.address}`);
        signer = privyToClientSigner(
          embedded.address as `0x${string}`,
          privySignTransaction,
          privySignTypedData,
          publicClient,
        );
        network = `eip155:${bscTestnet.id}`;
      } else {
        signer = wagmiToClientSigner(walletClient, publicClient);
        network = chain ? `eip155:${chain.id}` : undefined;
      }
      if (!signer) {
        appendLog(
          "No signer available. For burner mode, set \n"
            + "NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY in .env.local.",
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
        // Derive the network from the SIGNER, not the connected wallet.
        // The burner signs offline via privateKeyToAccount and is
        // BSC-only -- wagmi's `chain` describes the browser wallet,
        // which is unrelated to it. Passing `undefined` here registers
        // an "eip155:*" wildcard, which makes selectPaymentRequirements
        // take accepts[0] (always Robinhood/46630) regardless of intent.
        // That is the root cause of the 46630-vs-97 discrepancy: the
        // burner path was never scoped at all.
        networks: network ? [network] : undefined,
      });
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      appendLog(
        `Privy linked wallets: ${
          privyWallets.length === 0
            ? "(none)"
            : privyWallets
                .map((w) => `${w.walletClientType}/${w.connectorType} ${w.address}`)
                .join(" | ")
        }`,
      );
      appendLog(
        `Embedded (privy) wallet present: ${privyWallets.some(
          (w) => w.walletClientType === "privy",
        )}`,
      );
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

      // An empty-body 402 is NOT a silent failure. x402 v2 carries the
      // challenge -- including the invalidReason from
      // findMatchingRequirements / validateExtensions -- in the
      // PAYMENT-REQUIRED header. Decode it or the real cause stays
      // invisible and looks like a network problem.
      if (!response.ok) {
        // Dump everything -- guessing the header name cost a round-trip once
        // already. The real one turned out to be `payment-response`.
        appendLog(
          `All response headers:\n${[...response.headers.entries()]
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n")}`,
        );
        const challenge =
          response.headers.get("payment-response") ??
          response.headers.get("PAYMENT-REQUIRED") ??
          response.headers.get("payment-required");
        if (!challenge) {
          appendLog(
            `No PAYMENT-REQUIRED header. Headers seen: ${[
              ...response.headers.keys(),
            ].join(", ")}`,
          );
        } else {
          appendLog(`PAYMENT-REQUIRED (raw): ${challenge}`);
          try {
            const decoded = JSON.parse(atob(challenge));
            appendLog(
              `PAYMENT-REQUIRED (decoded): ${JSON.stringify(decoded, null, 2)}`,
            );
          } catch {
            try {
              appendLog(
                `PAYMENT-REQUIRED (as JSON): ${JSON.stringify(
                  JSON.parse(challenge),
                  null,
                  2,
                )}`,
              );
            } catch {
              appendLog("PAYMENT-REQUIRED is neither base64 nor JSON.");
            }
          }
        }
      }

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
            type="radio"
            name="signerMode"
            checked={signerMode === "connected"}
            onChange={() => setSignerMode("connected")}
          />{" "}
          Connected wallet (Robinhood/USDG works; BSC/Permit2 CANNOT --
          no injected wallet implements eth_signTransaction)
        </label>
        <br />
        <label>
          <input
            type="radio"
            name="signerMode"
            checked={signerMode === "burner"}
            onChange={() => setSignerMode("burner")}
          />{" "}
          Dev burner key (BSC only, dev-only, see
          NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY)
        </label>
        <br />
        <label>
          <input
            type="radio"
            name="signerMode"
            checked={signerMode === "privy"}
            onChange={() => setSignerMode("privy")}
          />{" "}
          Privy embedded wallet (BSC, real player-facing path)
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
