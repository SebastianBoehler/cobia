# x402 mainnet offer evidence

Verified: `2026-08-20T06:45:37Z`

Status: **blocked — no production merchant entry admitted**

## Candidate inspected

The current public [OKX.AI agent catalog](https://www.okx.ai/agents) exposed
PixelBrief (`agent 5421`) as the highest `Total Sold` item in the page snapshot
inspected during this review: `21,717`, with a displayed starting price of
`0.02 USDT`. This is a point-in-time catalog observation, not an all-time or
global sales ranking.

Its payment challenge described an X Layer x402 payment with these fields:

- network: `eip155:196`;
- asset: USDt0 `0x779ded0c9e1022225f8e0630b35a9b54be713736`;
- amount: `20,000` atomic units (`0.02` USDt0 at six decimals); and
- payee: `0xe7bbb197827048ba8fa7e908ec871b80568dbc25`.

Those fields are discovery evidence only. They do not establish the merchant's
product commitment, facilitator behavior, receipt semantics, or continuing
offer validity.

## Blocking result

The advertised paid resource URL was plain HTTP. Cobia requires an exact HTTPS
resource and facilitator route before the wallet may expose an authorization.
It also requires a verifier-owned manifest entry binding the live challenge,
payee, asset, amount, product commitment, token EIP-3009 identity, facilitator,
and immediate onchain evidence.

PixelBrief therefore returns the release blocker
`COMMERCE_RESOURCE_NOT_HTTPS`. The production manifest remains empty in
`apps/web/lib/commerce/production-manifest.ts`. Cobia did not send a payment,
sign an authorization, or weaken transport and evidence rules for the demo.

## Activation rule

One offer may be registered only after a fresh read proves all of the following:

1. the resource and facilitator endpoints are HTTPS and pass the existing DNS,
   redirect, response-size, content-type, and timeout policy;
2. the x402 challenge is fresh and binds X Layer mainnet `196`, the exact asset,
   amount, payee, and resource;
3. USDt0 name/version/domain and EIP-3009 authorization semantics match the
   verifier-owned token identity;
4. the product or service commitment and immediate receipt evidence are explicit;
5. a tiny user-approved authorization reproduces locally and the browser still
   performs the only principal signature; and
6. an independent chain read verifies payment settlement without claiming
   shipping, future fulfillment, refunds, or merchant quality.

Until then, OKX.AI offers are discoverable research inputs, not executable Cobia
programs.
