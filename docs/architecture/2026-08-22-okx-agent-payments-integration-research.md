# OKX Agent Payments: first X Layer commerce integration

Snapshot: 22 August 2026. This note uses only official OKX/X Layer docs,
official provider repositories, and read-only requests to public endpoints. No
payment was created, signed, submitted, or settled.

## Decision

Build **`commerce.okx-agent-payment@1` as a read-only payment inspector first**.
Given an owner-supplied OKX payment link or `a2a_...` ID, Cobia should fetch the
public payment detail and status, commit the normalized snapshots, and verify a
completed transaction independently on X Layer.

Do not initially expose either mutation:

- `payment/create` is a Seller operation requiring an OKX API key and a
  registered realm. It belongs in a server-only merchant integration, not in a
  browser plugin.
- `credential` submits a spend authorization and causes OKX to broadcast the
  transfer. It must remain behind Cobia's owner-policy, browser-wallet signing,
  and independent-verifier boundary.

This choice provides useful payment details and settlement tracking without
pretending that a payment record is a product order or proof of fulfillment.

Primary sources: [Agent API one-time payment](https://web3.okx.com/onchainos/dev-docs/payments/api-agent-onetime),
[Agent API overview](https://web3.okx.com/onchainos/dev-docs/payments/api-a2a),
[protocol concepts](https://web3.okx.com/onchainos/dev-docs/payments/core-concept).

## What is verified on X Layer

This is native support, not an inference from generic EVM compatibility:

- base URL `https://web3.okx.com`, prefix `/api/v6/pay/a2a`;
- network X Layer `chainId: 196`;
- one-time intent `charge`, method `evm`, authorization `eip-3009`;
- direct Buyer-to-Seller `transferWithAuthorization`; OKX's Broker verifies and
  broadcasts but does not custody the transfer;
- supported assets are USDG
  `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8`, USDC
  `0xb6ceceab302e2e4948951ee7843fc24e92933061`, and USD₮0
  `0x779ded0c9e1022225f8e0630b35a9b54be713736`.

Source: [OKX supported networks and tokens](https://web3.okx.com/onchainos/dev-docs/payments/supported-networks).
The advertised zero gas for those assets is explicitly temporary and must not
become a Cobia invariant.

## Protocol names must stay separate

| Term | Meaning here | Cobia consequence |
| --- | --- | --- |
| x402 `exact` | HTTP Seller returns a 402; Buyer retries the protected resource with an exact payment credential | This is Cobia's current `x402-exact` placement path. |
| MPP `charge` | Machine Payments Protocol EVM challenge/credential wire format | Agent Payments is wire-compatible with it; that does not make an Agent payment an HTTP x402 request. |
| Agent Payments Protocol | OKX's protocol, a strict superset of the MPP EVM wire format | The one-time API uses its `charge` intent and a stateful Broker payment object. |
| A2MCP | Priced HTTP service; challenge transported by an HTTP 402 | x402-like transport initiated by tool invocation. |
| A2A | Seller Agent sends an invoice link/card/QR through a messaging channel | The `/a2a` API and `pay.okx.com` URL use this shape; no protected HTTP resource is retried. |

For one-time payment, the x402 Facilitator and Agent Payments Broker occupy the
same settlement role and use compatible EIP-3009 data. Their orchestration is
different: the x402 Facilitator is a single HTTP round-trip, while the Broker
mints and persists `paymentId`, challenge, and status. Sources:
[Agent Payments Protocol](https://web3.okx.com/onchainos/dev-docs/payments/app),
[core concepts](https://web3.okx.com/onchainos/dev-docs/payments/core-concept),
[official whitepaper](https://web3.okx.com/whitepaper/okx-app-whitepaper.pdf).

## Exact one-time API contract

All documented responses use `{ "code": "0", "msg": "success", "data": ... }`;
business errors use a nonzero string code and `data: null`.

### Seller-only creation

`POST /api/v6/pay/a2a/payment/create`

| Request field | Required | Contract |
| --- | --- | --- |
| `type` | yes | fixed `charge` |
| `amount` | yes | decimal denomination string, for example `"0.1"` |
| `symbol` | yes | `USD₮0`, `USDC`, or `USDG` |
| `recipient` | yes | Seller wallet address |
| `description` | no | payment description |
| `externalId` | no | Seller business ID and idempotency key |
| `expiresIn` | no | seconds; default `1800` |
| `realm` | no | defaults to the Seller's registered realm |
| `deliveries.includeUrl` | no | default `true`; URL is the only phase-one delivery |

Success returns `paymentId`, `pending`, `createdAt`, `expiresAt`, a challenge,
and `https://pay.okx.com/p/{paymentId}`. The challenge—not the decimal create
input—is settlement truth: it carries atomic `amount`, token-address
`currency`, `recipient`, `externalId`, `chainId: 196`, `authorizationType:
eip-3009`, and expiry.

Authentication uses server-held `OK-ACCESS-KEY`, `OK-ACCESS-PASSPHRASE`,
`OK-ACCESS-TIMESTAMP`, and `OK-ACCESS-SIGN`. The signature is Base64 of
HMAC-SHA256 over `timestamp + uppercase method + request path + raw body`;
timestamp skew must stay within 30 seconds. Source:
[OKX Open API authentication](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage).

### Public Buyer reads

`GET /api/v6/pay/a2a/p/{paymentId}` is public. With `Accept: application/json`
it returns `paymentId`, status, creation/expiry times, and the full challenge;
the human browser representation is HTML.

`GET /api/v6/pay/a2a/p/{paymentId}/status` is public. It returns:

- always: `paymentId`, `status`;
- only when completed: `executed.txHash`, `executed.blockNumber`,
  `executed.blockTimestamp`, and optional `fee.amount`/`fee.bps`;
- only when failed: `failure.reason` and `failure.message`.

These are payment data, not order line items, shipping, digital delivery, refund,
return, or dispute state.

### Public but effectful Buyer submission

`POST /api/v6/pay/a2a/p/{paymentId}/credential` requires no API key, but it is
not read-only. It accepts `payload.type: transaction`, a 65-byte EIP-712
signature, and an EIP-3009 authorization with `from`, `to`, `value`,
`validAfter`, `validBefore`, and `nonce`. The Broker retrieves the stored
challenge; `to` and `value` must equal its recipient and atomic amount exactly.
Success returns `settling`, `acceptedAt`, and a tracking URL, then broadcasts.

### Statuses and errors

| Status | Meaning |
| --- | --- |
| `pending` | created; waiting for a credential |
| `settling` | credential accepted; transaction is being broadcast |
| `completed` | on-chain confirmed; funds received |
| `failed` | verification, simulation, or on-chain execution failed |
| `expired` | request expired |

Creation auth errors are `50103`, `50104`, `50105`, `50106`, `50107`, `50111`,
`50112`, and `50113`. Request errors include `50011` (HTTP 429) and `50014`
(HTTP 400). Business errors include `50026`, `81001`, `81004`, `80007`, and MPP
codes `70000`-`70004` (`invalid_params`, `unsupported_chain`, `payer_blocked`,
`invalid_credential`, `invalid_signature`). Parsers must examine the business
code even when HTTP is 200.

## Live public-read finding

At `2026-08-22T19:32:41Z`, read-only requests using the documentation's example
ID confirmed that both public routes are deployed without authentication. They
also exposed wire drift from the written envelope:

- detail returned HTTP 200, numeric `code: 0`, `available: false`, a null
  challenge/status, and `payment_not_found` inside `data`;
- status returned HTTP 200, numeric `code: 70000`, and `data: {}` rather than
  the documented string code and null data.

Therefore normalize `code` from string or safe integer at the provider boundary,
then apply strict status-specific schemas. Do not silently accept arbitrary
extra challenge or authorization fields. Treat `available: false` and any
nonzero normalized code as a typed provider failure. The API documentation
remains the canonical field contract; this observation is a production
compatibility requirement, not permission for a permissive parser.

## Fit with Cobia's persisted placements

Cobia currently commits an immutable offer, policy, program, merchant manifest,
plan, and authorization template in
`apps/web/lib/db/commerce-placement-schema.ts`. Its events require an
authorization hash for `authorizing`, a transaction hash for `submitted`, and
an evidence hash for `confirmed`. The placement service currently accepts only
an `X402AuthorizationPlanV1`.

Do not force imported Agent payments into that table:

- a public detail read does not prove the current Cobia owner created or paid it;
- `pending` has no Cobia authorization;
- `settling` exposes neither authorization hash nor transaction hash, so it
  cannot satisfy the current event constraints;
- `completed` supplies a transaction hash, but status JSON alone is not Cobia's
  independent evidence.

The first slice should persist a separate provider-payment root keyed by
`(provider, paymentId)` plus owner scope, with hashes of normalized detail and
status snapshots and an append-only remote-status history. Never use
`paymentId` as `commercePlacement.id`.

When mutation is later enabled, create a dedicated committed Agent-charge plan
that binds owner, `paymentId`, challenge hash, realm, chain, asset, amount,
recipient, expiry, and manifest hash. Map lifecycle only with evidence:

| OKX state | Cobia interpretation |
| --- | --- |
| `pending` | remote request exists; not authorized |
| `settling` | provider accepted a credential; not yet a submitted Cobia placement unless Cobia possesses its committed authorization evidence |
| `completed` | candidate settlement; independently verify X Layer receipt, token, payer, recipient, and amount before `confirmed` |
| `failed` / `expired` | terminal provider result with preserved machine reason; never retry a signed nonce blindly |

Security details for the read-only adapter:

- accept only an owner-supplied ID or canonical `https://pay.okx.com/p/...` URL;
- construct the `web3.okx.com` endpoint locally rather than fetching an
  arbitrary URL, preventing SSRF and redirect substitution;
- require exact equality among path `paymentId`, response `paymentId`, and
  challenge `data.id`;
- the docs describe `a2a_ + base58(uuidv7)`, but their example resembles a
  26-character ULID and contains `0`; use a bounded alphanumeric opaque suffix,
  not a guessed Base58-only regex;
- do not index public detail globally: the high-entropy payment link acts like
  a bearer locator and may expose `description` or `externalId` business data.

## Order and fulfillment boundary

The OKX one-time API answers “what transfer was requested and did it settle?”
It does not answer “what was ordered and was it delivered?” Cobia's existing UI
copy—“Payment settled is not proof of delivery”—must remain.

For real order details, the follow-on protocol is UCP Order, not an invented
extension of the OKX payment object. UCP's authenticated `GET /orders/{id}`
provides `checkout_id`, permalink, line items, fulfillment expectations/events,
adjustments, currency, and totals; the merchant remains authoritative. Source:
[UCP Order REST binding](https://ucp.dev/latest/specification/order-rest/).

## Branding and logo boundary

- The official X Layer docs repository publishes an
  [X Layer logo kit](https://github.com/okx/xlayer-docs/tree/main/media-kit) with
  SVG/PNG variants and a usage-guideline PDF. The repository has no root license
  file; the kit is a source and guideline, not an unrestricted trademark grant.
- No official downloadable **Agent Payments** logo kit or explicit reusable
  trademark license was found. The OKX logo and related marks remain OKX
  property; the service/API license does not automatically license the marks.
  See the [OKX Web3 Build terms](https://web3.okx.com/de/build/docs/waas/legal).
- First release: use a neutral Cobia payment-link glyph and the text “OKX Agent
  Payments”. Add an X Layer network badge only from the official kit and in
  accordance with its guideline. Do not hotlink an ecosystem-card image or use
  the X Layer mark as if it were the provider logo. Obtain written permission
  before bundling an OKX product mark.

## Ranked implementation sequence

1. **Public inspector:** detail/status fetch, strict normalization, committed
   snapshots, owner-scoped history, independent receipt enrichment.
2. **Buyer placement:** only after a dedicated Agent-charge plan and browser
   EIP-3009 signer preserve Cobia's owner and verifier boundaries.
3. **Seller creation:** only for a Cobia-controlled Seller realm/payee; keep HMAC
   credentials server-side and bind `externalId` to a stable Cobia request ID.
4. **UCP Order adapter:** add authenticated fulfillment/order snapshots when a
   merchant exposes them; keep payment and fulfillment evidence separate.
5. **AEON comparison, defer:** AEON's official demo verifies X Layer x402 v2 for
   USDC/USDG, but its QR-order call requires email and merchant `appId`, and no
   official general order-detail/status contract was found. The repo README says
   MIT, but there is no standalone license file and no trademark grant. Revisit
   only after AEON supplies a stable order/status API, privacy contract, and
   logo permission. Source: [official AEON x402 demo](https://github.com/AEON-Project/X402_SCAN).
