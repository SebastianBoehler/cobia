# Cobia Intent Compatibility Boundary

## Current flow

Cobia borrows the separation between intent, quote, and validation used by
LI.FI Intents and the Open Intents Framework (OIF), but does not claim OIF or
ERC-7683 compliance.

The implemented flow is:

1. A wallet signs a V2 `StablecoinPolicy` for X Layer chain `196`, including
   exact protocol exposure, allowed assets/adapters, slippage, horizon, and
   freshness limits.
2. The orchestrator captures registered Aave V3 reserve/oracle state plus Curve
   StableSwap NG and Uniswap V3 exact-input quotes at one pinned block. Ineligible opportunities
   are omitted; RPC, registry, identity, or reorg failures fail the capture.
3. Configured deterministic and bounded agentic Cobia solvers construct and sign
   `RouteBundleV2` candidates: retain all, direct Aave supply, Curve/Uniswap-to-Aave,
   or one-sided full-range Uniswap LP entry.
4. The verifier recomputes authorization, conservation, opportunity amounts,
   policy limits, registry coverage, pre-gas economics, expiry, and signer,
   then projects one sanitized public quote.
5. An owner-bound OKX MPP/EIP-3009 payment reveals the exact signed plan.

V1 OKX-derived Aave allocation artifacts remain parseable for existing rows and
purchases, but new browser and MCP intents use V2. Purchased V2 routes expose a
persisted, buyer-authenticated fork rehearsal and verified stepwise owner-wallet chain-196
execution while the route remains fresh. Direct Aave, Curve/Uniswap-to-Aave,
and full-range Uniswap LP-entry routes have passed the pinned fork lane with
receipt, event, deployment, and state checks. Fork funds and state are simulated;
live mainnet execution still requires explicit wallet confirmation per step.

## Current primitive mapping

| Open-intent primitive | Current Cobia primitive | Boundary |
| --- | --- | --- |
| Intent / order | `StablecoinPolicyV2` + commitment | Exact same-chain outcome and limits, not arbitrary calls |
| Solver quote | Sanitized `RouteQuoteV2` | Route authorization and estimated pre-gas APY; no private actions |
| Solver fill plan | Signed `RouteBundleV2` | Registered opportunity references and bounded actions, hidden until reveal payment |
| Order server | Cobia orchestrator | Captures direct registered protocol state at one pinned block |
| Oracle / validation | Deterministic verifier | Recomputes authorization; it does not predict execution success |
| Settlement | Guided owner-wallet execution | Fresh purchased and rehearsed V2 routes submit one locally rebuilt, owner-confirmed transaction at a time |
| Fulfilment evidence | Persisted per step | Canonical receipt, protocol event, deployment identity, and bounded state checks; fork evidence remains historical |

The `0.10` stablecoin charge buys access to the signed deterministic allocation
bundle. It is not an escrow deposit, solver bond, yield guarantee, settlement
receipt, or payment of investment principal. Cobia does not front principal
from its own inventory.

## Current agent surface

The `/mcp` endpoint exposes four tools:

1. `discover-yield-markets` returns explicitly informational OKX Aave estimates;
   they are not the V2 route snapshot authority.
2. `prepare-yield-intent` creates the same canonical unsigned V2 policy used by
   the browser and returns its commitment.
3. `submit-yield-intent` checks an external wallet signature and captures the
   direct V2 snapshot before running deterministic and bounded agentic solvers.
   It can truthfully return zero authorized quotes.
4. `track-yield-intent` returns lifecycle state and the sanitized quote.

The hosted server never receives or holds the request owner's private key. It
prepares data, returns owner signing to the wallet, and accepts only the
resulting signature. It does hold separate configured deterministic and agentic
solver signing keys used for Cobia's solver bundles; neither key authorizes
request-owner principal transactions. The signed route bundle remains protected by the
same reveal-payment boundary used by the browser.

## Target, not implemented

- An authenticated external-solver interface could allow independent bundles
  after signer admission, evidence provenance, and deterministic validation are
  specified and tested.
- OIF origination, fulfilment, settlement, and rebalancing adapters could become
  integration seams after Cobia defines an interoperable external order lifecycle.
- ERC-7683 and EIP-7930 become relevant only if cross-chain or non-EVM orders
  are added.
- Atomic multi-step settlement, persisted cross-process engine checkpoints, and
  generalized exit/rebalancing flows require separate implementations and tests.

None of these target capabilities should appear as current product behavior
until its implementation and verification exist.

## References

- [LI.FI Intent / Solver Marketplace](https://docs.li.fi/lifi-intents/introduction)
- [LI.FI Intents MCP tools](https://docs.li.fi/lifi-intents/mcp-server/tools)
- [Open Intents Framework](https://docs.openintents.xyz/)
- [OIF API and standards](https://docs.openintents.xyz/docs/apis)
