# Cobia Intent Compatibility Boundary

## Current stablecoin route flow

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

## Current registered composition flow

Cobia also supports one typed multi-step optimization lane on X Layer. It is
composition over registered capabilities, not arbitrary transaction generation:

1. The compiler recognizes a maximum-input stablecoin-yield goal only when it
   contains an explicit amount, input asset, protocol set, conversion-loss
   ceiling, and deadline. It also requires a fresh solver profile advertising
   `policy.capability-composition@1`.
2. The wallet reviews and signs `CapabilityCompositionPolicyV1`. The policy
   commits the Aave V3 supply, Curve StableSwap NG exact-input, and/or Uniswap V3
   exact-input capability versions, allowed assets, receipt-value floor,
   30-day net-yield objective, gas/action bounds, competition window, and
   manifest hash.
3. The coordinator captures `CapabilityCompositionSnapshotV1`: the existing
   pinned route snapshot plus gas price and OKB/USD evidence. It does not let a
   solver introduce a later quote, price, capability, or deployment identity.
4. A compatible solver may submit direct Aave supply or exactly one registered
   Curve/Uniswap exact-input swap followed by terminal Aave supply. Each program
   must carry one registered aToken minimum-increase constraint and pass a
   disposable pinned-fork replay.
5. The independent verifier re-derives the narrower general-program authority,
   checks the exact opportunity/action correspondence and receipt floor, reruns
   capability verification, and ranks accepted revisions by receipt USD value
   plus horizon yield minus expected gas and solver fee.
6. The winning attested program projects through the existing atomic Executor
   V3 preparation path. The owner wallet still signs and broadcasts the exact
   execution; proposal or fork evidence is not a mainnet receipt.

## Current primitive mapping

| Open-intent primitive | Current Cobia primitive | Boundary |
| --- | --- | --- |
| Intent / order | `StablecoinPolicyV2` + commitment | Exact same-chain outcome and limits, not arbitrary calls |
| Registered composition intent | `CapabilityCompositionPolicyV1` + commitment | Maximum-input yield objective over an allowlisted capability graph |
| Solver quote | Sanitized `RouteQuoteV2` | Route authorization and estimated pre-gas APY; no private actions |
| Composed solver program | `CapabilityProgramV2` + replay evidence | Direct Aave or one exact-input swap followed by Aave; no arbitrary stages |
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

- Additional composition objectives need their own typed policy, snapshot,
  solver, verifier, and ranking modules. `maximize-net-yield` is the only
  registered composition objective today.
- More than one swap, partial allocation, LP entry, borrow/repay, bridge,
  exit/rebalancing, and cross-chain graphs are not accepted by the composition
  authority.
- OIF origination, fulfilment, settlement, and rebalancing adapters could become
  integration seams after Cobia defines an interoperable external order lifecycle.
- ERC-7683 and EIP-7930 become relevant only if cross-chain or non-EVM orders
  are added.
- Arbitrary staged settlement, persisted cross-process engine checkpoints, and
  generalized exit/rebalancing flows require separate implementations and tests.

None of these target capabilities should appear as current product behavior
until its implementation and verification exist.

## References

- [LI.FI Intent / Solver Marketplace](https://docs.li.fi/lifi-intents/introduction)
- [LI.FI Intents MCP tools](https://docs.li.fi/lifi-intents/mcp-server/tools)
- [Open Intents Framework](https://docs.openintents.xyz/)
- [OIF API and standards](https://docs.openintents.xyz/docs/apis)
