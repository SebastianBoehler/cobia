# Cobia Earn Marketplace Product Design

## Objective

Cobia is a non-custodial Earn marketplace on X Layer. It continuously runs
solver competitions over audited protocol actions, presents useful strategy
outcomes before asking for wallet authority, and executes a freshly verified
route only after an explicit user approval.

The first public release is a capped X Layer mainnet beta. It is a real product
track, not a testnet-only hackathon interface. Testnet remains useful for wallet,
payment, and provenance rehearsal, but it must not claim protocol execution that
does not exist there.

## Product contract

- Explore recurring Earn markets without connecting a wallet.
- Connect an EIP-1193 wallet to read available balances and positions.
- Confirm that the requested capital and gas reserve are available; never freeze
  principal during discovery, competition, or route purchase.
- Generate wallet- and amount-specific routes from typed, audited adapters.
- Keep exact paid route details private until the x402 purchase settles.
- Display the complete purchased route, costs, assumptions, solver evidence,
  alternatives, payment receipt, and execution eligibility.
- Mark a route `ready_to_execute` only after a fresh balance check and successful
  transaction simulation.
- Approve only the exact token amount and execute the committed route atomically.
- Preserve a wallet-address-scoped activity history for every Cobia step.

## Current findings and corrections

The current paid request `d3d63b31-3ef3-46ae-bf1f-c57ad02e96b4` purchased a
real stored bundle but the client discarded the response. The bundle allocated
60% to USDT cash and 40% to Aave V3 product `33905`, proposing a 10,000 USDT
supply from a 25,000 USDT policy. Its recomputed weighted APY was 9 bps.

That bundle was policy-valid but not wallet-executable for the funded test
wallet. The current `executable` label therefore conflates two states. The new
model separates:

1. `policy_valid`: typed actions satisfy the intent and deterministic verifier.
2. `wallet_eligible`: balance and gas reserve cover the requested actions.
3. `simulated`: the exact route succeeds against a recorded recent block.
4. `ready_to_execute`: all prior states hold and the quote remains fresh.

The live OKX product query on 2026-08-10 returned four X Layer Earn products,
all on Aave V3: USDT, ETH, OKB, and USDG. Additional executable protocols must
not be invented. Protocol breadth grows only through verified direct adapters.

The official Uniswap V3 X Layer factory currently resolves a USDG/USDT 0.01%
pool. This makes direct-lend versus swap-then-lend a genuine first competition.

## Primary surfaces

### Explore

`/markets` is the default product surface. A market is identified by input
asset, amount band, investment horizon, and risk tier. Each card shows:

- expected net APY and estimated monthly/yearly earnings;
- base protocol yield, reward yield, swap cost, gas, and platform fees;
- executable capacity and liquidity;
- number of solvers and eligible strategies;
- most recent verification block and age;
- a plain-language risk grade.

Indicative market rounds are free. Selecting a market starts a fresh
wallet-specific round.

### Market detail

`/markets/[marketId]` shows the market history, current strategy leader,
runner-up differences, APY history, available capacity, solver participation,
and adapter risks. Exact calldata remains unavailable before purchase.

### Purchased route

`/routes/[routeId]` renders the paid route as amounts and typed steps. It must
show retained capital, each swap, protocol deposit, minimum output, fees,
expected position, validity, verifier results, solver signature, and payment
receipt. An unavailable balance produces a precise shortfall instead of an
execution button.

### Portfolio

`/portfolio` reads current token balances and direct-adapter positions from
chain state. Cached position snapshots always include their block number.
Withdraw, claim, and rebalance actions use the same fresh quote and simulation
pipeline as deposits.

### Activity

`/activity` is an append-only wallet timeline. It distinguishes off-chain
signatures and x402 receipts from on-chain transactions. Transaction entries
include status, hash, chain, Explorer link, asset delta, route commitment, and
failure reason.

### Custom

`/requests/new` remains an advanced surface for custom constraints. The current
policy receipt moves under `Your protections`; it is not the primary product
value proposition.

## Recurring marketplace

A dedicated worker runs standardized competitions independently of web
requests. PostgreSQL advisory locks prevent duplicate rounds across replicas.
Rounds run every minute and may also be triggered by material reserve, pool, or
rate changes.

Reference rounds use canonical amount bands and horizons. A cached winner is
never directly executable. User selection starts a just-in-time round using the
exact wallet asset, amount, horizon, current block, and current liquidity.

Stale rounds remain visible as historical data but cannot be purchased or
executed. The UI never silently substitutes an older route.

## Typed route graph

Solvers submit `RoutePlan` objects composed only from registered action types:

- `hold`
- `uniswap-v3-exact-input`
- `aave-v3-supply`
- `aave-v3-withdraw`

Each action references a versioned adapter ID and typed parameters. Solvers do
not submit target addresses, arbitrary function selectors, or raw calldata.
The verifier resolves target contracts from the adapter registry and builds the
transaction after validation.

The route graph records input/output assets and amounts for every edge, so the
verifier can prove conservation, slippage bounds, maximum spend, and expected
position ownership.

## Solver model

The first Cobia-operated execution solvers are independent algorithms over the
same immutable snapshot:

1. `no-action`: baseline that holds the input asset.
2. `direct-lend`: supplies the input asset directly when an eligible reserve
   exists.
3. `swap-then-lend`: quotes a direct Uniswap V3 swap into a higher-yield asset,
   then supplies the output.
4. `split-optimizer`: searches bounded allocation splits and amortizes one-time
   costs over the selected horizon.

No-action may win when incremental yield does not exceed gas, fees, slippage,
risk penalties, and an uncertainty margin.

The AI research component is an independent risk and evidence annotator. It may
lower a route score or block a protocol through signed evidence, but it cannot
invent actions, targets, amounts, APYs, or calldata. External solvers later use
the same typed interface and signature verification.

## Direct adapters

### Aave V3

The adapter reads reserve and user state directly, calculates expected supply
yield, builds supply/withdraw actions, and verifies the official X Layer pool
and asset mappings. It rejects disabled, frozen, paused, or mismatched reserves.

### Uniswap V3

The adapter resolves pools from the official X Layer factory, reads liquidity
and state, quotes exact-input swaps, applies a user-visible minimum output, and
executes only through the registered official router. Pool identity is derived
from the factory; a solver cannot choose a replacement pool contract.

Additional adapters require authoritative deployment sources, bytecode checks,
fork tests, and explicit registry activation before they become executable.

## Deterministic verification

The verifier independently recomputes:

- asset and amount conservation;
- protocol and wallet exposure;
- APY after allocation, swap cost, gas, fees, and horizon amortization;
- price impact and minimum received;
- reserve and pool liquidity;
- route freshness and deadlines;
- adapter targets and selectors;
- recipient ownership of resulting positions;
- balance, allowance, and gas eligibility;
- exact transaction simulation at a recorded block.

The same verifier evaluates internal and external solvers. Deterministic
tie-breaking uses risk-adjusted net return, then lower total cost, then a stable
solver ID ordering.

## Contracts

The repository needs a real Foundry workspace with:

- `CobiaExecutor`: validates a route commitment, pulls no more than the approved
  amount, dispatches registered adapters atomically, and enforces the recipient.
- `AdapterRegistry`: versioned allowlist of adapter implementations and target
  contracts.
- `AaveV3Adapter`: bounded supply and withdraw operations.
- `UniswapV3Adapter`: bounded exact-input swap operation.
- `ExecutionLedger`: emits wallet, solver, route, amount, adapter, and outcome
  commitments.

The executor has configurable per-transaction and per-day caps for the beta.
Administrative changes use a timelock and emit registry events. No contract can
custody user principal outside an active atomic execution.

## Persistence

- `markets`: asset, amount band, horizon, risk tier, and active adapter set.
- `market_rounds`: immutable snapshot, block, status, and winning route.
- `solver_submissions`: signed typed plan, verdict, score, and failure reason.
- `route_purchases`: payment receipt, purchased bundle, buyer, and timestamps.
- `activity_events`: append-only wallet lifecycle events.
- `executions`: simulation block, commitment, approval, transaction, receipt,
  and final status.
- `position_snapshots`: block-numbered derived cache, never authority.

Wallet address and chain ID form the user identity for this release. No email
account is required.

## APIs

- `GET /api/markets`
- `GET /api/markets/[marketId]`
- `POST /api/markets/[marketId]/quote`
- `GET /api/routes/[routeId]`
- `POST /api/routes/[routeId]/purchase`
- `POST /api/routes/[routeId]/simulate`
- `POST /api/routes/[routeId]/execute`
- `GET /api/wallets/[address]/portfolio`
- `GET /api/wallets/[address]/activity`

Private bundle endpoints require a valid payment receipt or buyer-wallet proof.
Server responses never expose solver signing keys or arbitrary calldata.

## Error behavior

- No profitable route: publish no-action as the winner.
- Solver failure: persist the failure; never synthesize a submission.
- Stale quote: require a fresh wallet-specific round.
- Insufficient balance or gas: show the exact shortfall and disable execution.
- Payment failure: keep the route sealed and preserve the selected quote.
- Simulation mismatch or revert: record the failure and block signing.
- Wallet rejection: return to a retryable state without losing the purchased
  route.
- Transaction revert: preserve the hash, decoded reason, route, and receipt in
  Activity.
- Worker outage: mark market data stale; never serve it as live.

## Verification strategy

- Domain unit tests for typed actions, conservation, scoring, and state labels.
- Solver table tests across amount, horizon, liquidity, and cost boundaries.
- Adapter integration tests against X Layer mainnet RPC snapshots.
- PostgreSQL tests for idempotent rounds, purchases, activity, and state
  transitions.
- Foundry unit, fuzz, invariant, and mainnet-fork tests.
- Browser tests for discovery, purchase, balance eligibility, route rendering,
  simulation, approval, execution, and activity recovery after reload.
- Security scans and an independent contract review before capped mainnet beta.

## Delivery sequence

1. Correct paid route persistence/rendering, wallet eligibility labels, and
   activity events.
2. Add recurring market storage, worker, Explore UI, and wallet-specific rounds.
3. Add typed route plans plus no-action, direct-lend, swap-then-lend, and split
   solvers.
4. Add direct Aave and Uniswap readers/quoters with deterministic simulation.
5. Build and verify the Foundry contracts and execution preparation UI.
6. Deploy test contracts, obtain independent review, and enable capped X Layer
   mainnet beta.
7. Add portfolio withdrawals, claims, rebalancing, and external solver access.

Every phase extends the production architecture. No mock strategy, fake APY,
fallback route, or fabricated protocol listing is allowed.

## Success criteria

- A user can discover useful Earn strategies before connecting a wallet.
- Purchased routes remain visible after reload and explain every amount and fee.
- A route cannot be labelled executable without sufficient funds and a fresh
  successful simulation.
- At least no-action, direct-lend, and swap-then-lend compete on the same data.
- Solver outputs contain no arbitrary target or calldata authority.
- Portfolio and Activity reconstruct the full Cobia lifecycle for a wallet.
- Capped mainnet execution moves only the committed amount through registered
  adapters and returns the resulting position to the user.

## Authoritative references

- OKX DeFi product query: <https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-introduction>
- OKX Wallet data and transaction APIs: <https://web3.okx.com/onchainos/dev-docs/wallet/wallet-api-introduction>
- Uniswap V3 X Layer deployments: <https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments>
- LI.FI solver marketplace: <https://docs.li.fi/lifi-intents/introduction>
- Open Intents Framework: <https://docs.openintents.xyz/>
