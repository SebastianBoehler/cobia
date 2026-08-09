# Cobia web

Cobia is a constrained DeFi quote market for X Layer. A wallet signs a USDG
policy, deterministic and research solvers compete over the same block-bounded
snapshot, and the verifier publishes only sanitized quotes. The selected private
bundle is revealed after an OKX MPP/x402 payment to the winning solver.

## Local run

Requirements: Node.js 22+, pnpm 11.20.0, and PostgreSQL 16+.

```bash
pnpm install
cp .env.example apps/web/.env.local
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web db:migrate
pnpm --filter @cobia/web dev
```

Open <http://localhost:3000>. The MCP endpoint is
<http://localhost:3000/mcp>.

Every variable in `.env.example` is required for the corresponding live path.
The app returns an explicit error when PostgreSQL, OKX, OpenAI, solver signing,
or payment configuration is unavailable; it does not substitute sample data.

## Network boundary

- Yield research reads live USDG/Aave V3 data on X Layer chain `196` through
  the signed OKX API and verifies the snapshot against the configured RPC.
- Winner payment accepts chain `196` or X Layer testnet `1952`. Set
  `PAYMENT_ASSET` to the actual payment-token address on the selected chain.
- The MVP does not move the user's USDG principal and does not claim a testnet
  Aave deployment. A full testnet payment check requires funded Agentic Wallet,
  OKX MPP credentials, treasury/solver addresses, and a deployed payment asset.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Database integration tests run when `DATABASE_URL` is present:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web exec vitest run lib/db/requests.test.ts
```
