# Cobia security model

This document describes the production authority boundary. It is not an audit
report or a promise that the system is vulnerability-free. Report suspected
issues through the private process in [`SECURITY.md`](../../SECURITY.md).

## Security objective

Cobia lets untrusted or partially trusted solvers search broadly without giving
them authority over owner funds. A solver may propose a program. A separate
deterministic verifier decides whether the program matches a signed policy and
registered production identities. The owner wallet remains the only production
signer.

The principal assets are:

- owner funds and wallet signing authority;
- the exact policy, deadline, nonce, and evidence commitments;
- registered chain, token, protocol, executor, registry, and adapter identities;
- solver decisions, verifier attestations, replay traces, and execution receipts;
- service credentials for the web runtime, database, solver, and replay service.

## Authority split

| Component | May do | Must never do |
| --- | --- | --- |
| Owner wallet | Sign a policy and explicitly submit attested transactions | Delegate its private key, seed phrase, or unrestricted signing session to Cobia or a solver |
| Solver | Read public intent material, research routes, abstain, and submit signed proposals | Attest its own output, change the signed policy, access an owner key, or broadcast owner transactions |
| Deterministic verifier | Resolve registered identities, check semantics and bounds, compile known calls, request replay, and issue a verdict | Treat model output, RPC success, or a solver declaration as sufficient authority |
| Replay service | Execute accepted material on a disposable loopback-only Anvil fork and return evidence | Hold a production signing key or expose the fork as a durable public RPC |
| Web runtime | Orchestrate policy, evidence, proposals, verification, and owner-authenticated execution preparation | Relay principal transactions or silently replace missing production dependencies with sample data |
| V4 contracts | Enforce configured owner, target, selector, principal, deadline, and final-balance bounds | Make offchain forecasts enforceable or authorize an unregistered route |

## Verification sequence

1. The owner signs an exact policy for a specific wallet, chain, objective,
   assets, capabilities, limits, deadline, evidence age, competition window,
   and nonce.
2. Evidence capture pins block number, hash, timestamp, runtime code, relevant
   proxy implementations, protocol state, quotes, and asset identities.
3. Solvers submit immutable signed revisions. Invalid, stale, unsupported, or
   abstaining revisions never project to executable authority.
4. The verifier re-derives policy authorization and deployment identities. For
   registered capabilities, verifier-owned modules compile the calls. Exact
   wallet-call programs require additional code, selector, approval, asset,
   event, and state-delta coverage.
5. Deterministically accepted material is reproduced on a new fork. Replay
   failure rejects the program; a successful RPC call alone does not accept it.
6. The product compares the replay and postconditions with the committed
   program, then produces owner-bound execution material.
7. Before each production submission, Cobia rechecks freshness, deployment
   identity, balances, allowance, gas, and execution attribution. The owner
   wallet still confirms the transaction.
8. Canonical receipts, events, balances, and postconditions are persisted and
   linked to the public program outcome.

## Enforced, observed, and forecast values

These classes are deliberately separate:

| Class | Examples | Meaning |
| --- | --- | --- |
| Signed constraints | Chain, assets, spend ceiling, minimum output, targets, selectors, recipient, deadline | The verifier and execution path must reject violations |
| Immediate postconditions | Receipt status, amount received, aToken increase, NFT owner, protocol events, unexpected approvals | Checked against replay and/or the confirmed production transaction |
| Forecasts | APY, future fees, utilization, rewards, impermanent loss, future prices | Informational estimates; never represented as guaranteed profit or a future lower bound |

## Threats and controls

| Threat | Primary controls | Remaining boundary |
| --- | --- | --- |
| Malicious or hallucinating solver | Signed typed schemas, verifier-owned compilation, registered identities, exact-call coverage, deterministic replay, abstention | A newly supported capability needs its own semantics and tests |
| Solver tries to spend more or redirect output | Owner/input/output commitments, approval and recipient checks, principal and post-balance bounds | The owner must still inspect and confirm the wallet prompt |
| Stale quote, reorg, or upgraded proxy | Pinned block hash/timestamp, code and implementation commitments, current revalidation before execution | Fork evidence is historical and cannot guarantee future inclusion conditions |
| Replay escape or resource exhaustion | Authenticated input, concurrency caps, bounded runtime, loopback-only disposable fork, teardown | Replay infrastructure remains an operational trust boundary and denial-of-service target |
| Compromised web runtime | No owner key, server cannot sign or relay principal, browser rebuilds exact attested transactions, onchain V4 bounds | A compromised interface can mislead or withhold; the wallet and public evidence remain important independent checks |
| Credential leakage | Separate service identities, hashed credentials where applicable, TLS database boundary, ignored owner-readable local env generation | Operators must rotate exposed credentials and keep secrets out of issues and logs |
| Unsupported or unusual token behavior | Exact asset registration, runtime-code checks, explicit compatibility evidence, fail closed | Token support is per identity; interface resemblance is not sufficient |
| Duplicate, expired, or replayed authorization | Owner, chain, deadline, nonce, commitment, wallet session, and execution attribution checks | Wallet or chain-specific signing behavior still requires exact integration testing |

## Fail-closed behavior

Cobia does not silently substitute a route, quote, asset, protocol, chain,
credential, database, replay result, or sample record when production evidence
is missing. Unknown capabilities, mismatched code, unsupported selectors,
expired evidence, incomplete postconditions, replay errors, or runtime drift
produce explicit rejection or unavailability.

Rejected solver revisions are retained as evidence but do not become executable.
Past discoveries remain historical and require a fresh wallet-specific intent
and verification cycle.

## Production isolation

- **Vercel:** Next.js product, public APIs, policy orchestration, deterministic
  verification, and owner-authenticated execution preparation.
- **Hetzner:** PostgreSQL, independent reference solver, authenticated replay
  service, disposable Anvil forks, and Caddy.
- **Network boundary:** `api.getcobia.com` exposes only the replay service. The
  product and public API remain at `getcobia.com`.
- **Database boundary:** the web runtime connects to VPS PostgreSQL with TLS,
  SCRAM, and certificate verification.

Operational deployment, update, rollback, and secret-handling steps live in the
[production runbook](../deployments/hetzner-production-runbook.md).

## Automated assurance

- Pull requests and `main` run lint, type checks, unit tests, production builds,
  isolated PostgreSQL integration suites, Foundry tests, and topology rendering.
- A digest-pinned X Layer mainnet fork rehearsal runs nightly and on demand.
- Production dependencies are audited and JavaScript/TypeScript is analyzed by
  CodeQL on every change.
- Scheduled container builds are scanned for fixed high and critical
  vulnerabilities.

These checks reduce regression risk; they are not a substitute for independent
review. Cobia has not claimed a completed external security audit in this
repository.

## Deliberate non-capabilities

Production does not claim arbitrary calldata, custody, server-side principal
signing, unlimited approvals, LI.FI or bridging, Ethereum runtime, recurring
authority, universal xStocks support, unusual token compatibility, guaranteed
profitability, or complete LP lifecycle management. Adding any of these changes
the threat model and requires an explicit policy, evidence, verifier, execution,
and postcondition design.
