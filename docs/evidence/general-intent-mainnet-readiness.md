# General-intent mainnet readiness evidence

Snapshot: `2026-08-22T15:16:00Z`

Verdict: **Registered stablecoin-yield composition, independent verification,
competition ranking, and Executor V3 preparation are implemented. Arbitrary
staged mainnet execution is not enabled.**

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

## Registered composition capability

The supported `CapabilityCompositionPolicyV1` lane is deliberately narrower
than the general-intent schemas:

- X Layer chain `196`; registered USDG/USDt0 assets; maximum-input semantics.
- A `maximize-net-yield` objective with a signed 1-365 day horizon. The current
  composer discloses and uses a 30-day product default.
- Registered `aave-v3.supply@1`, `curve-stableswap-ng.exact-input@1`, and
  `uniswap-v3.exact-input@1` only.
- Either direct Aave supply or one exact-input swap followed by terminal Aave
  supply. The policy schema permits bounded capability lists, but the current
  authority intentionally rejects any wider action graph.
- A signed conversion-loss ceiling, derived minimum registered receipt-value
  floor, exact aToken minimum-increase constraint, frozen route/price/gas
  evidence, and maximum gas/action/approval/fee bounds.
- Solver admission requires a fresh registered profile advertising
  `policy.capability-composition@1`; absence returns clarification instead of a
  policy no deployed solver can execute.
- Accepted revisions are ranked by deterministic USD-E8 receipt value plus the
  committed Aave horizon yield, less expected gas and the maximum solver fee.
  This is a comparable forecast objective, not a guaranteed profit claim.
- An attested winner is prepared through the existing Executor V3 path. The
  wallet remains the only party that can approve and broadcast it.

## Still missing for the arbitrary three-outcome mainnet demo

1. Extend the signed solver intake and coordinator-owned snapshots beyond the
   registered yield-composition lane to arbitrary three-outcome programs and
   their production provider/code/replay runtimes.
2. Persist exact stage state and independently reconciled receipts so a bridge
   source, async delivery, destination acquisition, and x402 authorization
   cannot be skipped, reordered, duplicated, or mutated.
3. Extend the browser review client to Ethereum chain `1` while preserving X
   Layer `196` defaults and one visible wallet confirmation per exact request.
4. Register one real tokenized instrument only after issuer, restriction,
   jurisdiction, official-source, and current code-identity evidence is complete.
5. Register one real HTTPS x402 offer only after the complete manifest and live
   challenge gate passes.

The V3 atomic path now consumes independently attested registered composition
programs. It remains unavailable as a fallback for an unverified open program,
and fork replay is evidence generation only—not production execution.

## Local gate evidence

Most recent complete workspace checkpoint:

| Gate | Result |
| --- | --- |
| `pnpm test` | 288 files / 1,383 tests: domain 168, solvers 157, replay 1, SDK 14, web 1,012, example 31 |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed after removing four stale imports |
| `pnpm build` | passed |
| Composition PostgreSQL integration | 1 test passed with Testcontainers |
| Pinned X Layer fork lane | 4 files / 7 tests passed; direct Aave, Uniswap→Aave, and Curve→Aave included |
| `git diff --check` | passed |

The local production build loaded the exact advanced prompt in Chrome with no
Cobia application error. Review/publication stopped at the intentional signing-
wallet gate; this verification did not connect a wallet, create a competition,
or claim a mainnet transaction.

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
