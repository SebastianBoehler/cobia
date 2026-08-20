# General-intent solver harness and verified execution

Date: 20 August 2026
Status: approved implementation design

## Submission outcome

Cobia will demonstrate one agent harness that can research and author broad
onchain transaction programs while a separate deterministic verifier decides
which exact stages may be presented to the user's wallet.

The mainnet submission proof targets three wallet-controlled outcomes:

1. an X Layer swap through an activated Cobia V3 capability;
2. an asynchronous LI.FI bridge followed by acquisition of one explicitly
   registered tokenized instrument when a fresh route and eligibility check
   pass; and
3. an exact x402 payment to one verifier-owned merchant manifest entry.

No agent, server, facilitator integration, or test owns the user's signing key.
Every principal signature or transaction is shown to and approved by the
browser wallet. A missing route, stale quote, failed simulation, unsupported
instrument, unavailable destination gas, or inactive capability must abstain.

## Meaning of general

Generation is open-world; verification is outcome- and authority-bounded.

The harness may use installed tools, protocol documentation, official APIs,
verified source, ABIs, SDKs, and its own temporary code to propose any sequence.
It returns canonical data, never a safety verdict. A generic EVM stage may use
an unknown protocol or solver-authored contract only when the independent
verifier binds its exact chain, target, code identity, calldata, value,
approvals, complete owner asset deltas, trace, state diff, freshness, and replay
to the signed policy. Protocol adapters add stricter semantic checks but are
not the architectural allowlist. Unsupported outcome types remain research
results with a precise blocked reason; there is no claim that every onchain
request is already executable.

Every run ends as `verified-executable`, `research-only`, or `abstained`.

## Canonical staged program

`TransactionProgramV1` binds the signed intent policy, owner, immutable source
snapshots, and an ordered list of stages. Each stage has exactly one kind:

- `cobia-v3`: same-chain atomic actions compiled from active registry
  capabilities;
- `wallet-transaction`: one exact provider transaction independently decoded,
  simulated, and bound to its quote;
- `async-delivery`: a non-signing monitor for a previously submitted bridge;
- `x402-authorization`: one exact short-lived EIP-3009 payment authorization;
  or
- `research`: a sourced but non-executable candidate.

The program commits to chain IDs, input/output assets and amounts, owner and
recipient, targets, selectors, approval spenders and caps, native value,
deadlines, minimum outcomes, stage dependencies, quote and response hashes,
simulation hashes, and evidence freshness. Unknown fields, unsafe numbers,
dirty addresses, duplicate stages, chain ambiguity, raw signing material, and
unbounded dependencies fail closed.

Stages are not silently retried, reordered, replaced, or skipped. A later stage
is prepared only after the preceding receipt or delivery evidence is final and
fresh. A bridge cannot share the atomic guarantee of an X Layer V3 program.

## Harness plugins

`SolverToolV1` is a coordinator-owned, versioned tool contract with strict input
and output schemas, fixed network policy, stable error codes, and bounded
resources. The model may call only tools declared by the signed job manifest.
Tools receive a wallet address and public state, never a wallet provider,
credential-bearing RPC URL, cookie, secret, or production send method.

Initial tools are:

- `cobia.capabilities@1`: active V3 capabilities and trusted deployments;
- `lifi.routes@1`: LI.FI chains, tokens, tools, quotes, routes, and transfer
  status through a fixed-host broker;
- `rwa.instruments@1`: verifier-owned instrument identities and official issuer
  evidence;
- `commerce.x402@1`: existing x402/UCP discovery and exact placement planning;
  and
- `chain.read@1`: pinned read-only RPC and code/proxy identity reads.

The broker permits only documented HTTPS hosts and paths, validates redirects,
DNS/IP resolution, methods, query keys, timeouts, response sizes, schemas, and
content types, and strips ambient credentials. Provider calldata is retained as
untrusted hashed provenance until a trusted adapter validates it.

## Same-chain atomic lane

The current `CobiaExecutorV3` remains the preferred atomic lane for supported X
Layer actions because it enforces final outcomes onchain. The open wallet lane
can present arbitrary independently verified calls for explicit user approval,
but it does not pretend those calls gained an Executor capability. LI.FI or a
new protocol cannot bypass the registry delay for atomic Executor authority.

## Verified wallet-transaction lane

`evm.raw@1` is the generic exact-call boundary. LI.FI and OKX adapters normalize
provider payloads and add provider-specific semantic checks. The verifier
checks:

- source response hash, quote expiry, route identity, chain IDs, assets,
  amounts, slippage, sender, recipient, and included tools;
- exact transaction target, selector, native value, approval token, spender,
  and maximum approval amount;
- target and approval-spender runtime code identities at the simulation anchor;
- no undeclared calls, recipients, tokens, permit scopes, or arbitrary
  destination calls; and
- a fresh `eth_call`/trace/state-diff simulation whose output and gas remain
  within the signed policy.

The verifier returns the exact approval and transaction requests plus immutable
evidence. The browser rechecks chain, account, expiry, code hashes, and request
commitment immediately before asking the wallet to sign each request. It sends
only those exact bytes. A solver-authored deployment is therefore possible but
appears as an explicit deployment stage whose init code, constructor arguments,
predicted address, runtime code commitment, value, and later calls all verify.
The server never broadcasts a principal transaction.

Fork replay remains an evidence option for state diffs and traces when ordinary
RPC simulation is insufficient; it is never an execution fallback. Production
execution always targets the selected live chain through the user's wallet.

## Bridge and tokenized-instrument flow

A bridge program is explicitly asynchronous:

1. verify and execute the X Layer source transaction;
2. persist the source receipt and monitor LI.FI status without signing;
3. independently verify destination receipt, recipient, asset, amount, and
   finality;
4. capture a fresh destination-chain quote and simulation; and
5. ask the wallet to switch chain and separately approve/execute acquisition.

The destination acquisition never relies on the old bridge quote. Failure to
deliver or acquire does not become a Cobia profit or atomic-success claim.

`RwaInstrumentV1` distinguishes issuer, token contract, underlying identifier,
claim type, jurisdiction and eligibility restrictions, transfer restrictions,
custody/redemption semantics, proxy/runtime identities, and official-source
hashes. A ticker is not an identity. xStock, Ondo tokenized, synthetic, fund,
and private-company exposures remain distinct. The UI describes the exact token
being acquired and does not call all representations "the stock."

## x402 flow

The existing exact EIP-3009 flow remains separate from V3. Execution requires a
real, HTTPS, X Layer merchant entry with exact payee, asset, amount, endpoint,
facilitator, token signing identity, product commitment, and immediate receipt
semantics. Payment settlement proves the registered immediate evidence only;
it does not prove shipping, future fulfillment, refunds, or merchant quality.

The production commerce manifest stays empty until one real offer passes these
checks. No placeholder or HTTP-only resource is activated.

## Product and solver marketplace

The main interface remains outcome-first: portfolio, intent composer, active
solver competition, verified program review, wallet confirmations, and history.
The optional solver lab shows a read-only transcript and immutable artifacts,
not an interactive production shell or safety verdict.

Solver submissions can improve while an intent remains open. They may abstain,
replace their own prior quote, or submit a better program before the deadline.
Only fresh quotes are actionable. Expired submissions are retained in history
as past discoveries and are clearly non-executable.

The public SDK/example harness exposes the typed tools and proposal schemas so
community solvers can build different search strategies. Their output is
untrusted until the same independent verifier accepts it.

## Public test seams

Strict TDD begins at these seams:

1. `SolverToolV1.run` returns bounded canonical evidence or typed abstention.
2. `TransactionProgramV1` rejects raw secrets, undeclared stages, mutable
   evidence, unknown fields, and cross-stage owner or recipient changes.
3. `normalizeLifiQuoteV1` accepts only a source-bound quote and emits no wallet
   request before independent verification.
4. `verifyWalletTransactionV1` rejects target, selector, value, approval,
   recipient, code identity, chain, quote, simulation, freshness, and state-diff
   mismatches with stable codes.
5. The stage machine cannot prepare stage N+1 before canonical completion of N.
6. The wallet client sends only verifier-committed exact requests after account,
   chain, expiry, and code rechecks.
7. API and UI distinguish atomic execution, async delivery, x402 settlement,
   research-only, abstention, and historical results.

Adversarial coverage includes credential leakage, endpoint injection, alternate
RPC method casing/encoding, redirects and DNS bypass, malformed or oversized
responses, unsafe amounts, stale/reorged anchors, proxy upgrades, spoofed
simulation or state diff, allowance/value/recipient expansion, stage skipping,
duplicate sends, async status spoofing, issuer identity ambiguity, and
research-to-execution type confusion.

## Release gate

Before mainnet activation, run focused suites, package typechecks, lint, build,
audit, full workspace tests, a real pinned fork evidence test, and browser tests
that stop before wallet confirmation. Then use a tiny user-approved live amount
for each proof. A test or release process must never sign or broadcast a
principal mainnet transaction.

Residual limits must remain visible: route availability and price change;
bridges are asynchronous; future APY, commerce fulfillment, LP fees, and
impermanent loss are not guaranteed; tokenized instruments may have legal,
transfer, liquidity, and redemption restrictions; and only manifest-backed
semantics are executable.
