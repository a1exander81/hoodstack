import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // wagmi's connectors barrel export pulls in Coinbase's Base Account
    // connector, which pulls @coinbase/cdp-sdk, which dynamically imports
    // optional @x402/* peer deps (evm, svm, core) that aren't installed.
    // We never use that connector, but webpack still tries to resolve the
    // dynamic imports at build time and fails. IgnorePlugin matches the
    // whole @x402/* scope rather than us listing paths one at a time.
    //
    // Unrelated to our own x402 work: the deposit/withdrawal rail in
    // x402-payment-architecture.md runs through our own facilitator, not
    // Coinbase's CDP SDK. Revisit only if we adopt the Base Account
    // connector.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })
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
