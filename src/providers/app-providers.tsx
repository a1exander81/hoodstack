"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import type { ReactNode } from "react";
import { robinhoodChainTestnet, bscTestnet } from "@/lib/chains";

// Always import createConfig/WagmiProvider from @privy-io/wagmi, not from
// wagmi directly — it's a drop-in replacement that keeps Privy's connector
// state and wagmi's in sync.
const wagmiConfig = createConfig({
  chains: [robinhoodChainTestnet, bscTestnet],
  transports: {
    [robinhoodChainTestnet.id]: http(),
    [bscTestnet.id]: http(),
  },
});

const privyConfig: PrivyClientConfig = {
  // No "wallet" here on purpose — email/Google/SMS only, so every new
  // player gets an embedded wallet with no seed phrase in the primary flow.
  // The MetaMask fallback path (project-overview.md) is added separately.
  loginMethods: ["email", "google", "sms"],
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
  },
  defaultChain: robinhoodChainTestnet,
  supportedChains: [robinhoodChainTestnet, bscTestnet],
  appearance: {
    theme: "dark",
    accentColor: "#22C55E",
    showWalletLoginFirst: false,
  },
};

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is not set — copy .env.example to .env.local and add your Privy app ID."
    );
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
