# X Layer-native x402 provider landscape

Snapshot: 21 August 2026. Only official X Layer/OKX sources, the official x402
specification surface, and live merchant-owned payment challenges were used. No
payment authorization was signed or submitted.

## Recommendation

Use the **OKX Onchain OS x402 facilitator and X Layer USD₮0**, and make the
official **OKLink Onchain Data Explorer** the first production canary merchant.
This is no longer merely protocol-level compatibility:

- OKX operates an authenticated production facilitator at
  `https://web3.okx.com/api/v6/pay/x402`, with `/supported`, `/verify`,
  `/settle`, and `/settle/status` routes.
- The facilitator explicitly supports X Layer mainnet `eip155:196`. The
  documented one-time schemes are `exact` with EIP-3009 and `exact` with
  Permit2; the supported response also advertises `aggr_deferred` and `upto`.
- OKX's current payment page documents X Layer payment assets USDG
  `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8`, USDC
  `0xb6ceceab302e2e4948951ee7843fc24e92933061`, and USD₮0
  `0x779ded0c9e1022225f8e0630b35a9b54be713736`.
- A live unauthenticated request to OKLink's protected contract-source endpoint
  returned HTTP `402` with x402 v2 `exact` and `aggr_deferred` offers on
  `eip155:196`, both denominated in USD₮0. This proves a reachable mainnet
  merchant, not just SDK support.

For Cobia's current browser-wallet flow, select only the `exact` EIP-3009 offer.
It preserves one bounded signature and avoids adding OKX Agentic Wallet's batch
session-key model. Before enabling **Review and buy**, read the connected
wallet's balance for the challenge's exact network and asset; if it is below
`amount`, show the deficit and do not create an authorization.

Sources: [OKX Payments HTTP API](https://web3.okx.com/onchainos/dev-docs/payments/api-http-onetime),
[OKX supported networks and assets](https://web3.okx.com/onchainos/dev-docs/payments/supported-networks),
[official OKX Payments SDK](https://github.com/okx/payments),
[x402 network and token model](https://docs.x402.org/core-concepts/network-and-token-support).

The facilitator's `/supported` route is live: an unauthenticated read returned
HTTP `401` with OKX code `50103` (`OK-ACCESS-KEY` missing), rather than a missing
route. Its successful response requires OKX HMAC API credentials. Cobia should
therefore treat an authenticated `/supported` response and the merchant's fresh
challenge as runtime truth, rather than hard-coding a stale token list. Native
OKB is the X Layer gas token; it is not listed as an x402 settlement asset by
the current OKX Payments documentation. Source:
[official X Layer overview](https://web3.okx.com/xlayer).

## Best live canary: OKLink Onchain Data Explorer

Official marketplace entry:
[OKLink Onchain Data Explorer](https://www.okx.ai/agents/2023).

Protected resource:
`POST https://www.oklink.com/api/v5/explorer/mcp/x402/get_contract_source`

The live challenge observed at `2026-08-21T08:21:56Z` contained:

| Field | Value |
| --- | --- |
| x402 version | `2` |
| schemes | `exact`, `aggr_deferred` |
| network | `eip155:196` |
| asset | USD₮0 `0x779ded0c9e1022225f8e0630b35a9b54be713736` |
| amount | `20000` atomic (`0.02` at the SDK's six-decimal default) |
| payee | `0xa7e37604ebab94408159e405033a455f820fd987` |
| transfer method | `eip3009` |
| maximum timeout | `86400` seconds |

The endpoint is HTTPS, returned both the `PAYMENT-REQUIRED` header and matching
JSON body, and exposed that header through CORS. This is a stronger Cobia
candidate than the prior Base merchant because it uses the canary wallet's
intended chain and stablecoin ecosystem. The payment challenge still is not
proof of delivery; Cobia should retain its resource-response and independent
settlement-evidence boundary.

Read-only reproduction:

```bash
curl -i -X POST \
  https://www.oklink.com/api/v5/explorer/mcp/x402/get_contract_source \
  -H 'content-type: application/json' \
  --data '{"chainIndex":"196","address":"0x779ded0c9e1022225f8e0630b35a9b54be713736"}'
```

Sources: [official OKX.AI merchant listing](https://www.okx.ai/agents/2023),
[live protected resource](https://www.oklink.com/api/v5/explorer/mcp/x402/get_contract_source),
[OKX buyer flow and settlement boundary](https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer).

## Additional live marketplace option

The merchant-owned Ethy Score endpoint also returned a live HTTP `402` at
`2026-08-21T08:21:57Z`:

`GET https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736`

Its challenge advertised x402 v2 `exact`, network `eip155:196`, USD₮0, amount
`100000` atomic, payee `0xe8067e3c72f18054de14e4950480c093156130f8`,
and a 300-second timeout. OKX.AI lists the service as an X Layer-native paid
token score. It is a viable second canary, but OKLink is preferable for the
first integration because the merchant itself is operated by an OKX team.

Sources: [official OKX.AI Ethy listing](https://www.okx.ai/agents/1851),
[live Ethy protected resource](https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736).

## What does not qualify

- The generic x402 standard can represent any EVM chain as
  `eip155:<chainId>`, but facilitators must explicitly support each
  scheme/network pair. Representation alone is not X Layer production support.
- The default public x402.org facilitator is documented for testnets, not X
  Layer mainnet. Self-hosting is technically possible, but unnecessary now that
  OKX exposes a chain-196 production facilitator.
- OKX's official Mock Merchant is a useful end-to-end test target, but it is
  deployed on X Layer testnet `eip155:1952`; it is not a mainnet merchant.
- An OKX.AI listing is discovery evidence. Admission still requires a fresh
  HTTPS challenge and exact field validation. For example, the inspected xbird
  listing claimed Base and X Layer support while its listed Railway endpoint
  returned HTTP `404` during this snapshot.

Sources: [x402 network and facilitator distinction](https://docs.x402.org/core-concepts/network-and-token-support),
[OKX Mock Merchant guide](https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer),
[official OKX.AI marketplace](https://www.okx.ai/agents).

## Integration boundary

The shortest production path is therefore:

1. Admit the live OKLink offer with exact URL, method, request body, network,
   asset, amount, payee, scheme, token identity, and expiry/timeout pinned.
2. Preflight the connected address on chain `196` for the challenge asset and
   reject before signing when `balance < amount`.
3. Sign only `exact` EIP-3009 in the browser, replay once, and reconcile its
   nonce before allowing another attempt.
4. Require the merchant response plus an independently verified X Layer
   settlement transaction; do not equate payment with response correctness.

OKX currently describes X Layer USDG/USDC/USD₮0 payments as gas-free for a
limited time. Treat that as a provider promotion, not a permanent protocol
guarantee; the balance gate must still check the payment token, and UI copy must
not imply that every X Layer x402 route will remain gasless.
