# Cobia MVP Design

## Decision

Cobia is an agent-native RFQ market on X Layer where an AI research solver and
a deterministic optimizer compete to produce auditable DeFi route quotes.
Deterministic code privately validates every complete bundle. The user compares
sanitized verified quotes, selects one, pays only its solver through OKX x402,
and receives the committed executable bundle. A constrained executor performs
the selected action. The public brand is **Cobia**; `solver market` is a product
category, not part of the name.

## Hackathon outcome

By August 21, 2026, the demo must show one uninterrupted real-data flow:

1. A user creates a stablecoin allocation policy for an X Layer Agentic Wallet.
2. Both solvers privately return the same typed `DecisionBundle` format and
   publicly commit its hash.
3. The verifier rejects a deliberately invalid bundle and ranks valid bundles.
4. The user compares sanitized `RouteQuote` summaries and selects one.
5. Agentic Wallet pays the winning solver through x402; Cobia receives a 10%
   platform split and then reveals the committed bundle.
6. After commitment revalidation, fork verification, and explicit approval,
   the wallet executes a small
   mainnet Aave V3 supply through `CobiaExecutor`.
7. X Layer records the request, bundle commitments, selection, and execution.
8. The result page links every payment and execution transaction to Explorer.

Testnet completion is required before mainnet. Because no authoritative Aave X
Layer testnet deployment is available, testnet covers real x402 settlement,
solver competition, rejection, selection, and ledger commitments. A mainnet fork
verifies execution before the final small-value X Layer mainnet payment and
execution. No runtime mock data is allowed.

## Target user and paid artifact

The initial user is a crypto-native individual or small treasury holding a
stablecoin on X Layer. The first paid artifact is an **executable decision
bundle**, not a generic report and not an autonomous long-running mandate.

The first supported intent is deliberately narrow:

> Allocate up to a stated amount of one supported stablecoin between holding
> cash and supplying Aave V3, subject to exposure, TVL, freshness, expiry, and
> minimum-return constraints.

## System boundary

### AI is responsible for

- Researching current protocol documentation, audits, incidents, and governance.
- Turning evidence into typed risk flags and a proposed allocation.
- Explaining disagreements between solvers in plain language.

### Deterministic code is responsible for

- Fetching and normalizing APY, TVL, token, block, and position data.
- Hashing policies, snapshots, evidence, bundles, and payment receipts.
- Checking constraints, recomputing portfolio APY, and ranking valid bundles.
- Constructing the only supported Aave action.
- Enforcing token, amount, adapter, owner, and expiry onchain.
- Recording payments, selection, execution, and later outcomes.

An LLM never emits or authorizes arbitrary Solidity, calldata, target addresses,
token approvals, or transaction amounts.

## User flow

1. The browser collects the Agentic Wallet address, stablecoin, principal, and
   constraints and opens a free request.
2. Cobia captures one immutable market snapshot and passes it to both solvers.
3. Solvers privately return signed bundles and publish route commitments.
4. Cobia verifies complete bundles and exposes sanitized `RouteQuote` summaries.
5. The user selects a valid quote without receiving its complete route.
6. The selected reveal endpoint returns HTTP 402. Agentic Wallet settles a
   `0.10` USDC payment: `0.09` to the winner and `0.01` to Cobia.
7. Cobia releases the winning bundle and revalidates it against the commitment.
8. Agentic Wallet re-simulates the constrained transaction instruction.
9. `CobiaExecutor` performs the Aave supply and tells `CobiaLedger` to record it.

## Domain contracts

`StablecoinPolicy` contains version, request ID, owner, execution chain ID `196`, asset,
principal atomic amount, maximum protocol exposure in basis points, minimum
TVL, minimum net APY, snapshot maximum age, and execution deadline.

`MarketSnapshot` contains chain ID, block number/hash, capture time, asset
metadata, and normalized candidates. The cash candidate has zero yield and no
action. The Aave candidate contains investment ID, pool address, APY, TVL,
utilization, and the source retrieval time.

`DecisionBundle` contains the solver identity, policy and snapshot hashes,
allocation basis points, evidence records, risk flags, expected APY, one typed
action or an abstention reason, and a solver signature.

`RouteQuote` is the public pre-payment projection of a private bundle. It
contains solver identity, bundle commitment, price, expected net APY, risk
grade, verification summary, submission time, and validity. It excludes target
calldata and any detail sufficient to copy the executable route.

`VerificationVerdict` contains a stable error code list, recomputed APY,
deterministic risk penalty, final score, and whether execution is allowed.

JSON artifacts are canonicalized before Keccak-256 hashing. The onchain policy
commitment uses one fixed ABI tuple shared by Solidity and TypeScript. Atomic
token amounts are decimal strings; percentages and rates use integer basis
points. Floating-point numbers are forbidden in domain and contract interfaces.

## Onchain contracts

`CobiaLedger` is event-oriented. It records request openings, solver bundle and
verification commitments, user selection, winning payment receipt hash, reveal
receipt, execution transaction details, and outcome observations. Full reports
stay offchain; the ledger stores their commitments.

`CobiaExecutor` accepts only the policy owner, the configured stablecoin, the
configured Aave adapter, an amount no greater than the signed policy cap, and a
non-expired request. It pulls exactly that amount, resets approvals after use,
and sends the resulting Aave position to the policy owner.

`AaveV3SupplyAdapter` contains the minimal Aave interaction. Its pool address is
set at deployment and cannot be changed. There is no general-purpose external
call primitive.

## Offchain components

- Next.js web application and route handlers.
- PostgreSQL for request state and full offchain artifacts.
- An OKX Open API client for product discovery and detail retrieval.
- A deterministic TypeScript solver.
- An OpenAI Responses API research solver using web search and structured output.
- OKX `@okxweb3/mpp` charge middleware paying the selected solver with a 10%
  Cobia platform split.
- Viem clients for X Layer reads, writes, and receipt tracking.

The app fails visibly if credentials, live products, settlement, solver output,
chain receipts, or contract configuration are unavailable. It never substitutes
sample results.

## Failure behavior

- No live X Layer product: request creation is disabled with a source error.
- No solver submits: close the request without charging the user.
- Payment fails: keep the selected verified quote and mark the request
  `payment_failed`; do not reveal the bundle.
- One solver fails: show its failure; do not invent a bundle. The other result
  may be inspected but automatic selection is disabled.
- Invalid bundle: persist and display the verifier codes; never execute it.
- Stale quote before payment: refuse to issue the payment challenge and require
  a new competition. A paid bundle remains a purchased research artifact, but
  stale execution is always blocked.
- Reverted execution: preserve the selected bundle and record the revert hash.
- Ledger write fails: mark the result uncommitted and block execution.

## MVP exclusions

- Cross-chain allocation, bridging, perpetuals, leverage, and arbitrary swaps.
- Recurring autonomous mandates or subscription billing.
- User-authored or LLM-authored smart contracts.
- ZK policy proofs, voice control, and custom model training.
- Tokens, governance, solver staking, disputes, and success fees.
- Uniswap LP execution. It can become the second executable adapter only after
  the Aave path is complete on mainnet.

## Promotion gates

1. **Sponsor API gate:** live chain-196 product discovery and x402 testnet charge
   must work with project credentials. Failure stops implementation for a design
   revision; no alternative data/payment provider is silently introduced.
2. **Contract gate:** all Foundry tests and invariant tests pass before testnet.
3. **Testnet gate:** paid request, two bundles, rejection, selection, and ledger
   commitments are visible on X Layer testnet.
4. **Fork gate:** exact mainnet Aave addresses and bytecode pass the complete
   executor suite against an X Layer mainnet fork.
5. **Mainnet gate:** only verified deployment parameters and a capped small value
   are used. One successful payment and execution are required.
6. **Submission gate:** clean install, automated tests, public deployment,
   Explorer links, README, architecture diagram, demo video, and active X account.

## Success metrics

- One real x402 charge after selection pays the winner 90% and Cobia 10%.
- Both solvers return schema-valid, signed bundles from the same snapshot.
- The verifier catches every seeded policy violation in the evaluation suite.
- No action can move more than the policy cap or call an unapproved adapter.
- The full winning route remains unavailable until the payment receipt settles.
- The browser exposes provenance from input snapshot through payment and execution.
- A fresh evaluator can reproduce the testnet flow from the README.

## Primary references

- Hackathon: <https://web3.okx.com/de/xlayer/build-x-series>
- x402 Node SDK: <https://web3.okx.com/onchainos/dev-docs/payments/sdk-nodejs>
- Agentic Wallet buyer flow: <https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer>
- DeFi product search: <https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search>
- X Layer developer documentation: <https://web3.okx.com/onchainos/dev-docs/xlayer/developer>
