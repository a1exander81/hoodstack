// Asset + network config for the x402 deposit rail. Values verified
// directly against each testnet's RPC (eth_getCode) or official docs --
// never guessed. See progress-tracker.md Open Questions for the two
// values still pending.

export const ROBINHOOD_TESTNET_NETWORK = "eip155:46630" as const;
export const BSC_TESTNET_NETWORK = "eip155:97" as const;

// Verified live via eth_getCode against both testnets this session --
// chain-id constants baked into the bytecode (0xB626=46630, 0x61=97)
// confirm real per-chain deployment, not a coincidental empty match.
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// PENDING: not in Robinhood's official testnet contracts table (only WETH
// is listed). Get from https://faucet.paxos.com/?network=robinhood after
// connecting a wallet, then set in .env.local.
const USDG_ROBINHOOD_TESTNET_ADDRESS = process.env.USDG_ROBINHOOD_TESTNET_ADDRESS;

// PENDING: no canonical USDT exists on BSC testnet. Decision needed --
// deploy our own mock USDT test token -- then set in .env.local.
const USDT_BSC_TESTNET_ADDRESS = process.env.USDT_BSC_TESTNET_ADDRESS;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. See src/lib/x402-assets.ts for how to source it -- do not hardcode a guessed address.`
    );
  }
  return value;
}

export function getUsdgAddress(): string {
  return requireEnv("USDG_ROBINHOOD_TESTNET_ADDRESS", USDG_ROBINHOOD_TESTNET_ADDRESS);
}

export function getUsdtBscAddress(): string {
  return requireEnv("USDT_BSC_TESTNET_ADDRESS", USDT_BSC_TESTNET_ADDRESS);
}