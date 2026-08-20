# Agentic deposit, payment, and custom-contract research

Date: 2026-08-20

This note separates first-party product facts from Cobia architecture inferences. A
discovery listing, quote, ABI, receipt, or provider claim is not authorization
evidence; Cobia's deterministic verifier remains the authorization boundary.

## Hackathon demo guidance

Primary source:
[Parth Mittal, “How to find hackathon winning ideas”](https://x.com/mittalparth_/article/2090033629422604523)
([original post](https://x.com/mittalparth_/status/2090033629422604523)).

**Sourced facts / author guidance**

- Use AI to expand or feasibility-check an idea rather than to generate a generic
  hackathon idea.
- The organizer's technology should be essential to the product, and the demo
  should be explainable in one sentence and roughly one minute.
- The author recommends simple, early, theme-aligned projects grounded in the
  builder's domain knowledge rather than combining sponsors for its own sake.
- The article cites a commerce-agent demo combining Google UCP, x402, and
  ERC-8004 as difficult to explain quickly.

**Cobia inference**

The primary demo should remain one X Layer-native loop: express an intent,
receive competing proposals, independently verify one exact program, let the
user wallet sign it, and show the measured onchain outcome. Commerce, x402,
LI.FI, and custom contracts are useful extension demonstrations but should not
obscure that loop. The article is individual advice, not official judging policy.

## LI.FI Smart Deposit Addresses

Primary sources:
[product announcement](https://li.fi/knowledge-hub/introducing-smart-deposit-addresses),
[enterprise integration documentation](https://docs.li.fi/enterprise/smart-deposit-address).

**Sourced facts**

- LI.FI derives a unique deposit address for a trade. The sender makes an
  ordinary token transfer; LI.FI orchestrates execution and sends the resulting
  asset to the configured recipient.
- For supported failure cases, LI.FI returns funds to the configured sender or
  refund address.
- Integrators track the operation by deposit address and source chain. The
  documented lifecycle includes `PENDING`, `DONE`, and `FAILED`.
- The capability is enabled per enterprise integrator.
- The operational documentation currently describes a narrower usable surface
  than the launch article: EVM same-chain ERC-20 swaps, no native-token inputs or
  transfer-tax tokens, and an explicit expected sender/refund address. The launch
  article additionally describes EVM cross-chain, Solana, Bitcoin beta,
  ERC-4626 deposits, and composed routes.

**Cobia inference**

- Treat a Smart Deposit Address as an external solver/provider capability, not
  as verifier-owned execution or trust evidence.
- Commit the provider, deposit address, source chain and token, amount bounds,
  recipient, minimum output, expiry, sender/refund address, quote commitment,
  and status endpoint into the proposal.
- Verify the source transfer and destination outcome independently. Cross-chain
  completion is asynchronous and cannot share Cobia's same-chain atomic
  final-balance guarantee.
- Advertise only the routes actually enabled and quoted for Cobia, not the full
  launch-announcement surface.

## Cloudflare Monetization Gateway

Primary source:
[Cloudflare, “Introducing Monetization Gateway”](https://blog.cloudflare.com/monetization-gateway/).

**Sourced facts**

- Monetization Gateway applies x402 payment rules at Cloudflare's edge for web
  pages, datasets, APIs, and MCP tools.
- A protected endpoint returns HTTP `402` with payment requirements; the client
  retries with payment proof, and a facilitator verifies payment before origin
  access is allowed.
- Cloudflare describes settlement as peer-to-peer to the seller wallet and
  describes programmable rules by route, method, and price.
- The announcement opened an early-access waitlist. It should not be described
  as universally self-service without current account-level confirmation.

**Cobia inference**

Cloudflare-protected resources can enter Cobia through the same x402 adapter as
other sellers. Edge payment acceptance proves payment and access, not the
correctness of an API response or fulfillment of a commercial order.

## Amazon Bedrock AgentCore Payments

Primary sources:
[GA announcement](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-payments-is-now-generally-available-enabling-agents-to-transact-safely-and-autonomously-at-scale/),
[developer guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments.html),
[execution model](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-how-it-works.html),
[payment instruments](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-create-instrument.html).

**Sourced facts**

- AgentCore Payments became generally available on 2026-08-18 and supports
  Coinbase CDP and Stripe Privy embedded stablecoin wallets.
- An end user funds a wallet and delegates payment authority to an agent.
  AgentCore provides short-lived authorization while the wallet provider carries
  out signing operations requested through the agent flow.
- Payment sessions enforce a maximum spend and expiration. The service supports
  x402, including variable-usage `upto` payments, and MPP.
- AWS exposes curated x402 discovery from Coinbase through AgentCore Gateway/MCP
  and describes access to Cloudflare Monetization Gateway resources.
- Payment instruments are network-specific. The cited AWS documentation does
  not establish support for X Layer chain `196`.

**Cobia inference**

AgentCore can be a discovery source or an optional, separately funded and tightly
capped micro-wallet connector. Its delegated embedded-wallet model must not
replace Cobia's principal path, where the browser wallet signs only an exact,
independently verified program. X Layer support must be proven before use.

## x402 protocol and discovery

Primary sources:
[protocol introduction](https://docs.x402.org/introduction),
[HTTP 402 flow](https://docs.x402.org/core-concepts/http-402),
[network and token support](https://docs.x402.org/core-concepts/network-and-token-support),
[Bazaar discovery](https://docs.x402.org/extensions/bazaar),
[signed offers and receipts](https://docs.x402.org/extensions/offer-receipt).

**Sourced facts**

- A server advertises amount, asset, network, and recipient in an HTTP `402`
  response. The client signs a payment payload and retries; the server or a
  facilitator verifies and settles it.
- Documented schemes include `exact`, `upto`, and batch settlement.
- EVM networks are represented by CAIP-2 identifiers, so X Layer can be
  expressed as `eip155:196`. Protocol-level representation does not prove that a
  particular facilitator supports that network.
- EVM payments can use EIP-3009 or Permit2. Permit2 may require a one-time token
  approval.
- Bazaar is an early-stage discovery catalog for HTTP and MCP resources. Its
  validation covers advertised schemas and metadata, not merchant trust,
  service quality, or fulfillment.
- Signed offers can commit the resource, scheme, network, amount, recipient, and
  expiry. Signed receipts can identify the payer and transaction hash. They
  prove server commitments, not objective delivery quality.

**Cobia inference**

Use Bazaar and other catalogs only as untrusted discovery. Require an explicitly
supported facilitator or self-facilitation for X Layer. Independently verify all
onchain-verifiable delivery, such as issued tokens, NFTs, receipts, recipient
balances, and state changes; offchain or physical fulfillment needs a separate
merchant, reputation, and dispute model.

## Solver-authored contracts

**Cobia inference**

Solvers may write and deploy arbitrary helper contracts inside the disposable
fork. Production deployment needs a stricter canonical program containing the
compiler and dependency hashes, source and init-code hashes, expected address,
runtime code hash, constructor arguments and immutables, owner/admin state,
value, recipients, capabilities, and expiry.

Production deployment should use a verifier-recognized deterministic factory or
`CREATE2` path. The verifier should reject unmodeled proxies, upgrades,
`delegatecall`, arbitrary external-call surfaces, hidden owners, and mutable
governance. It must reproduce deployment and execution on a fresh pinned fork,
include deployment gas in route economics, and enforce asset conservation and
the exact outcome bounds. The user wallet still signs the exact verified
deployment/program; the solver receives no signing or production-send ability.

For a one-shot action, the bounded executor will often remain cheaper and safer
than deploying fresh bytecode. A custom deployment is justified only when its
net benefit survives deployment gas and its semantics fit the verifier's trusted
capability model.

## Safe aggregation boundary

**Cobia inference**

Cobia can normalize x402 Bazaar resources, Cloudflare-protected endpoints, AWS
curated discovery, LI.FI deposit quotes, and solver-authored programs into one
canonical offer IR containing:

- provider identity and capability manifest;
- endpoint or route, method, and request/response schema;
- network, asset, price bounds, payment recipient, and expiry;
- intended outcome, recipient, minimum result, and refund semantics;
- signed offer or quote commitment; and
- required delivery and simulation evidence.

The system should aggregate providers, not trust. Discovery metadata, ABIs,
provider receipts, and agent statements help proposal generation, but only the
independent verifier can accept an exact wallet-signable program. Expired or
historical offers must be excluded from live competition or clearly labeled as
past evidence.

## Can public RPC replace fork replay?

Primary sources:
[X Layer RPC methods](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints),
[X Layer architecture](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer),
[Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/), [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898),
[Geth simulation](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth), [Geth tracers](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers),
[viem `simulateBlocks`](https://viem.sh/docs/actions/public/simulateBlocks), and
[Anvil](https://www.getfoundry.sh/anvil/index.html).

**Sourced facts**

- X Layer documents two public chain-196 endpoints, a 100 requests/second/IP
  limit, and says omitted methods are unsupported. It lists `eth_call`,
  `eth_estimateGas`, block/receipt/log reads, and included-transaction traces,
  but not `debug_traceCall` or `eth_simulateV1`.
- Ethereum defines JSON-RPC as stateless. `eth_call` executes one call without a
  transaction and returns only its bytes; gas estimates may differ from reality.
- EIP-1898 lets state queries pin a block hash and request canonical-chain
  membership. This protects a set of reads from silently mixing states across a
  reorganization; it does not preserve mutations between calls.
- `eth_simulateV1` applies sequential calls and returns status, gas, return data,
  and logs. viem's `simulateBlocks` wraps it and cannot replace server support.
- Geth's `prestateTracer` diff mode can expose changed accounts and storage, while
  `callTracer` can include logs. These require a trace-capable server method.
- Anvil can fork a chain at a specific block, execute and mine transactions into
  mutable local state, dump/load state, and provide execution traces.

**Read-only public-RPC probes**

The following probes ran on 2026-08-20 around 05:32–05:36 UTC against both
official endpoints. No signing or send method was invoked.

- `https://rpc.xlayer.tech` returned chain `0xc4` and client
  `reth/v1.10.2-5101851/.../xlayer/v0.1.0`;
  `https://xlayerrpc.okx.com` returned chain `0xc4` and client
  `Geth/rpc-out/v0.1.0-untagged-997cccde-20260617/...`.
- The shared anchor was block `68434921` (`0x4143be9`), hash
  `0x79a9f7a37a6058a017fb27b1e042a04e0e4a9e600474781dae6a0fd7da5a4b60`.
  Both endpoints returned the same hash again after the probe.
- A no-op `eth_call` pinned by number and by EIP-1898
  `{blockHash, requireCanonical: true}` succeeded on both endpoints. Number- and
  hash-pinned `eth_estimateGas` also succeeded (`0x5208` for a zero-value
  transfer).
- A third-parameter state override installing code that returns `42` succeeded
  and returned the expected 32-byte value on both endpoints. The override is
  ephemeral to that single call.
- Contract-creation `eth_call` returned the expected runtime result, and creation
  estimation returned `0xebd7`; no address, code, or constructor state persisted.
- `debug_traceCall` with `callTracer`, `debug_traceCall` with diff-mode
  `prestateTracer`, and a two-call `eth_simulateV1` request all failed identically
  on both endpoints with JSON-RPC `-32601`, `rpc method is not whitelisted`.
- Despite the documented trace-method list, `debug_traceTransaction` for the
  already included V3 deployment also returned `-32601` on both public
  endpoints. Existing receipts remained readable.
- Historical reads currently reach genesis: block `0x1`, an account balance,
  and `eth_call` at block `0x1` succeeded on both endpoints. Historical
  `eth_getCode` correctly returned no code immediately before V3 Executor
  deployment and 15,615 bytes at deployment block `0x411f98c`. X Layer does not
  publish an archive-retention SLA, so this observation is not a durability
  guarantee.
- Post-inclusion evidence works: the Safe transaction
  `0xfa7e36f2f1287e79d8e7f07df8ba12fdcfe9f547841044d4b63d3bf954672cad`
  returned a successful receipt with five logs, and `eth_getLogs` pinned by its
  block hash returned the same five non-removed logs. This cannot produce logs
  or state deltas for a proposal that has not executed.
- In one head snapshot, both endpoints agreed on latest block `68435020`, safe
  block `68434920`, and finalized block `68433781`. A `latest` anchor can
  therefore be newer but less settled than `safe` or `finalized`; freshness and
  reorganization resistance remain separate policy choices.

**Cobia inference and recommendation**

RPC-only simulation is useful for chain and code identity, balances, allowances,
single calls, gas estimates, and hash-pinned reads. It is not acceptance evidence
for an arbitrary program: calls share no mutations, so it cannot prove approve →
swap → supply, deploy → invoke, or flash-loan repayment, and the public endpoints
return no proposal-time logs, traces, or diffs. Manual overrides test guessed
state rather than reproduce EVM transitions.

Use the three execution modes as follows:

1. **Persistent fork:** optional solver-search cache only. It is efficient for
   repeated exploration but accumulates mutations and becomes stale. Reset or
   rebase it frequently and never use it as the sole acceptance artifact.
2. **Fresh ephemeral local fork:** required final verifier. Start an independent
   instance at the committed block, execute the exact transaction sequence,
   collect receipts, logs, traces, state deltas, code identities, and final
   balances, then destroy it. Anvil documents the necessary pinned forking and
   mutable-state capabilities.
3. **RPC-only:** retain as a read-only input and preflight layer, not as a fork
   replacement. Use a monitored archive-capable provider or self-hosted X Layer
   RPC for production availability; the public endpoints are rate-limited and
   provide no archive-retention commitment.

For freshness, anchor by number **and** hash, require canonical membership, record
`safe`/`finalized` status, enforce maximum age, and re-check mutable identities
before wallet confirmation. A fresh fork reproduces pinned state but cannot keep
markets unchanged until inclusion; the executor must enforce deadlines, exact
targets, and minimum outcomes.

## Current OKX and X Layer discovery routes

Checked against public first-party pages on 2026-08-20. These are separate
programs; “Marketplace” must not be used as an umbrella for all of them.

### AI Season hackathon

**Sourced facts.** The [official event page](https://web3.okx.com/xlayer/build-x-series)
requires AI in the product, an X Layer Testnet deployment followed by a Mainnet
launch, an active project X account, and a submission post mentioning
`@XLayerOfficial`. The deadline is 2026-08-21 23:59 UTC. Its current
[submission form](https://docs.google.com/forms/d/e/1FAIpQLSfgU_3zcXdxK0GJQxj33QeUWdEcAaYnieVe9p5cFDb2JFQa4Q/viewform?usp=publish-editor)
asks for project name, description, URL, email, Telegram, and X handle; GitHub
and the X-post URL are optional form fields, although the event page separately
requires the post. No minimum usage metric is stated for ordinary hackathon
eligibility. The $10M volume threshold applies only to each Launch Grant unlock,
counts only OKX DEX-interface volume, and excludes DEX API volume.

**Cobia status/inference.** Submit before the deadline using the existing
testnet and mainnet deployment evidence, production URL, repository, and public
post, while describing V3 as deployed but pending delayed activation. Do not
claim V3 execution is active or create a principal transaction for eligibility.

### X Layer ecosystem intake

**Sourced facts.** The event page's “Submit project” button currently targets
the [“Speak to the X Layer team” form](https://docs.google.com/forms/d/e/1FAIpQLScXEuRMopvdP8qe3yWACuj8EUY9viCahCpRVzZo81bDPIv7Pw/viewform).
It asks for contact and company/project details, role, vertical, one-sentence
description, funding and project age, and desired support such as grants,
technical help, exposure, community, or partnership. It publishes no deployment
or usage threshold.

**Cobia inference.** This can be submitted before V3 activation to request
technical support and ecosystem exposure, using truthful current status. It is
an ecosystem contact form, not a Wallet Discover-listing confirmation.

### Builder Code and developer portal

**Sourced facts.** The [developer portal guide](https://web3.okx.com/onchainos/dev-docs/home/developer-portal)
and [live portal](https://web3.okx.com/onchainos/dev-portal/project) require
wallet verification plus linked email and phone; API keys are optional
for API use. [Builder Codes](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/overview)
are ERC-721 identifiers used for rewards, analytics, and possible App
Leaderboard/ecosystem-spotlight visibility. The
[integration guide](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/integration)
requires viem 2.45+ and an ERC-8021 `dataSuffix`; OKX Wallet does not currently
inject it automatically. EOA and ERC-7702 transactions are supported, while
ERC-4337 user operations are not. No usage threshold is stated to create a
code, but attributed transactions are what populate activity, acquisition, and
conversion analytics.

**Cobia status/inference.** Cobia already commits Builder Code
`sq6dlj2onr8ml5xa` inside its canonical transaction data before verification.
Keep attribution byte-for-byte inside the verified IR; never append it after
verification. The first post-activation user transaction can establish real
metrics, but activation itself is not required to keep the integration ready.

### OKX.AI agent marketplace and x402 catalog

**Sourced facts.** The public catalog is [OKX.AI Agents](https://www.okx.ai/agents).
The [ASP registration guide](https://web3.okx.com/onchainos/dev-docs/okxai/registerasp)
requires Onchain OS, Agentic Wallet email login, service metadata, and listing
review (normally within 24 hours). A2MCP requires either a free endpoint that
returns directly or a paid endpoint implementing the x402 `402 Payment
Required` challenge and replay flow; A2A instead supplies a service list and
pricing and uses X Layer escrow after negotiation. The
[current ASP page](https://www.okx.ai/tutorial/asp) says an unreviewed service
remains addressable by Agent ID but appears in the marketplace only after
approval. The official prerequisites do not state a mainnet/testnet deployment
or prior-sales threshold.

**Cobia inference/blocker.** This is the current official agent/x402 catalog;
no separate OKX x402 directory was found. Cobia should not register a placeholder
service. A2MCP is blocked until a stable public free or x402-compliant endpoint
exists; A2A is blocked until a continuously available solver service and honest
delivery scope exist. Marketplace settlement must remain separate from Cobia's
principal browser-wallet execution boundary.

### OKX Wallet Discover

**Sourced facts/blocker.** The indexed official
[DApp-listing documentation](https://web3.okx.com/build/docs/waas/walletapi-resources-dapp-application)
says to use a “build with us” form for Discover and `wallet@okx.com` for product
promotion. That URL now redirects to the generic Onchain OS overview, and no
current public application form or published deployment/usage checklist could
be recovered from an official page. Discover itself remains active and
[organizes DApps by categories, chains, and rankings](https://web3.okx.com/help/what-can-discover-at-okx-wallet-do-for-you).

**Cobia inference.** Ask `wallet@okx.com` for the current Discover intake only
after the hackathon submission; do not send in this research step. Prepare the
production URL, icon/screenshots, X Layer chain support, contract addresses,
security boundary, and mobile in-wallet-browser verification. Treat acceptance
as unconfirmed until OKX supplies and approves the current process.

## Hackathon narrative check: the linked Parth article

Verified at 2026-08-20T06:45:37Z. The user's
[linked post](https://x.com/mittalparth_/status/2090033629422604523) resolves to
Parth Mittal's X Article,
[“How to find hackathon winning ideas”](https://x.com/mittalparth_/article/2090033629422604523).

**Article thesis.** The author's practical filter is: do not start with generic
AI-generated ideas; collect early inspiration; make the organizer's technology
indispensable rather than decorative; choose a one-line, one-minute demo; be
early; use real domain knowledge; and align tightly with the theme. The article
explicitly uses an agent-commerce project combining merchant discovery, x402,
and identity as a negative demo example: too much of the short pitch was spent
explaining plumbing before the visible outcome. This is the author's experience,
not an organizer rule.

**Reconciliation with the official rules.** This advice substantially matches
the [AI Season criteria](https://web3.okx.com/xlayer/build-x-series): AI
application, innovation, product completeness, user value, X Layer integration,
growth potential, ecosystem contribution, plus onchain data, code quality, and
market potential. The organizer separately requires X Layer Testnet then
Mainnet deployment, an active project X account, a submission post mentioning
`@XLayerOfficial`, and form submission by 2026-08-21 23:59 UTC. The Launch Grant
is a different gate: only volume through the OKX DEX interface counts; DEX API
volume is excluded and wash trading or volume manipulation can disqualify a
project. [Builder Codes](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/overview)
provide attribution and analytics, but the official docs do not say that a
Builder Code turns x402 purchases or arbitrary Cobia programs into qualifying
Launch Grant volume.

**Actionable Cobia implication.** Lead the submission/demo with one visible,
wallet-controlled outcome: a plain-language intent becomes an independently
verified X Layer program, the user confirms the exact bounded actions, and the
receipt proves the result. Show the sandbox/verifier evidence as the reason the
route is trustworthy, not as the headline. Keep x402 commerce, community solver
SDKs, arbitrary contract composition, and recurring quote competitions as the
credible expansion path rather than stacking all of them into the first minute.
This makes X Layer essential—deployed bounded execution, onchain attribution,
and receipt evidence—while staying truthful that merchant fulfillment and broad
protocol support are not yet live.
