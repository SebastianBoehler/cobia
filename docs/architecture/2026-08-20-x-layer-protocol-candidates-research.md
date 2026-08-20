# X Layer protocol integration candidates

Snapshot: 20 August 2026. Rayo was used only to enumerate candidates. Every
integration claim below is based on the protocol's official documentation,
official source repository, first-party API, or a block-pinned X Layer RPC read.

## Recommendation

Do not add OpenOcean as an X Layer integration now. Its current official V4 API
does not support chain `196`, and the live endpoint rejects both `196` and
`xlayer`.

The most useful next integration is **QuickSwap/Algebra as a solver tool that
emits an `evm.raw@1` exact-call program**. This widens route discovery without
granting a new Executor capability. Promote it to a semantic verifier module
only after Cobia pins a specific liquid pool and asset pair.

**DODO SmartTrade** is the best hosted-aggregator follow-up, but it requires a
Developer Portal API key and provider-specific response validation. **XSwap
(iZiSwap)** has clean official deployment and SDK evidence but its relevant
X Layer pools were empty at the sampled block. **Orbiter** is useful only as a
separate asynchronous bridge lane.

## Cobia integration boundaries

Cobia already has three distinct integration shapes:

1. **Solver tool + `evm.raw@1`**: the solver chooses and constructs exact wallet
   calls. Cobia pins target code identity, approvals, asset deltas, outcome
   bounds, gas, and a fresh fork replay. This is the narrowest path for a new
   protocol and does not add Executor authority.
2. **Provider-specific wallet verifier**: needed when a hosted API returns
   opaque or dynamic calldata. The existing OKX and LI.FI verifiers show the
   required shape: commit request/response, verify sender, recipient, tokens,
   amounts, slippage, target, selector, approval spender, code identity, and
   replayed state deltas.
3. **Semantic capability module**: Cobia owns calldata compilation and pins the
   protocol deployment and semantics. This is appropriate only for a known,
   liquid pair whose router and pool behavior justify ongoing registry support.

The generic open-program verifier already enforces the user's input and output
policy from replayed balance deltas. A solver plugin therefore does not need a
new onchain deployment, Safe transaction, or registry delay merely to compete
through `evm.raw@1`.

## Ranked candidates

### 1. QuickSwap / Algebra — implement first as a raw solver tool

**Official evidence**

- QuickSwap documents X Layer as a supported network and publishes its X Layer
  Algebra factory, quoter, swap router, position manager, and multicall
  addresses. The factory is `0xd2480162Aa7F02Ead7BF4C127465446150D58452`,
  quoter `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`, and router
  `0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57`.
- QuickSwap's official explanation of exact-input execution requires a quoted
  output reduced by the user's slippage bound before it becomes
  `amountOutMin`.
- At X Layer block `68,476,938` (hash
  `0x3f3bae45648a13f289a90fd2fe7b820054fed743c8c6e745303f6053e079adf8`),
  the official factory resolved nonzero WOKB/USDC and WOKB/USDT pools, with
  current in-range liquidity `780072484772` and `867376906654` respectively.
  The USDt0/WOKB pool existed but reported zero current in-range liquidity.

**Narrow implementation**

- Add a broker-free solver tool such as `quickswap.algebra@1`.
- Read the official factory and quoter at the intent's pinned X Layer block.
- Resolve the pool from the requested tokens; reject zero code, mismatched pool
  tokens, zero liquidity, failed quote, or an output below policy.
- Build one exact-input router call with the owner as recipient and a signed
  minimum output. Approve only the exact input amount to the pinned router.
- Emit the transaction through `evm.raw@1`; let Cobia independently re-read
  runtime identities, replay it, and enforce complete owner asset deltas.

**Why not a semantic module yet**

The current Cobia semantic registry is centered on USDG/USDt0. QuickSwap has
liquidity for legacy USDC/USDT pairs, but the sampled USDt0/WOKB pool was empty.
A semantic module should be added only with a demonstrably liquid target pair,
not merely because the deployment exists.

Sources: [QuickSwap supported chains](https://docs.quickswap.exchange/networks-and-wallets/supported-chains),
[QuickSwap contracts and addresses](https://docs.quickswap.exchange/overview/contracts-and-addresses),
[QuickSwap exact-input pricing guidance](https://docs.quickswap.exchange/technical-reference/advanced-topics/pricing),
[X Layer mainnet RPC](https://rpc.xlayer.tech).

### 2. DODO SmartTrade — provider plugin after obtaining an API key

**Official evidence**

- DODO's SmartTrade API accepts chain `196`, exact token addresses and atomic
  input amount, and returns route calldata.
- Its response exposes `targetApproveAddr`, transaction `to`, transaction
  `data`, source breakdown, expected output, price impact, and route details.
- DODO publishes X Layer approval, helper, factory, adapter, and proxy
  deployments. The documented `DODOApproveProxy` is
  `0xfbdEb92D8133cf35633eE2D40Be561476268DcFC` and `DODOV2Proxy02` is
  `0x7Ad992fcebd899ddbEF7f031dCF96f382b81ECea`.
- API access requires registration in DODO's Developer Portal.

**Narrow implementation**

- Add a credential-isolated `dodo.smart-route@1` broker tool.
- Normalize the request and full response into a committed provider artifact.
- Implement a DODO-specific verifier beside the current OKX verifier. It must
  validate the exact input, minimum output, recipient, approval target, router,
  selector, route expiry, code hashes, and complete replayed asset deltas.
- Continue emitting the authorized calls as a wallet transaction; do not grant
  DODO a general Executor capability.

**Blocker**

This is not zero-setup: Cobia needs a DODO API key, secret handling, rate-limit
behavior, and a fresh live quote/fork canary before advertising it.

Sources: [DODO SmartTrade API](https://docs.dodoex.io/en/developer/developers-portal/api/smart-trade/api),
[DODO response fields](https://docs.dodoex.io/en/developer/developers-portal/api/smart-trade/response),
[DODO X Layer contracts](https://docs.dodoex.io/en/developer/contracts/dodo-v1-v2/contracts-address/x-layer).

### 3. XSwap / iZiSwap — technically clean, currently poor demo value

**Official evidence**

- iZUMi documents XSwap on X Layer chain `196`, including factory
  `0xBf8F8Ef2d2a534773c61682Ea7cF5323a324B188`, quoter
  `0xAC9788cfea201950dB91d7db6F28C448CF3A4B29`, limited quoter
  `0x93C22Fbeff4448F2fb6e432579b0638838Ff9581`, and swap router
  `0xd7de110Bd452AAB96608ac3750c3730A17993DE0`.
- Its official SDK supports exact-input quoting and constructing a bounded swap
  call, including fee-tier selection and `minOutputAmount`.
- At the sampled X Layer block, the official factory resolved WOKB/USDT and
  WOKB/USDt0 fee-tier pools, but their current liquidity was zero; a 10 USDt0
  quote reverted with `PR`.

**Decision**

Defer. The code path is suitable for the same `evm.raw@1` tool shape as
QuickSwap and could later become a semantic adapter, but integrating an empty
route adds surface without an executable competition candidate. Recheck
liquidity before implementation.

Sources: [iZiSwap X Layer deployments](https://developer.izumi.finance/iZiSwap/deployed_contracts/mainnet),
[iZiSwap exact-input SDK flow](https://developer.izumi.finance/iZiSwap/SDK/examples/quoter_and_swap/quoter_swap_chain_with_exact_input),
[iZiSwap official periphery source](https://github.com/izumiFinance/iZiSwap-periphery),
[X Layer mainnet RPC](https://rpc.xlayer.tech).

### 4. Orbiter Finance — separate asynchronous bridge tool

**Official evidence**

- Orbiter lists X Layer chain `196` as supported.
- Its official deployment table assigns X Layer router
  `0x13e46b2a3f8512ed4682a8fb8b560589fe3c2172`.
- Orbiter exposes a REST API with X Layer chain metadata.

**Narrow implementation**

Add `orbiter.routes@1` only if Cobia needs bridge diversity beyond LI.FI. Model
it as an asynchronous transfer stage with destination-chain delivery evidence,
not as a same-chain atomic program. A source-chain replay can verify initiation
but cannot prove later destination delivery.

Sources: [Orbiter supported chains](https://docs.orbiter.finance/supported-chains),
[Orbiter contracts](https://docs.orbiter.finance/developer/smart-contract),
[Orbiter REST API](https://docs.orbiter.finance/developer/rest-api/api-reference).

### OpenOcean — do not integrate for X Layer mainnet

Rayo currently lists OpenOcean under X Layer, but OpenOcean's authoritative
surface does not support mainnet chain `196`:

- The current supported-chain documentation does not list X Layer.
- On 20 August 2026, both
  `GET https://open-api.openocean.finance/v4/196/tokenList` and the equivalent
  `/quote` request returned HTTP `400` and a supported-chain list that omitted
  `196`. The `xlayer` alias was rejected identically.
- The same response still included chain `195`, which DODO and X Layer sources
  identify as the X1/X Layer testnet; testnet support is not mainnet support.

Do not build a plugin, display OpenOcean as supported, or accept an OpenOcean
target until its official API and contract registry add chain `196` and a live
quote passes independent pinned replay.

Sources: [OpenOcean supported chains](https://docs.openocean.finance/docs/overview/supported-chains),
[OpenOcean V4 API](https://docs.openocean.finance/docs/swap-api/v4),
[OpenOcean official API endpoint](https://open-api.openocean.finance/v4/196/tokenList).

## Reproducible mainnet observations

The following read-only commands produced the block-pinned observations above:

```bash
cast block-number --rpc-url https://rpc.xlayer.tech
cast block latest --rpc-url https://rpc.xlayer.tech --field hash

# QuickSwap Algebra pool discovery and state
cast call --rpc-url https://rpc.xlayer.tech \
  0xd2480162Aa7F02Ead7BF4C127465446150D58452 \
  'poolByPair(address,address)(address)' TOKEN_A TOKEN_B
cast call --rpc-url https://rpc.xlayer.tech POOL 'token0()(address)'
cast call --rpc-url https://rpc.xlayer.tech POOL 'token1()(address)'
cast call --rpc-url https://rpc.xlayer.tech POOL 'liquidity()(uint128)'

# iZiSwap pool discovery and current state
cast call --rpc-url https://rpc.xlayer.tech \
  0xBf8F8Ef2d2a534773c61682Ea7cF5323a324B188 \
  'pool(address,address,uint24)(address)' TOKEN_A TOKEN_B 500
cast call --rpc-url https://rpc.xlayer.tech POOL \
  'state()(uint160,int24,uint16,uint16,uint16,bool,uint128,uint128)'
```

These are point-in-time observations, not future liquidity guarantees. A real
solver tool must repeat the same checks at the intent's committed block and
abstain when the route is absent, empty, stale, or below the signed minimum.
