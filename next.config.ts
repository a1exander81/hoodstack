import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // wagmi's connectors barrel export pulls in Coinbase's Base Account
    // connector, which pulls @coinbase/cdp-sdk, which dynamically imports
    // optional @x402/* peer deps (evm, svm, core) that aren't installed
    // AS FAR AS cdp-sdk KNOWS. We never use that connector, but webpack
    // still tries to resolve the dynamic imports at build time and fails.
    //
    // Scoped to cdp-sdk's own directory via contextRegExp so this does NOT
    // shadow our own @x402/core and @x402/evm imports in app/api/x402/* and
    // services/settlement/* — those are real top-level deps now, installed
    // for our own facilitator/deposit-endpoint work, unrelated to Coinbase's
    // CDP SDK. Revisit only if we adopt the Base Account connector.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\//,
        contextRegExp: /@coinbase[\\/]cdp-sdk/,
      })
    );
    // MetaMask's SDK optionally imports React Native storage. Warning only,
    // not fatal, but aliased off to keep the build output clean.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};
export default nextConfig;