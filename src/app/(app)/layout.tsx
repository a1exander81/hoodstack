import type { ReactNode } from "react";
import { SessionGate } from "@/components/session-gate";

/**
 * Shell for every authenticated surface (games, lobby, wallet).
 * Server component -- the session check itself is delegated to a
 * client child because Privy's hooks cannot run on the server.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <SessionGate>{children}</SessionGate>
    </div>
  );
}
