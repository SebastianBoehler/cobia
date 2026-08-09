# Cobia Intent Compatibility Boundary

## Why these references matter

Cobia borrows the market separation used by LI.FI Intents and the Open Intents
Framework (OIF): users state outcomes and constraints, solvers propose fills,
an order service compares them, and deterministic infrastructure decides what
may settle. Cobia does not claim OIF or ERC-7683 compliance in v1.

LI.FI currently matches user intents against solver **standing quotes**. Cobia
v1 instead runs a request-triggered sealed competition because a yield route
contains time-sensitive research and risk evidence. This is an explicit product
choice, not a description of LI.FI's auction mechanism.

## Primitive mapping

| Open-intent primitive | Cobia v1 primitive | Boundary |
| --- | --- | --- |
| Intent / order | `StablecoinPolicy` + policy commitment | Outcome and limits, not arbitrary calls |
| Solver quote | Sanitized `RouteQuote` | Public before payment |
| Solver fill plan | Signed `DecisionBundle` | Private until winner payment |
| Order server | Cobia orchestrator | One block-bounded snapshot for all solvers |
| Oracle / validation | Deterministic verifier | Recomputes constraints; an LLM cannot waive them |
| Settlement | User-approved Aave supply | User principal stays in the wallet until execution |
| Fulfilment evidence | Execution receipt and bundle commitment | Separate from the x402 research payment |

The `0.10 USDC` x402 charge buys the winning research bundle. It is not an
escrow, input-settler deposit, solver bond, yield guarantee, or payment of the
user's investment principal. Unlike a cross-chain LI.FI fill, the Cobia solver
does not front the user's USDG from its own inventory.

## Standards posture

- OIF's modular origination, fulfilment, settlement, and rebalancing layers are
  the intended adapter seams.
- ERC-7683 is relevant when Cobia adds cross-chain orders. It is not needed to
  represent the first same-chain Aave allocation.
- EIP-7930 interoperable addresses become relevant with non-EVM or cross-chain
  assets. V1 deliberately uses checksummed EVM addresses and chain ID `196`.
- OIF compatibility must be proven with reference contracts and conformance
  tests before it appears in product copy.

## Agent surface

The `/mcp` endpoint uses the 2026-07-28 MCP transport while retaining the SDK's
stateless legacy compatibility. The first public tools are:

1. `discover-yield-markets` — inspect current executable X Layer markets.
2. `prepare-yield-intent` — create an unsigned policy and commitment.
3. `submit-yield-intent` — verify an externally signed policy and open its market.
4. `track-yield-intent` — inspect lifecycle state and sanitized quotes.

The hosted MCP server never holds a user's wallet key. It prepares data, hands
signing back to the wallet, and accepts only the resulting signature. Future authenticated solver tools should add
`get-open-intents`, `submit-bundle`, `diagnose-bundle`, and
`get-solver-reputation`. Private route reveal remains protected by the same
x402 endpoint used by the browser; MCP must not create a second bypass.

## References

- [LI.FI Intent / Solver Marketplace](https://docs.li.fi/lifi-intents/introduction)
- [LI.FI Intents MCP tools](https://docs.li.fi/lifi-intents/mcp-server/tools)
- [Open Intents Framework](https://docs.openintents.xyz/)
- [OIF API and standards](https://docs.openintents.xyz/docs/apis)
