# X Layer protocol integration boundary

Snapshot: 11 August 2026. Technical claims below use official source trees,
deployment registries, and block-pinned X Layer reads. A deployed contract or
read adapter is not, by itself, an executable Cobia route.

## Current truth

| Surface | State | Authority and limit |
| --- | --- | --- |
| OKX Aave product discovery | Live in the product | Off-chain OKX estimates captured between X Layer block reads; the block references do not attest the API rate or TVL |
| Aave reserve/oracle reader | Live V2 quote input | Direct mainnet reads at one pinned number/hash/timestamp; proxy implementations and amount-specific supply-cap arithmetic are checked |
| Uniswap USDG/USDt0 quoter | Live V2 quote input | Factory-derived 0.01% pool and QuoterV2 response at the same pinned block; quote identity and exact input are committed |
| Portfolio token and aToken balances | Live in the product | Direct mainnet ERC-20 reads; testnet assets are payment rehearsal only |
| V1 solver | Live in the product | One deterministic cash/Aave allocation over OKX discovery data; no independent solver competition |
| V2 policy, snapshot, plan, quote, and purchase | Live product path | Persisted versioned artifacts; one exact deployed leg at most; estimated pre-gas economics only |
| MPP/EIP-3009 reveal payment | Implemented for fixed chain 1952 lane | Pays for the private bundle, not principal execution; a funded receipt-correlation canary is still required |
| Aave/Uniswap transaction engine | Unit-tested and fork-rehearsed, product-unwired | Exact approvals, SwapRouter02/Aave calldata, receipt attribution, protocol events, postconditions, and resumable states; no UI/DB integration or live principal execution |
| Product route simulation | Unimplemented | Gas estimation is not simulation; the isolated pinned-fork engine rehearsal is not a product simulation endpoint |
| AI route or risk authority | Unimplemented | MCP access is agent-friendly, but it is not itself a meaningful AI feature |

Production code has no sample protocol, fallback APY, or fabricated route. Unit
tests use deterministic read/wallet clients; each explicit database integration
suite (or standalone migration test) owns a disposable PostgreSQL 16 container.
Those test doubles are not product data. The opt-in fork lane uses a
digest-pinned Foundry/Anvil container at X Layer block `67,649,362` and is green
for capture and authorization, exact USDG approval, Uniswap USDG-to-USDt0, exact
USDt0 approval, and Aave supply with receipt, event, and state checks. It is
isolated engine evidence, not product simulation, persisted/product execution,
live mainnet principal execution, or deployment proof.

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
| Uniswap V3 | Factory | `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` |
| Uniswap V3 | QuoterV2 | `0xD1b797D92d87B688193A2B976eFc8D577D204343` |
| Uniswap V3 | SwapRouter02 | `0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA` |
| Uniswap V3 | USDG/USDt0 0.01% pool | `0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA` |

At block `67,649,362`, both Aave reserves were active, unfrozen, and
unpaused. At nearby fixed blocks, the Uniswap pool had nonzero liquidity and
quoted both directions. These observations are historical evidence, not a
fresh execution guarantee. No authoritative Aave or Uniswap deployment was
found for X Layer testnet chain 1952.

## Integration choice matrix

Scores are 1 (weak) to 5 (strong). “Trust” scores a smaller external trust
surface higher.

| Candidate | Maintenance | Trust | Cost / latency | Testability | Contract verification | License | Decision and principal failure modes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Aave V3 via viem + minimal ABI | 5 | 5 | 5 | 5 | 5 | MIT source | **Use.** Fail closed on chain/hash/implementation change, reserve pause/freeze, identity mismatch, cap headroom, stale block, RPC failure, gas-estimation failure, or transaction revert |
| Aave Kit / React surface | 4 | 3 | 3 | 3 | 4 | Open source | Defer. Current official surface is V4/API-oriented and does not establish X Layer V3 support |
| Deprecated Aave contract helpers | 1 | 3 | 3 | 3 | 4 | Open source | Reject; the official utilities repository is archived |
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
2. Uniswap V3 exact-input with a signed slippage ceiling and owner recipient;
3. owner-originated Aave supply with the position credited to the owner;
4. current authority, deployment identity, freshness, and gas estimation before
   each wallet submission;
5. attributed transaction/receipt and protocol events plus bounded position
   telemetry after confirmation;
6. structured pending/partial/failed checkpoints rather than blind retries.

The library is not yet a product execution surface. Injected-wallet approval and
Aave supply have no on-chain Cobia deadline, so a wallet confirmation left open
past expiry cannot be made atomic without an executor contract or account-level
validity window. The isolated mainnet-fork engine rehearsal is implemented and
green; persisted checkpoint authority, product wiring and UI approval, and a
capped live canary remain release gates.

Reproduce the opt-in rehearsal from the repository root:

```bash
pnpm --filter @cobia/web test:fork
```

It requires a running Docker-compatible container runtime and outbound access
to `ghcr.io` for the digest-pinned Foundry/Anvil image and
`https://rpc.xlayer.tech` for the pinned fork state.

A generic executor cannot withdraw a user's Aave position: `withdraw` burns the
caller's aTokens. Custody, delegated withdrawal, arbitrary calls, unlimited
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
- [Uniswap V3 X Layer deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments)
- [Uniswap QuoterV2](https://github.com/Uniswap/v3-periphery/blob/main/contracts/lens/QuoterV2.sol)
- [Uniswap SwapRouter02 interface](https://github.com/Uniswap/swap-router-contracts/blob/v1.1.0/contracts/interfaces/ISwapRouter02.sol)
- [OKX DEX quote API](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote)
- [OKX DEX swap API](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap)
- [OKX DEX contract boundary](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract)
- [Open Intents Framework](https://docs.openintents.xyz/)
- [LI.FI Intents](https://docs.li.fi/lifi-intents/introduction)
- [ERC-7683](https://eips.ethereum.org/EIPS/eip-7683)
- [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612)
- [ERC-3009](https://github.com/ethereum/ERCs/blob/master/ERCS/erc-3009.md)
