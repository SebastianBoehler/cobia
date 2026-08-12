# X Layer protocol integration boundary

Snapshot: 11 August 2026. Technical claims below use official source trees,
deployment registries, and block-pinned X Layer reads. A deployed contract or
read adapter is not, by itself, an executable Cobia route.

## Current truth

| Surface | State | Authority and limit |
| --- | --- | --- |
| OKX Aave product discovery | Live in the product | Off-chain OKX estimates captured between X Layer block reads; the block references do not attest the API rate or TVL |
| Aave reserve/oracle reader | Live V2 quote input | Direct mainnet reads at one pinned number/hash/timestamp; proxy implementations and amount-specific supply-cap arithmetic are checked |
| Curve USDG/USDt0 swap reader | Live V2 quote input | Factory-owned StableSwap NG pool, exact token indices, balances, fee, amplification, virtual price, implementation and exact-input output at the pinned block |
| Uniswap USDG/USDt0 swap and LP readers | Live V2 quote input | Factory-derived 0.01% pool and QuoterV2 response at the pinned snapshot block; full-range LP capture also pins a historical block, fee-growth deltas, pool balances, exact desired amounts, and minimum liquidity |
| Portfolio token and aToken balances | Live in the product | Direct X Layer mainnet ERC-20 reads |
| V1 solver | Live in the product | One deterministic cash/Aave allocation over OKX discovery data; no independent solver competition |
| V2 policy, snapshot, plan, quote, and purchase | Live product path | Persisted versioned artifacts; one exact conserved leg containing Aave supply, Curve/Uniswap swap-to-Aave, or balance-swap plus full-range LP mint; estimated pre-gas economics only |
| MPP/EIP-3009 reveal payment | Implemented for fixed chain 196 USDt0 lane | Pays for the private bundle, not principal execution; a funded receipt-correlation canary is still required |
| Aave/Curve/Uniswap transaction engine | Unit/fork-tested and product-wired for verified stepwise mainnet execution | Exact approvals, Curve exchange/SwapRouter02/Aave/position-manager calldata, receipt attribution, protocol events, owner-held LP NFT and state postconditions; one explicit buyer-wallet confirmation per transaction |
| Purchased-route fork rehearsal | Product-visible and persisted | Buyer proof replays the exact V2 bundle at its committed snapshot block with simulated funds; historical evidence, not current-state simulation |
| Verified purchased-route execution | Product-visible for fresh rehearsed V2 routes | Durable one-step chain-196 attempts, buyer-bound short-lived authorization, local calldata verification, recovery by exact nonce/calldata, and no automatic follow-on transaction |
| Capped atomic executor beta | Contract and projection tests only | Starts paused, limits selected wallets and cumulative principal, and enforces verifier-signed route/output commitments; it is not deployed or product-wired |
| Bounded agentic solver | Live V2 quote input | OpenAI selects only among server-built candidates; it cannot invent assets, amounts, contracts, or calldata, and the normal verifier remains authoritative |

Production code has no sample protocol, fallback APY, or fabricated route. Unit
tests use deterministic read/wallet clients; each explicit database integration
suite (or standalone migration test) owns a disposable PostgreSQL 16 container.
Those test doubles are not product data. The opt-in acceptance lane and the
buyer-authenticated product action use a digest-pinned Foundry/Anvil runtime.
Each product rehearsal forks the purchased snapshot block, funds only the exact
principal in isolated state, executes the committed route, and persists its
attributed trace. This is historical engine evidence, not a current-state,
profitability, live-mainnet, or deployment guarantee.

## Guarantee classes for broader intents

Every future adapter must separate three kinds of output instead of presenting
all strategy fields as equally enforceable:

1. **Signed constraints** — assets, spend caps, adapters, slippage, deadlines,
   pool fee/range, and recipient are committed before solver execution.
2. **Immediate postconditions** — simulation and receipts can verify minimum
   swap output, liquidity or shares minted, position ownership, protocol events,
   and that no unexpected call or approval occurred.
3. **Forecasts** — APY, LP trading fees, utilization, rewards, impermanent loss,
   and future token prices are estimates. They may be block-bounded and sourced,
   but simulation cannot guarantee their future lower bound.

The target solver input is a server-enumerated typed route graph. An agentic
solver may compose swaps, lending, LP positions, and conserved splits; a
deterministic compiler resolves each action through a registered adapter and
checks the final enforceable outcome. It never accepts model-authored calldata.
The current V2 implementation remains narrower: one conserved leg containing
direct Aave supply, Curve or Uniswap swap followed by Aave supply, or a one-sided balance
swap followed by a fixed full-range Uniswap mint. It does not perform arbitrary
range selection. Fee collection, rebalancing, liquidity removal, and exits
remain unimplemented; the position NFT stays in the request owner's wallet.

## Verified X Layer mainnet deployments

The registry commits these chain-196 identities. Runtime and proxy
implementation hashes must be rechecked at the route block because Aave assets
and Pool contracts are upgradeable.

| Protocol | Component | Address |
| --- | --- | --- |
| Aave V3 | PoolAddressesProvider | `0xdFf435BCcf782f11187D3a4454d96702eD78e092` |
| Aave V3 | Pool | `0xE3F3Caefdd7180F884c01E57f65Df979Af84f116` |
| Aave V3 | ProtocolDataProvider | `0x6C505C31714f14e8af2A03633EB2Cdfb4959138F` |
| Aave V3 | Oracle | `0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6` |
| Aave V3 | USDG / aUSDG | `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8` / `0x228765a3C18065C923F23a0CCb6c7cEFB3eA2223` |
| Aave V3 | USDt0 / aUSDt0 | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` / `0xF356ae412dB5df43BD3a10746f7ad4e1C4De4297` |
| Curve StableSwap NG | Factory | `0x5eeE3091f747E60a045a2E715a4c71e600e31F6E` |
| Curve StableSwap NG | Views | `0x506F594ceb4E33F5161139bAe3Ee911014df9f7f` |
| Curve StableSwap NG | Plain implementation | `0x87FE17697D0f14A222e8bEf386a0860eCffDD617` |
| Curve StableSwap NG | USDG/USDt0 pool | `0x31F066aA0A687d4F383F96a514984AF727Eb8e38` |
| Uniswap V3 | Factory | `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` |
| Uniswap V3 | QuoterV2 | `0xD1b797D92d87B688193A2B976eFc8D577D204343` |
| Uniswap V3 | SwapRouter02 | `0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA` |
| Uniswap V3 | NonfungiblePositionManager | `0x315e413A11AB0df498eF83873012430ca36638Ae` |
| Uniswap V3 | USDG/USDt0 0.01% pool | `0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA` |

At block `67,649,362`, both Aave reserves were active, unfrozen, and
unpaused. The Curve and Uniswap pools had nonzero liquidity and quoted both
directions. These observations are historical evidence, not a fresh execution
guarantee. No authoritative Aave, Curve, or Uniswap deployment was
found for X Layer testnet chain 1952.

## Integration choice matrix

Scores are 1 (weak) to 5 (strong). “Trust” scores a smaller external trust
surface higher.

| Candidate | Maintenance | Trust | Cost / latency | Testability | Contract verification | License | Decision and principal failure modes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Aave V3 via viem + minimal ABI | 5 | 5 | 5 | 5 | 5 | MIT source | **Use.** Fail closed on chain/hash/implementation change, reserve pause/freeze, identity mismatch, cap headroom, stale block, RPC failure, gas-estimation failure, or transaction revert |
| Aave Kit / React surface | 4 | 3 | 3 | 3 | 4 | Open source | Defer. Current official surface is V4/API-oriented and does not establish X Layer V3 support |
| Deprecated Aave contract helpers | 1 | 3 | 3 | 3 | 4 | Open source | Reject; the official utilities repository is archived |
| Curve StableSwap NG via viem + minimal ABI | 4 | 5 | 5 | 5 | 5 | Curve source | **Use.** Pin factory, implementation, pool and token identities; reject index/fee/liquidity/output mismatch, stale block, RPC failure, event mismatch, or transaction revert |
| Uniswap V3 via viem + minimal ABI | 5 | 5 | 5 | 5 | 5 | GPL/MIT protocol sources | **Use.** Factory-resolve the pool; reject code/fee/token/liquidity/lock changes, stale minimum output, RPC failure, gas-estimation failure, or transaction revert |
| Official Uniswap V3 SDK | 5 | 4 | 3 | 4 | 5 | MIT | Useful later for multi-tick/path math; unnecessary for one direct registered pool |
| Uniswap Smart Order Router | 5 | 3 | 2 | 3 | 5 | GPL-3.0 | Defer; materially larger dependency and routing/configuration surface |
| OKX Trade API + local validation | 4 | 2 | 3 | 3 | 2 | Hosted API | Later aggregate adapter. Router rotation, opaque calldata, API freshness, auth/rate limits, and undecodable selectors must fail closed |
| OKX DEX SDK | 2 | 2 | 2 | 2 | 2 | MIT | Do not add now; multi-chain wallet stacks add more risk than signed REST plus Zod validation |

For an OKX aggregate adapter, use `/quote` for comparison and `/swap` only
after independently checking chain, tokens, exact input, output bound,
slippage, target code, selector, recipient, approval, and deadline. Hash the
exact response and simulate locally. It must be a distinct adapter, never a
silent fallback for the direct Uniswap reader.

## Execution boundary

Solvers may reference only `adapterId + opportunityId`. They never choose a
target, recipient, selector, approval, or calldata. The server registry resolves
those fields after authorization and freshness checks.

The transaction library is deliberately narrow:

1. owner-originated exact approval or a token-specific verified permit;
2. Curve StableSwap NG or Uniswap V3 exact-input with a signed minimum output and owner recipient;
3. owner-originated Aave supply with the position credited to the owner;
4. one-sided full-range LP entry using an exact balance swap, two exact
   position-manager approvals, a signed liquidity floor, and owner NFT recipient;
5. current authority, deployment identity, freshness, and gas estimation before
   each wallet submission;
6. attributed transaction/receipt and protocol events plus bounded position
   telemetry after confirmation;
7. structured pending/partial/failed checkpoints rather than blind retries.

The product uses the library for both disposable fork rehearsal and verified stepwise
chain-196 wallet execution. Mainnet execution requires the exact purchased
bundle, a matching passed rehearsal, fresh deterministic authorization, current
registry/deployment identity, sufficient token and buffered OKB gas balances,
and a short-lived buyer proof. The browser independently rebuilds the prepared
transaction before `eth_sendTransaction`; the server stores the submitted hash
before resolving its canonical receipt, events, and postconditions. It never
accepts caller-authored calldata, relays transactions, or automatically sends a
follow-on step.

Injected-wallet approvals, Curve exchange, and Aave supply have no on-chain Cobia deadline, so
a wallet confirmation left open past expiry cannot be made atomic without an
executor contract or account-level validity window. The UI instructs the buyer
to reject stale prompts. A capped live canary remains operational deployment
evidence, not a prerequisite for the implementation claim.

Reproduce the opt-in rehearsal from the repository root:

```bash
pnpm --filter @cobia/web test:fork
```

It requires a running Docker-compatible container runtime and outbound access
to `ghcr.io` for the digest-pinned Foundry/Anvil image and
`https://rpc.xlayer.tech` for the pinned fork state.

A generic executor cannot withdraw a user's Aave position: `withdraw` burns the
caller's aTokens. It also cannot operate an LP NFT without a separately verified
owner-approved exit design. Custody, delegated withdrawal, arbitrary calls, unlimited
approvals, and automatic Permit2/account-abstraction paths remain out of scope.
USDt0 advertises ERC-2612 and ERC-3009 behavior, but its ERC-5267 discovery call
reverts; a permit path must recompute and compare its exact domain separator.
Token support is verified per asset, never inferred from an interface name.

## Intent and solver standards

| Standard/product | Current use | Boundary |
| --- | --- | --- |
| Open Intents Framework | Architecture reference | Cobia does not implement OIF order, solver, settlement, or fulfilment APIs |
| LI.FI Intents and MCP | Product/agent inspiration | Cross-chain settlement is not copied into this same-chain X Layer flow |
| ERC-7683 | Future interoperability reference | Not applicable until Cobia has a compatible settlement contract/order lifecycle; no compliance claim |
| ERC-2612 | Asset-specific approval option | Use only after exact token domain/signature verification |
| Permit2 | Officially deployed with Uniswap | Deferred; it adds an approval and signature trust boundary that one direct route does not need |
| Account abstraction | Future wallet UX option | Deferred until specific wallet/account contracts and signature behavior are tested |

## Primary sources

- [Aave X Layer address book, fixed revision](https://github.com/aave-dao/aave-address-book/blob/70e2f303fe93616784148d6827df6644e5dda4db/src/AaveV3XLayer.sol)
- [Aave V3 Pool interface](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IPool.sol)
- [Aave V3 data-provider interface](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IPoolDataProvider.sol)
- [Curve StableSwap NG source, fixed revision](https://github.com/curvefi/stableswap-ng/tree/2abe778f40206a6c0fd108a0a53ad3266cbedeee)
- [Uniswap V3 X Layer deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments)
- [Uniswap QuoterV2](https://github.com/Uniswap/v3-periphery/blob/main/contracts/lens/QuoterV2.sol)
- [Uniswap SwapRouter02 interface](https://github.com/Uniswap/swap-router-contracts/blob/v1.1.0/contracts/interfaces/ISwapRouter02.sol)
- [Uniswap V3 NonfungiblePositionManager interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol)
- [OKX DEX quote API](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote)
- [OKX DEX swap API](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap)
- [OKX DEX contract boundary](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract)
- [Open Intents Framework](https://docs.openintents.xyz/)
- [LI.FI Intents](https://docs.li.fi/lifi-intents/introduction)
- [ERC-7683](https://eips.ethereum.org/EIPS/eip-7683)
- [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612)
- [ERC-3009](https://github.com/ethereum/ERCs/blob/master/ERCS/erc-3009.md)
