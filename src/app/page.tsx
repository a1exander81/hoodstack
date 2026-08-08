"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { robinhoodChainTestnet, bscTestnet } from "@/lib/chains";

// This page only exists to verify the wallet skeleton end to end. It is not
// the lobby — see project-overview.md for the real landing/lobby scope.
export default function Home() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, chainId });

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-text-muted">
        Loading…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Chipstack — wallet check</h1>

      {!authenticated ? (
        <button
          onClick={login}
          className="rounded-xl bg-accent-primary px-6 py-3 font-medium text-bg-base"
        >
          Sign up / log in
        </button>
      ) : (
        <div className="w-full max-w-md space-y-3 rounded-xl border border-border-default bg-bg-surface p-6 text-sm">
          <p>
            Signed in as{" "}
            <span className="text-text-muted">
              {user?.email?.address ?? user?.id}
            </span>
          </p>
          <p>
            Embedded wallet:{" "}
            <span className="font-mono text-xs text-text-muted">
              {address ?? "provisioning…"}
            </span>
          </p>
          <p>
            Network:{" "}
            <span className="text-text-muted">
              {chainId === robinhoodChainTestnet.id
                ? "Robinhood Chain Testnet"
                : chainId === bscTestnet.id
                ? "BSC Testnet"
                : chainId ?? "—"}
            </span>
          </p>
          <p>
            Balance:{" "}
            <span className="text-text-muted">
              {balance ? `${balance.formatted} ${balance.symbol}` : "—"}
            </span>
          </p>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => switchChain({ chainId: robinhoodChainTestnet.id })}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs"
            >
              Robinhood Chain
            </button>
            <button
              onClick={() => switchChain({ chainId: bscTestnet.id })}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs"
            >
              BSC Testnet
            </button>
          </div>

          <button onClick={logout} className="pt-2 text-xs text-text-muted underline">
            Log out
          </button>
        </div>
      )}
    </main>
  );
}
