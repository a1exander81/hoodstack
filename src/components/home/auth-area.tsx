"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";

// Dynamically imported (ssr:false): wagmi's balance/chain-switch code has
// no reason to be part of the bundle every visitor downloads just to see
// a login button -- it's only needed once someone is actually signed in.
const WalletDetails = dynamic(
  () => import("./wallet-details").then((mod) => mod.WalletDetails),
  { ssr: false, loading: () => <p className="mt-2 text-text-muted">Loading…</p> },
);

/**
 * The only part of the homepage that depends on Privy. Split out of
 * page.tsx (now a Server Component) so the static hero renders instantly
 * from the server, with just this small client island hydrating in
 * afterward -- previously the entire page, hero included, was gated
 * behind Privy's `ready` flag and rendered nothing but "Loading…" until
 * the full wallet SDK bundle had downloaded and initialized.
 */
export function AuthArea() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    // Same footprint as the real button below, so nothing shifts once
    // Privy finishes initializing.
    return (
      <div
        aria-hidden
        className="h-[60px] w-56 animate-pulse rounded-xl bg-bg-surface"
      />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="rounded-xl bg-accent-primary px-8 py-4 text-base font-semibold tracking-wide text-bg-base transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
      >
        Enter Hoodstack
      </button>
    );
  }

  return (
    <div className="relative w-full max-w-md space-y-3 rounded-xl border border-border-default bg-bg-surface/90 p-6 text-sm backdrop-blur">
      <p>
        Signed in as{" "}
        <span className="text-text-muted">{user?.email?.address ?? user?.id}</span>
      </p>

      <Link
        href="/games/coinflip"
        prefetch={false}
        className="mt-2 block rounded-md border border-border-default px-3 py-2 text-center text-xs transition hover:border-accent-primary hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        Play Coinflip
      </Link>

      {/*
        ui-context.md's Wallet Drawer pattern: blockchain details
        (address, chain, tx hash) are exposed only behind an "Advanced"
        toggle.
      */}
      <details className="pt-2 text-xs text-text-muted">
        <summary className="cursor-pointer select-none">Advanced</summary>
        <WalletDetails />
      </details>

      <button onClick={logout} className="pt-2 text-xs text-text-muted underline">
        Log out
      </button>
    </div>
  );
}
