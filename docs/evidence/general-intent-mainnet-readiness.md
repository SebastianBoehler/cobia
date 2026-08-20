# General-intent mainnet readiness evidence

Snapshot: `2026-08-20T11:37:54Z`

Verdict: **Open proposal generation and deterministic verification are
implemented; arbitrary staged mainnet execution is not yet enabled.**

## Implemented and verified locally

- `OpenIntentPolicyV3` and `TransactionProgramV1` provide strict canonical
  commitments for wallet address, outcomes, bounds, deadlines, public-state
  snapshot, and ordered stage dependencies.
- The sandbox parser accepts canonical programs, provider artifacts, evidence,
  and provenance. It accepts no key, seed phrase, wallet provider, credential
  RPC URL, or production send method.
- The open verifier validates raw wallet stages and manifest-backed LI.FI and
  OKX provider payloads against exact chain, owner, target, selector, value,
  approval, asset flow, code identity, anchor, simulation, and replay evidence.
- The LI.FI read broker exposes only bounded documented HTTPS reads and strips
  ambient credentials.
- The public intent API, immutable submission views, solver registration,
  segmented performance projection, SDK, example harness, and developer docs
  are present.
- Tokenized instruments require exact issuer, token, underlying, claim class,
  jurisdiction, restrictions, official source hashes, proxy/runtime identity,
  and expiry. The production registry is empty and fails closed.
- The x402 placement and settlement machinery exists, but the production
  merchant manifest is empty. The inspected PixelBrief offer is blocked because
  its resource is HTTP-only.

## Missing before the requested three-outcome mainnet demo

1. Accept signed community solver decisions, bind them to a coordinator-selected
   snapshot, and dispatch them through a production provider/code/replay runtime.
2. Persist exact stage state and independently reconciled receipts so a bridge
   source, async delivery, destination acquisition, and x402 authorization
   cannot be skipped, reordered, duplicated, or mutated.
3. Extend the browser review client to Ethereum chain `1` while preserving X
   Layer `196` defaults and one visible wallet confirmation per exact request.
4. Register one real tokenized instrument only after issuer, restriction,
   jurisdiction, official-source, and current code-identity evidence is complete.
5. Register one real HTTPS x402 offer only after the complete manifest and live
   challenge gate passes.

The existing V3 atomic path remains separate. It is not a fallback for an
unverified open program, and fork replay is evidence generation only—not
production execution.

## Local gate evidence

Most recent complete workspace checkpoint before the instrument registry:

| Gate | Result |
| --- | --- |
| `pnpm test` | 1,129 tests: domain 163, solvers 156, web 804, SDK 5, example 1 |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed |
| `pnpm audit --prod --audit-level high` | no vulnerabilities |
| `git diff --check` | passed |

After the instrument registry, the focused web suite passed with 168 files and
808 tests, web typecheck passed, and `git diff --check` passed.

The current machine cannot run the PostgreSQL/Testcontainers, Solidity wrapper,
or pinned Anvil-fork gates because its Docker daemon is unavailable. Those gates
must pass after activation before a production-readiness claim.

The local Node runtime is `23.11.0` while the repository requires Node `>=24`.
The recorded workspace gates passed despite the warning; the final release gate
must use Node 24.

## Mainnet governance state

At X Layer block `68,456,889`, hash
`0x32a951370ad7a5bbbf58d28e76367f91266249022e60e6881937c2b1ed8e75a9`,
`pnpm executor:v3:verify proposed` reproduced chain `196`, two unchanged token
proposals, three unchanged permission proposals, and the expected paused state.
The block timestamp was `1787225925`.

The Safe activation batch must not execute before
`2026-08-20T12:30:41Z`. It is not broadcast by Cobia. After the user confirms
that reviewed batch, `pnpm executor:v3:verify active` must independently pass
before any V3 mainnet canary is presented.

## Honest product claim

Cobia is currently an open solver exchange plus a conservative verifier
foundation, with a bounded V3 execution lane awaiting governance activation.
It must not yet claim that users can execute arbitrary LI.FI bridges,
tokenized-stock purchases, or x402 purchases from production. The next beta
checkpoint is one tiny user-approved X Layer swap; bridge, registered instrument,
and HTTPS x402 proofs follow only when their independent evidence gates pass.
