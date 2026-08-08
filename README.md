# Chipstack — wallet skeleton

This is "Next up #1" from `progress-tracker.md`: an embedded wallet (Privy)
wired to wagmi/viem, configured for Robinhood Chain Testnet and BSC Testnet.
It proves out sign-in → wallet creation → balance read before any game or
payment logic gets built on top. See `context/architecture.md` for how this
fits the rest of the stack.

**Provider decision made here:** Privy over Dynamic — `@privy-io/wagmi` is a
maintained drop-in for wagmi's `createConfig`, and `embeddedWallets.createOnLogin`
covers the "no seed phrase" requirement directly. Reflected in
`context/progress-tracker.md`.

## Local setup (Mac, VS Code)

1. `npm install`
2. Create a free Privy app at https://dashboard.privy.io, copy the App ID
3. `cp .env.example .env.local` and paste the App ID into `NEXT_PUBLIC_PRIVY_APP_ID`
4. In the Privy dashboard, under Login Methods → Embedded Wallets → Networks,
   add Robinhood Chain Testnet (chain ID `46630`, RPC
   `https://rpc.testnet.chain.robinhood.com`) and BSC Testnet (chain ID `97`)
   as custom networks so Privy provisions the wallet on both.
5. `npm run dev` — **don't add `--turbopack`**. `@privy-io/wagmi` has a known
   Turbopack build failure (`TypeError: s is not iterable`); use the default
   webpack dev server until that's fixed upstream.
6. Open localhost:3000, sign in with email, confirm a wallet address appears.
   Fund it from the testnet faucet at faucet.testnet.chain.robinhood.com and
   confirm the balance shows up on the page.

## Deploying to your VPS (root@156.67.221.224, Hostinger)

I can't reach this server myself — my sandbox only has network access to
package registries and GitHub, not arbitrary IPs, and I have no terminal on
your Mac either. Run the steps below yourself over SSH, or hand this repo
and this file to Claude Code (terminal or the VS Code extension) — that runs
locally on your machine with real shell access and can drive the SSH session
for you.

1. **Don't run the app as root.** Create a deploy user first:
   ```bash
   ssh root@156.67.221.224
   adduser chipstack
   usermod -aG sudo chipstack
   su - chipstack
   ```

2. **Install Node via nvm** (so you're not stuck on the distro's package):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   ```

3. **Get the code onto the box.** Push this folder to a private GitHub repo
   from VS Code, then on the VPS:
   ```bash
   git clone <your-repo-url> chipstack && cd chipstack
   npm install
   cp .env.example .env.local   # fill in the real values, never commit this file
   npm run build
   ```

4. **Run it under a process manager**, not `npm run dev`:
   ```bash
   npm install -g pm2
   pm2 start npm --name chipstack -- start
   pm2 save
   pm2 startup   # run the systemd command it prints
   ```

5. **Put a reverse proxy in front of it** so port 3000 isn't exposed
   directly and you get TLS. Point your domain's A record at
   `156.67.221.224` first, then:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   ```
   Nginx server block (`/etc/nginx/sites-available/chipstack`):
   ```nginx
   server {
     listen 80;
     server_name yourdomain.com;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
     }
   }
   ```
   Then:
   ```bash
   sudo ln -s /etc/nginx/sites-available/chipstack /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d yourdomain.com
   ```
   The `Upgrade`/`Connection` headers aren't needed yet but will be once
   Socket.io is added for live round state — leave them in now.

## Before moving to the next unit

Per `ai-workflow-rules.md`: confirm sign-in → wallet → balance read works
end to end on both testnets, `npm run build` passes, and
`progress-tracker.md` reflects it — then move to sandboxing the MoonPay
on-ramp.
