# General Asset V4 readiness evidence

Date: 2026-08-23

## Release classification

The V4 contracts and Tasks 1-5 hardening are locally verified, but **V4 is not
ready for dark deployment, canary activation, or public access**. The
adversarial release gate found that the production solver-decision pipeline
does not yet accept, independently compile, replay, attest, or emit execution
artifacts for `GeneralAssetProgramV1`.

Keep the already-live V3 application and contracts unchanged during judging.
Do not deploy V4, create Safe proposals, reduce V3 caps, fund a canary, start a
governance delay, or expose general-asset intent creation until the production
pipeline and reviewed chain inputs below are complete.

## Verified commits

- `f5bbe2e` domain authority model
- `8e2412b` evidence verifier
- `7463c25` USD risk manager V2
- `2aca54a` registered-adapter executor V4
- `110cc69` registered-route attestation
- `d140688` multi-chain stage persistence
- `1baf455` web flow and automatic wallet prompt sequencing
- `f327203` deployment planning and state verification
- `ab0f8e4` release-gate hardening and per-stage nonces
- `6fcabfc` arbitrary-token behavior replay
- `0c14d0a` server-owned OKX valuation and production eligibility
- `02f0128` general-asset policy compilation, publication, and persistence
- `764a37f` fresh evidence revalidation before every V4 wallet interaction
- `70717f5` canonical bridge-delivery verification and progression
- `1951574` partitioned V3/V4 migration exposure

## Verification run

Runtime: Node.js 24.18.0.

- Focused V4 verifier, asset, publication, freshness, bridge, API, fork-replay,
  and migration suites: 16 files, 83 tests passed.
- Workspace unit tests: 338 files, 1,649 tests passed.
- Solidity tests: 20 suites, 86 tests passed, 0 skipped.
- PostgreSQL integration tests: 23 files, 79 tests passed.
- Workspace typecheck: passed.
- Workspace lint: passed with one pre-existing unused-parameter warning in
  `capability-fork-replay-v2.test.ts`.
- Production build: passed.
- Targeted live Ethereum/X Layer V4 chain prerequisite: 1 test passed with
  explicit RPCs; both exact chain IDs and current canonical block hashes were
  read successfully.
- Complete fork suite: 3 files and 5 tests passed; 2 files and 3 tests failed.
  The failures are legacy V2 fixture drift: two expected composed X Layer
  routes are no longer present in the captured snapshot, and one pinned
  timestamp is now below the preceding block timestamp.
- `git diff --check`: passed.

The targeted V4 live test proves chain connectivity only. It does not replay a
reviewed production adapter route or replace a separately approved live canary.

## Public-release blockers

1. `SolverDecisionV1Schema` has no general-asset proposal variant. The public
   decision API therefore rejects a `GeneralAssetProgramV1` before verification.
2. The decision intake parses only capability-composition or legacy open-intent
   policies and requires an open-intent snapshot. General-asset publication
   intentionally persists no such legacy snapshot, so a solver run cannot enter
   the current intake path.
3. `verifyGeneralAssetProgramV1`, registered adapter compilation, and pinned
   stage replay have no production call site. Existing tests inject these
   dependencies; no production adapter compiler currently supplies them.
4. `attestExecutionProgramV4` and `GeneralAssetExecutionBundleV4` have no
   production producer. The execution APIs can consume a fixture-shaped bundle,
   but no accepted live submission can create one.
5. Multi-stage attestation currently binds every stage's input identity,
   valuation, amount, and USD exposure to the signed source-stage input. A
   destination-chain stage with a different delivered token cannot satisfy
   those checks. Stage-local valuation commitments and exposure accounting must
   be added and independently verified.
6. No reviewed production adapter manifest exists. The repository contains
   only the shape example, so exact targets, selectors, runtime code hashes,
   approval spenders, bridge emitters, and delivery semantics are not frozen.
7. Exact Ethereum and X Layer deployer nonces, governance Safe identities,
   verifier, canary wallet, registry addresses, migration snapshots, and
   production manifest hashes have not been supplied. Signer-free deployment
   plans and independently checked predicted addresses therefore cannot be
   produced yet.
8. The complete fork gate is red from the three legacy V2 fixture failures
   described above. Those must be refreshed or explicitly removed from the
   release gate with evidence before the repository can claim a fully green
   canonical fork run.

## Closed hardening blockers

- Arbitrary token discovery is address- and chain-specific and production
  execution is fail-closed on unsupported behavior.
- OKX evidence is authenticated server-side and USD-E8 exposure is derived by
  Cobia rather than accepted from a solver or browser.
- General-asset policies compile, sign, publish, and round-trip through the
  repository without legacy-schema coercion.
- Identity, valuation, canonical block, and target-code evidence is revalidated
  before initial review and every stage arm.
- Bridge progression requires matching finalized source and destination chain
  evidence; provider status is only a locator.
- The migration planner and read-back verifier enforce a fixed combined
  $50,000 V3/V4 per-chain exposure budget while V3 remains live.

## External actions

No V4 contract was broadcast, no Safe proposal was created, no governance
delay was started, no canary funds were used, no V3 cap was reduced, open access
was not proposed or activated, and V3 was not paused.
