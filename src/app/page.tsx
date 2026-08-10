"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { robinhoodChainTestnet, bscTestnet } from "@/lib/chains";
import { LoginBackground } from "@/components/login-background";

// This page only exists to verify the wallet skeleton end to end. It is not
// the lobby — see project-overview.md for the real landing/lobby scope.
export default function Home() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, chainId });

  if (!ready) {
    return (
      <main className="relative flex min-h-screen items-center justify-center">
        <LoginBackground />
        <p className="relative text-text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <LoginBackground />

      {!authenticated ? (
        <div className="relative flex flex-col items-center gap-7 text-center">
          <div className="space-y-3">
            <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
              Hoodstack
            </h1>
            <p className="text-sm tracking-[0.2em] text-text-muted uppercase">
              Play · Stake · Cash out
            </p>
          </div>

          <button
            onClick={login}
            className="rounded-xl bg-accent-primary px-8 py-4 text-base font-semibold tracking-wide text-bg-base transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
          >
            ENTER HOODSTACK — Your fortune awaits!
          </button>
        </div>
      ) : (
        <div className="relative w-full max-w-md space-y-3 rounded-xl border border-border-default bg-bg-surface/90 p-6 text-sm backdrop-blur">
          <p>
            Signed in as{" "}
            <span className="text-text-muted">
              {user?.email?.address ?? user?.id}
            </span>
          </p>
          <p>
            Wallet:{" "}
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
