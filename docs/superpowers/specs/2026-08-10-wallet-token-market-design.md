# Cobia Wallet and Token Market Design

## Product contract

Cobia is a wallet-native X Layer route market. A user connects an installed
EVM wallet, chooses a supported asset, defines deterministic constraints, and
signs an intent. Two Cobia-operated solvers receive the same immutable live
snapshot, submit signed private bundles, and compete under one deterministic
verifier. The user selects an executable quote and pays `0.10` of the configured
six-decimal payment token to reveal it: `0.09` to the winning solver and `0.01`
to Cobia.

The browser never asks the user to type a wallet address. Principal does not
move during request, solving, verification, or reveal payment.

## Scope and boundaries

- Discover installed wallets with EIP-6963 and communicate through EIP-1193.
- Support Phantom, OKX Wallet, MetaMask, and any conforming installed EVM
  provider without provider-specific code.
- Connect, switch to the required X Layer network, react to account and chain
  changes, and use the selected provider for intent and quote-selection
  signatures.
- Expose the current executable asset registry as selectable assets. The first
  registry contains X Layer USDG and USDt0 because OKX currently reports
  investable Aave V3 markets for both.
- Query OKX separately for the selected symbol. Never reuse another asset's
  snapshot or invent missing market data.
- Treat `Aave V3` and the live search label `Aave V3 / Main Market` as the same
  protocol family, while requiring product details to resolve to exact Aave V3
  execution metadata.
- Allow OKX `productGroup: null`, which is present in the current live X Layer
  response.
- Keep the deterministic solver as the execution optimizer and the AI solver
  as an independent risk researcher. Both operate only on supplied candidates;
  neither may invent calldata, venues, token addresses, or amounts.
- Label both current solvers as Cobia-operated. Future external solvers use the
  identical solver interface and verifier.
- Remove every eyebrow element and the shared eyebrow style.
- Show the reveal economics wherever payment is introduced.

X Layer testnet proves wallet signing and the x402 reveal-payment lifecycle.
It does not pretend to execute Aave principal because no authoritative Aave V3
test market is available there. Principal approval and Aave supply are enabled
only after a verified mainnet execution adapter and explicit user confirmation.

## Architecture

`WalletProvider` owns EIP-6963 announcements, the chosen EIP-1193 provider,
connected account, network state, and wallet errors. `WalletButton` is the sole
provider picker. `PolicyForm` and `CompetitionView` consume the same wallet
session, reject owner mismatches, and never read a global `window.ethereum`.

`supported-assets.ts` is an execution safety registry, not a market-data
fallback. It maps exact X Layer addresses, symbols, decimals, and supported
adapter family. `captureSnapshot` resolves the policy asset through this
registry, queries live OKX data for that symbol, validates returned detail
against the registry and policy, and freezes a token-specific snapshot.

The payment challenge remains server-authoritative. Browser payment support
uses a short-lived EIP-3009 authorization only when the challenged token and
connected wallet support it. A failed or declined signature reveals nothing.

## Interface design

**Visual thesis:** a light technical DeFi workspace where identity, constraints,
and money flow are explicit; hierarchy comes from type, spacing, and route
lines rather than eyebrow labels or ornamental cards.

**Content plan:** header wallet state; token and policy workspace; immutable
policy receipt; solver competition; explicit payment split; revealed route and
execution boundary.

**Interaction thesis:** the wallet control changes from connect to provider and
short account; the token control updates every amount suffix and policy receipt;
the existing route line and compact loading states communicate solving without
decorative motion.

## Error handling

- No provider: explain that an installed EVM wallet is required.
- Rejected connection, network switch, or signature: preserve entered policy
  and display the wallet error.
- Wrong owner on an existing request: block selection and identify the required
  account.
- Unsupported token or mismatched OKX detail: fail the market with an explicit
  server error.
- No eligible route: solvers abstain; the UI never calls the result executable.
- AI failure: preserve a valid deterministic quote and mark the market partial.
- Payment failure: keep the bundle private and display the broker or wallet
  failure without retrying automatically.

## Verification

- Unit-test provider discovery, deduplication, connection, account changes,
  X Layer switching, and wallet errors.
- Component-test that forms use the connected account, selected asset, and
  selected provider for signatures.
- Unit-test the current nullable OKX response, protocol-label normalization,
  and token-specific queries.
- Solver-test multiple candidates, abstention, signature verification, and
  deterministic tie-breaking.
- Run the full test, typecheck, lint, and production build suites.
- Browser-test the real local UI with an installed wallet provider and run a
  live OKX market request without mock data.

