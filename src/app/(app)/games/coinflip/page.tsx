import { CoinflipGame } from "@/components/games/coinflip/coinflip-game";

export const metadata = {
  title: "Coinflip | Hoodstack",
};

export default function CoinflipPage() {
  return (
    <main>
      <div
        role="status"
        className="border-b border-state-error/40 bg-state-error/10 px-4 py-2 text-center text-sm text-state-error"
      >
        Simulated round &middot; no seed commitment &middot; no balance movement
      </div>
      <CoinflipGame />
    </main>
  );
}
