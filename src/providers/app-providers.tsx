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
  // Two audiences, one modal:
  //   - normies: email / Google / SMS -> embedded wallet, no seed phrase
  //   - crypto-native: 'wallet' -> their own MetaMask etc.
  // Both land in the same wagmi hooks and the same services/ledger
  // address-ownership checks. See project-overview.md "bring your own
  // wallet" path.
  //
  // A login method must appear BOTH here and be toggled on in the Privy
  // dashboard. Dashboard = permitted, this array = displayed.
  loginMethods: ["email", "google", "sms", "twitter", "wallet"],
  embeddedWallets: {
    // 'users-without-wallets' means someone logging in with their own
    // MetaMask does NOT get a redundant embedded wallet created.
    createOnLogin: "users-without-wallets",
  },
  defaultChain: robinhoodChainTestnet,
  supportedChains: [robinhoodChainTestnet, bscTestnet],
  appearance: {
    theme: "dark",
    accentColor: "#22C55E",
    // false = web2 methods listed first, wallet below. Matches the
    // "Prioritize: Web2" choice in the dashboard. Wallet users are not
    // excluded, just not first.
    showWalletLoginFirst: false,
    walletList: [
      "metamask",
      "coinbase_wallet",
      "wallet_connect",
      "detected_ethereum_wallets",
    ],
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
