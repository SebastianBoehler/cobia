# Competitive positioning: verified multi-step lending intents

Snapshot: 23 August 2026. This is an evidence-led comparison, not a market-
share, TVL, or audit ranking. It assumes Cobia has actually shipped and shown
wallet-signed **X Layer mainnet** examples of its registered, 1--8-action
composition: direct Aave supply and Curve/Uniswap exact-input then Aave supply.
Without public executions, this positioning is aspirational, not earned.

## Short answer

Cobia would enter the credible **second tier (roughly #4 in this functional
comparison)** for a user whose job is “turn this asset into a lending position
through a bounded multi-step route.” Enso and Across already document more
mature multi-step/cross-chain deposit flows, and Relay has a larger generic
execution rail. Cobia can be **#1 in the narrower verifier-owned intent
control-plane category** if it demonstrates that solver competition,
independent replay, signed constraints, and the exact receipt outcome are live
on X Layer. That is real differentiation, but it does not make Cobia an overall
leader in liquidity, chain coverage, mature integrations, distribution, or
historical reliability.

The practical competitive message is therefore not “a better DEX aggregator”
or “the best cross-chain intent protocol.” It is: **a user can ask for a
bounded lending outcome; competing programs are constrained, replayed and
ranked by verifier-owned evidence before that user's wallet submits one exact
program.** Cobia must repeatedly prove this statement with fresh public
examples.

## Capability ranking under the stated assumption

This ranks the *product ability to accomplish a multi-step lending/deposit
goal*, not total protocol scale. `#` is deliberately not a claim about usage,
security, or commercial traction.

| Rank | Product | Verified surface | Why it ranks here | Cobia implication |
| ---: | --- | --- | --- | --- |
| 1 | [Enso](https://docs.enso.build/pages/build/get-started/bundling-actions) | Its Bundle API composes ordered actions atomically, passes prior outputs to later actions, and documents swap/deposit, deposit/borrow/swap/redeposit, bridge, harvest and lending actions. | The clearest broad, production-facing multi-step DeFi execution competitor. It has far more action/protocol breadth than Cobia's initial three registered modules. | Do not compete on “can bundle actions.” Win only if Cobia's signed policy, independent replay and solver-comparison evidence are visibly stronger and easier to understand. |
| 2 | [Across](https://docs.across.to/guides/concepts/crosschain-intents) | Its cross-chain intent flow supports a destination transaction and documents bridge-to-Aave as a concrete phase-2 example; Embedded Actions explicitly shows swap + Aave deposit. | This is already a real bridge/swap/deposit product, with mature settlement and a broader network than Cobia's first slice. It is one cross-chain intent plus destination execution rather than an open multi-leg strategy market. | A basic “bridge/swap then Aave” example does not beat Across. Either use Across as a rail or compete above it with visible policy, independently checked outcome and solver choice. |
| 3 | [Relay](https://docs.relay.link/references/api/quickstart) | Quote API returns execution `steps` for bridge, swap and cross-chain call use cases; its call guide accepts destination calldata (including multiple calls), while the integrator processes the wallet actions. | Very broad production execution/distribution rail. It is not documented as a lending-aware planner or program marketplace, but its raw call capacity and coverage are materially more mature than an initial Cobia launch. | Relay can be a future delivery rail. Cobia's product value must remain the signed objective and verifiable result, not the ability to display a sequence of transactions. |
| 4 | **Cobia (conditional)** | The repository specifies registered Aave supply, Curve and Uniswap actions; solver-selected programs; immutable evidence; fresh-fork replay; and objective computation that charges conversion loss, gas and solver fee. [Composition design](../superpowers/specs/2026-08-22-registered-capability-composition-design.md), [current integration boundary](protocol-integrations.md). | Narrow but unusually strict: the proposed program cannot add capabilities, targets, assets, approvals or value outside a signed policy, and it is replayed before selection. A few live examples prove the loop, not mature execution operations. | Ship a small, repeatable “USDG -> best eligible Aave receipt” proof. Do not claim generic DeFi orchestration, autonomous yield, or future-return guarantees. |
| 5 | [LI.FI Intents](https://docs.li.fi/lifi-intents/intents-api/create-and-submit) | An OIF `StandardOrder` supports one origin input side, multi-chain outputs, deadlines and an optional delivery `call`; solvers compete to deliver the output and settlement verifies delivery. | Strongest direct *intent-marketplace* analogue and much stronger on cross-chain fulfillment. Its public order model establishes an optional delivery call, but the cited docs do not establish a lending-specific semantic verifier, multi-action lending UX, or a Cobia-style solver competition over net yield. | LI.FI is a potential upstream/cross-chain partner, not something Cobia should imitate wholesale. Cross-chain is a future expansion only after Cobia can precisely verify destination lending outcomes. |
| 6 | [1inch Fusion+](https://github.com/1inch/cross-chain-sdk) | Creates cross-chain atomic swap orders, with quote/order/status APIs and escrow/secret handling; the official SDK examples are token-to-token transfers. | Excellent cross-chain swap execution, but not a documented multi-protocol lending composer. Its lifecycle also needs user/relayer secret coordination. | It is a high bar for swap UX and atomic cross-chain safety, not the benchmark for lending-route verification. Avoid calling Cobia “more atomic” than Fusion+ across chains. |
| 7 | [CoW Protocol](https://docs.cow.fi/) | Permissionless same-chain trading through fair combinatorial batch auctions and external on-chain liquidity. | A mature benchmark for protected swap price discovery, but its documented core product is trading rather than lending composition or cross-chain delivery. | CoW raises the bar for execution quality/MEV protection. It does not erase Cobia's lending-intent niche. |
| 8 | [OKX OnchainOS DEX Intent](https://web3.okx.com/zh-hans/onchainos/dev-docs/trade/dex-intent-create-order) | User signs the quoted EIP-712 DEX intent and submits an intent swap order. The published request is token-in/token-out with minimum output and receiver. | Most relevant distribution/ecosystem incumbent around X Layer, but the cited DEX-intent API is a swap order rather than a general lending-composition product. | This is the near-term go-to-market risk: OKX can surface a simple swap first. Cobia needs to own the harder end state—receipt-token outcome plus evidence—not the preliminary conversion. |

### Important qualification on the list

Enso and Across explicitly show the kind of composition at issue: Enso shows a
swap followed by Aave deposit and a leveraged deposit/borrow/swap/redeposit
bundle; Across shows a cross-chain swap + Aave deposit. LI.FI's delivery `call`
and Relay's cross-chain-call capability are flexible primitives, but flexibility
is not proof of a safe lending product. Conversely, the public docs reviewed
here do **not** establish any listed alternative's X Layer (`196`) support;
absence from this review is not proof that a route is unsupported.

## Where Cobia can genuinely win

1. **Verifiable choice, not just orchestration.** Enso gives a transaction for
   actions specified by the integrator. Cobia's claimed advantage is that the
   owner signs the allowed capability set and objective first; independent
   solvers compete only inside it; Cobia then recomputes the result from
   committed evidence and replay. This distinction needs a visible policy,
   rejected-program reason and accepted replay receipt in the product.
2. **Outcome language for the normal user.** “Get the best eligible stablecoin
   lending receipt within 1% conversion loss” is closer to a user goal than
   “bundle these protocol calls.” The outcome still has to distinguish immediate
   receipt minting (verifiable) from APY/future yield (a forecast).
3. **X Layer-native evidence.** Cobia's initial registry is deliberately small:
   X Layer Aave V3 plus the exact Curve/Uniswap conversion modules. That makes
   chain/code identity, receipt attribution and fork replay feasible. It is a
   wedge, not global coverage.

## Where Cobia is currently weaker—even after launch

- **Breadth and liquidity:** Enso, Across and the cross-chain systems have
  broader supported actions/chains and more established production operations.
  Three Cobia modules and one lending destination do not support a general
  “best yield” claim.
- **Cross-chain completion:** LI.FI, Fusion+, Relay and Across are purpose-built
  for cross-chain lifecycle/settlement. Cobia should not imply its same-chain
  atomic verification model extends over an asynchronous bridge.
- **Distribution and trust history:** live examples establish functionality,
  not sustained availability, fill quality, incident response, user trust or
  solver depth. The ranking should move down immediately if no independent
  solvers submit or if replay/quote freshness produces repeated abstentions.
- **Objective validity:** “maximize net yield” depends on a user-visible horizon
  and pinned valuation/rate evidence. It is an estimator for comparison, not a
  promise of realized APY. A fair UI should lead with spend cap, receipt floor,
  protocol/asset allowlist and fees—not an APY headline.

## Release bar that changes this from a good design into a strong position

Before using the ranking publicly, publish at least three small mainnet
receipts that each include: signed policy; allowed capability versions; the
competing/abstaining submissions; pinned block and evidence hashes; replay
result; wallet transaction; Aave receipt-token delta; total gas/solver cost;
and an explicit statement that the shown yield is projected rather than
guaranteed. The example set should cover direct Aave, Curve-to-Aave and
Uniswap-to-Aave. One polished happy path is a demo; repeatable public receipts
are the competitive proof.

## Primary sources

- [Enso: bundling actions](https://docs.enso.build/pages/build/get-started/bundling-actions) and [lending actions](https://docs.enso.build/pages/build/reference/actions)
- [LI.FI: intent marketplace](https://docs.li.fi/lifi-intents/introduction) and [StandardOrder/calls on delivery](https://docs.li.fi/lifi-intents/intents-api/create-and-submit)
- [1inch Cross Chain SDK](https://github.com/1inch/cross-chain-sdk) and [1inch Fusion+ audit index](https://github.com/1inch/1inch-audits)
- [Relay quickstart](https://docs.relay.link/references/api/quickstart) and [swap model](https://docs.relay.link/use-cases/cross-chain-swaps)
- [CoW Protocol documentation](https://docs.cow.fi/)
- [Across API reference](https://docs.across.to/api-reference)
- [Across: cross-chain intents](https://docs.across.to/guides/concepts/crosschain-intents) and [Embedded Actions](https://docs.across.to/introduction/embedded-actions)
- [OKX DEX Intent: create order](https://web3.okx.com/zh-hans/onchainos/dev-docs/trade/dex-intent-create-order)
