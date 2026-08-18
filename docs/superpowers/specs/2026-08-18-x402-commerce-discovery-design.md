# x402 Commerce Discovery and Verified Order Placement

## Status

Approved architecture for Cobia's first commerce increment. This design adds
broad x402 and UCP discovery while keeping execution limited to independently
verified X Layer order placement. It does not add delivery tracking, buyer PII,
or a raw-call execution escape hatch.

## Goal

Cobia lets a user discover paid resources and products, sign a bounded commerce
intent, receive competing solver programs, and place an order only when the
payment and immediate order evidence can be verified independently.

The sandbox may search and compose freely from immutable offer snapshots. It
never receives a wallet handle, signer, payment credential, merchant secret,
buyer contact details, shipping information, or a production send method.

## Scope

Version one supports:

- broad read-only discovery through x402 Bazaar/direct payment requirements and
  UCP Catalog/MCP sources;
- immutable canonical offer snapshots with provenance;
- exact bounded X Layer payments;
- direct smart-contract orders with a required event or ERC-721/ERC-1155
  receipt; and
- x402 v2 settlement with an exact owner-signed EIP-3009 authorization or an
  independently verified owner-broadcast transaction hash.

Version one does not support:

- shipping or contact information, physical delivery, order tracking, returns,
  refunds, substitutions, subscriptions, or recurring authorization;
- card, bank, custodial, cross-chain, or unsupported token payments;
- merchant checkout handoff as an executable Cobia result;
- arbitrary sandbox-authored calldata in production; or
- claims that payment settlement proves delivery or future fulfillment.

UCP results requiring buyer information or off-chain checkout remain visible
but non-executable with a stable reason. Cobia shows no fabricated executable
offer when no verified chain-196 merchant is available.

## Standards boundary

x402 v2 supplies HTTP payment negotiation, typed payment requirements, payment
payloads, facilitator verification/settlement, settlement responses, and paid
resource discovery. UCP supplies protocol-neutral catalog, cart, checkout, and
order interfaces. Cobia uses UCP Catalog only in this slice.

Neither remote schema, ABI, product prose, merchant claim, nor agent skill is
trust evidence. Cobia normalizes both standards into its own canonical offer
and applies verifier-owned semantics before authorization.

The existing MPP route-reveal payment flow is not a compatibility path. Useful
EIP-3009 validation primitives may be extracted only when their contracts and
tests match this design; old request, quote, reveal, and purchase state must not
be revived.

## Trust boundary

Discovery is open-world; execution is closed-world.

- A read-only broker fetches remote discovery and offer documents under strict
  network, redirect, timeout, response-size, and content-type limits.
- Remote text is untrusted display content. It never changes policies, tools,
  prompts, manifests, or verifier rules.
- The coordinator canonicalizes and stores an immutable offer snapshot before
  the sandbox sees it.
- A signed policy selects exact capability versions and a maximum spend. It
  commits to an offer hash rather than caller-authored remote JSON.
- Solvers emit typed order parameters only. A verifier-owned module resolves
  merchant deployments and compiles exact calls or payment authorizations.
- A fresh read/replay verifies current identity, offer freshness, payment
  bounds, and immediate order evidence.
- The user wallet is the only principal authorizer. The agent and server never
  hold a principal key.

For a direct order contract, the browser wallet broadcasts the exact verified
V3 program. For x402 EIP-3009, the wallet signs one exact short-lived payment
authorization and the selected facilitator may settle only that authorization.
The facilitator is an explicit third-party broadcaster, never an agent signer.

## Canonical commerce offer

`CommerceOfferV1` is strict canonical JSON and commits to:

- version, offer ID, source protocol and source URL;
- fetched time, source-response hash, offer expiry, and provenance;
- merchant ID, display name, payee, and verifier manifest identity;
- product/resource ID, SKU or resource commitment, description hash, quantity,
  and optional media hashes;
- chain, payment scheme, payment asset, exact total, and maximum timeout;
- placement endpoint or registered contract capability;
- evidence profile and required receipt recipient; and
- execution eligibility plus a stable blocked reason when not executable.

Remote descriptions and media URLs are display-only. The signed order meaning
comes from exact product/resource and merchant commitments.

Offers are immutable. Refreshing discovery creates a new snapshot. The
coordinator re-fetches and revalidates the selected source immediately before
authorization; any material change rejects the program instead of updating it.

## Discovery broker

The broker supports two adapters:

1. `x402-v2`: searches configured Bazaar endpoints and may inspect a selected
   HTTPS resource's `PAYMENT-REQUIRED` response. It accepts only version 2,
   supported schemes, complete typed requirements, and bounded headers.
2. `ucp-catalog`: resolves a merchant's well-known UCP profile and calls only
   declared catalog/search tools. Cart, checkout, order, and buyer-profile tools
   are not callable in this slice.

Every outbound request:

- requires HTTPS;
- resolves DNS and rejects loopback, link-local, private, multicast, metadata,
  reserved, and rebinding targets;
- rejects credential-bearing URLs and userinfo;
- sends no cookies, authorization, local headers, or environment credentials;
- follows no redirect until the new destination is independently validated;
- applies method, port, timeout, byte, decompression, nesting, and item limits;
  and
- records URL, status, headers/content hashes, timestamps, and adapter version.

The sandbox cannot call discovery endpoints directly. It receives sanitized
snapshots and published schemas through immutable files.

## Commerce policy and program

`CommerceOrderPolicyV1` extends the general policy with:

- exact offer hash and merchant manifest hash;
- owner and receipt recipient;
- maximum atomic payment and exact payment asset;
- maximum actions, approvals, calldata, gas, and evidence age;
- order deadline and one-use nonce; and
- allowed evidence class: `onchain-order` or `payment-settled`.

`commerce.order.place@1` parameters contain only the offer hash, quantity,
order commitment, and selected evidence profile. Merchant targets, selectors,
payees, argument positions, event schemas, and receipt-token identities come
from the trusted manifest.

The capability compiler produces one of two placements:

- `direct-contract`: an exact registered contract action projected into the V3
  executor with bounded payment and postconditions; or
- `x402-exact`: an exact payment requirement and owner authorization template
  bound to the offer, payer, payee, amount, asset, chain, validity window, and
  nonce.

The program cannot change the policy's offer, payment ceiling, recipient,
evidence class, or deadline. It cannot add splits, Permit2, delegation, native
value, or another funding asset in version one.

## Immediate evidence

Evidence is one of:

- `onchain-order`: the exact placement transaction succeeded and emitted the
  registered order event or produced the required ERC-721/ERC-1155 receipt for
  the owner; or
- `payment-settled`: the exact x402 settlement is canonical and matches the
  authorization and offer, but no tokenized order receipt is claimed.

A transfer transaction alone proves payment sent. It proves order placement
only when the registered merchant semantics bind that transfer or settlement to
the committed resource/order. UI copy must say `Payment settled` rather than
`Order issued` for settlement-only evidence.

Receipt verification checks transaction attribution, confirmations, block hash,
reorg status, contract and proxy identities, event emitter/topics/data, order
commitment, payer, owner/recipient, token ID or amount, asset deltas, allowance
cleanup, and absence of undeclared calls.

## Persistence and lifecycle

`commerce_offer_snapshots` stores immutable canonical offer fields, source
provenance, raw-response hash, expiry, eligibility, and blocked reason.

`commerce_placements` is append-only and owner-bound. It stores commitments,
protocol, state, authorization or transaction hashes, canonical receipt
evidence, and stable rejection codes. It never stores buyer PII.

The placement lifecycle is:

`prepared -> authorizing -> submitted -> confirmed | rejected`

Retries are idempotent by owner, offer, policy, nonce, and authorization hash.
An already used or conflicting authorization cannot be replaced or resettled.
This lifecycle ends at immediate confirmation; no fulfillment state follows.

## Product and API surface

`GET /api/commerce/discover` returns deduplicated offer snapshots with visible
provenance, freshness, evidence class, and execution eligibility. It never
accepts an arbitrary fetch URL from the browser.

Existing general-intent and solver-market APIs remain authoritative. Selecting
an executable offer creates a normal wallet-signed competition restricted to
`commerce.order.place@1`. Solvers may revise or abstain.

Verified direct-contract programs use the existing V3 preparation, owner proof,
wallet confirmation, and receipt endpoints. x402 adds owner-bound endpoints to:

1. prepare the exact verified payment payload; and
2. submit the matching wallet signature or owner-broadcast transaction hash for
   settlement/verification.

The server does not accept browser-authored payment requirements, merchant
targets, payees, amounts, assets, evidence schemas, or facilitators.

## Stable rejection codes

The first version includes:

- `DISCOVERY_NETWORK_BLOCKED`, `DISCOVERY_RESPONSE_TOO_LARGE`,
  `DISCOVERY_SOURCE_INVALID`, and `DISCOVERY_PROTOCOL_UNSUPPORTED`;
- `OFFER_MALFORMED`, `OFFER_EXPIRED`, `OFFER_CHANGED`,
  `MERCHANT_UNREGISTERED`, and `EVIDENCE_UNSUPPORTED`;
- `CHAIN_UNSUPPORTED`, `ASSET_UNSUPPORTED`, `PRICE_BOUND_EXCEEDED`,
  `PAYEE_MISMATCH`, `ORDER_COMMITMENT_MISMATCH`, and
  `RECEIPT_RECIPIENT_MISMATCH`;
- `PAYMENT_AUTH_MISMATCH`, `PAYMENT_AUTH_REPLAYED`,
  `PAYMENT_SETTLEMENT_MISMATCH`, and `PAYMENT_FACILITATOR_UNSUPPORTED`; and
- `ORDER_EVENT_MISSING`, `ORDER_RECEIPT_MISSING`,
  `ORDER_RECEIPT_SPOOFED`, and `ORDER_RECEIPT_REORGED`.

Errors remain specific in persisted evidence and user-facing status. The system
does not swallow an error or fall back to another payment or execution lane.

## TDD and adversarial verification

Implementation begins with failing tests for:

- canonical offer/policy/program hashing, strict schemas, ordering, duplicates,
  and immutable snapshots;
- official x402 v2 and UCP wire fixtures plus malformed versions, headers,
  encodings, extensions, tools, and response shapes;
- DNS rebinding, private/metadata targets, redirects, credential URLs, unusual
  IP encodings, oversized/compressed responses, timeouts, and parser bombs;
- prompt injection and active content in product names, descriptions, media, and
  remote schemas;
- stale or changed offer, merchant, SKU/resource, price, amount, asset, chain,
  payee, timeout, recipient, selector, code/proxy identity, or evidence class;
- EIP-3009 domain, payer, payee, value, validity, nonce, signature, replay,
  duplicate settlement, and unsupported facilitator changes;
- spoofed events, wrong emitters/topics/data, fake NFTs, receipt-recipient
  mismatch, mutable proxies, confirmations, and reorgs;
- sandbox provenance with no URLs containing credentials, authorization
  headers, cookies, wallet handles, buyer PII, or mutable evidence; and
- database ownership, uniqueness, state transitions, idempotency, and immutable
  confirmed evidence under concurrent requests.

Required gates are focused unit suites, package and workspace tests/typechecks,
lint, build, audit, migration and diff checks, database integration tests,
Foundry unit/fuzz/invariant tests where contracts change, and an opt-in pinned X
Layer fork for direct placement. Read-only live discovery may confirm real
availability but does not create a production route or send principal.

## Release boundary

The feature can ship discovery before any offer is executable. Production
execution activates only after a real chain-196 offer passes the complete
verifier and fork gates, the required merchant/facilitator identities are in the
trusted manifest, V3 governance is active, and the owner reviews the exact
authorization or transaction.

No automated test signs or broadcasts a mainnet principal transaction. No agent,
server, facilitator credential, or deployment key can authorize more than the
owner's exact reviewed payment.

## Primary standards

- x402 v2 specification:
  <https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md>
- x402 signed offer and receipt extension:
  <https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md>
- Shopify UCP agent commerce:
  <https://shopify.dev/docs/agents>
- Shopify UCP Catalog, cart, and checkout boundary:
  <https://shopify.dev/docs/agents/carts-and-checkout>
