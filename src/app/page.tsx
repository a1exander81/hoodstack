import { LoginBackground } from "@/components/login-background";
import { AuthArea } from "@/components/home/auth-area";

// This page only exists to verify the wallet skeleton end to end. It is not
// the lobby — see project-overview.md for the real landing/lobby scope.
//
// Server Component: the hero renders immediately from the server, with no
// dependency on the Privy/wagmi client bundle at all. Only <AuthArea/>
// (login button vs. signed-in card) needs wallet state, so it's the one
// small client island on this page instead of the whole page waiting on
// Privy's `ready` flag before rendering anything.
export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <LoginBackground />

      <div className="relative flex flex-col items-center gap-7 text-center">
        <div className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            Hoodstack
          </h1>
          <p className="text-sm text-text-muted">
            Fair games. Instant cash-out. Zero blockchain jargon.
          </p>
        </div>

        <AuthArea />
      </div>
    </main>
  );
}
