"use client";

import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { robinhoodChainTestnet, bscTestnet } from "@/lib/chains";

// Split out of auth-area.tsx so wagmi's balance/chain-switch code is only
// ever fetched once a signed-in visitor actually expands "Advanced" --
// not part of every visitor's initial bundle just to render a login button.
export function WalletDetails() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, chainId });

  return (
    <div className="mt-2 space-y-2">
      <p>
        Wallet:{" "}
        <span className="font-mono text-xs">{address ?? "provisioning…"}</span>
      </p>
      <p>
        Network:{" "}
        <span>
          {chainId === robinhoodChainTestnet.id
            ? "Robinhood Chain Testnet"
            : chainId === bscTestnet.id
              ? "BSC Testnet"
              : (chainId ?? "—")}
        </span>
      </p>
      <p>
        Balance: <span>{balance ? `${balance.formatted} ${balance.symbol}` : "—"}</span>
      </p>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => switchChain({ chainId: robinhoodChainTestnet.id })}
          className="rounded-md border border-border-default px-3 py-1.5"
        >
          Robinhood Chain
        </button>
        <button
          onClick={() => switchChain({ chainId: bscTestnet.id })}
          className="rounded-md border border-border-default px-3 py-1.5"
        >
          BSC Testnet
        </button>
      </div>
    </div>
  );
}
