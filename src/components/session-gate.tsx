"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Client-side gate for the (app) route group.
 *
 * This is a UX gate, NOT a security boundary. Privy's hooks are
 * client-only, so this cannot run on the server, and anything it
 * "protects" is still reachable by a determined client. Real
 * enforcement lives server-side in the route handlers -- see
 * services/settlement's verifyAccessToken check on the deposit route,
 * which is the pattern any balance-affecting endpoint must follow.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-muted">Loading&hellip;</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-muted">Redirecting&hellip;</p>
      </div>
    );
  }

  return <>{children}</>;
}
