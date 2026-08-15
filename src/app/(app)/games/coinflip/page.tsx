import { CoinflipGame } from "@/components/games/coinflip/coinflip-game";

export const metadata = {
  title: "Coinflip | Hoodstack",
};

export default function CoinflipPage() {
  return (
    <main>
      <CoinflipGame />
    </main>
  );
}
