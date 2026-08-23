# General Asset V4 readiness evidence

Date: 2026-08-23

## Release classification

The V4 foundation is locally verified, but **V4 is not approved for public contract deployment or open access**. The existing production flow remains fail-closed for V4 because its publication and execution context do not accept general-asset policies yet.

The web release may ship the existing-flow wallet sequencing improvement and the unreachable V4 foundation. Do not deploy V4 contracts, open V4 access, fund a canary, or pause V3 until every blocker below is closed and this gate is rerun.

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

## Local verification

Runtime: Node.js 24.18.0.

- Workspace unit tests: 329 files, 1,603 tests passed.
- Solidity tests: 20 suites, 86 tests passed.
- PostgreSQL integration tests: 22 files, 78 tests passed.
- Workspace typecheck: passed.
- Workspace lint: passed with one pre-existing unused-parameter warning in `capability-fork-replay-v2.test.ts`.
- Production build: passed.
- Focused V4 deployment and fork-replay tests: 7 tests passed.
- `git diff --check`: passed before the release-gate commit.

Live Ethereum and X Layer fork suites were not run because `ETHEREUM_RPC_URL` and `XLAYER_RPC_URL` were unset. The state-verification script now requires an explicit RPC instead of silently selecting a public fallback.

## Public-release blockers

1. The public compile and publish routes accept only the legacy open-intent and capability-composition policy families. V4 test fixtures can inject artifacts, but users cannot publish a V4 policy through the production path.
2. The public asset resolver is not connected to the production eligibility verifier, so arbitrary ERC-20 assets remain `verification_pending` rather than becoming executable.
3. USD exposure and liquidity evidence are supplied by the valuation provider and are not independently derived from token quantities and trusted reference prices.
4. Identity, target-code, and price evidence are not freshly revalidated immediately before wallet preparation and each destination stage.
5. The stage API does not yet drive `recordBridgeDelivery`, so a cross-chain source stage cannot automatically unlock its destination successor.
6. V3 and V4 do not yet share migration-period rolling-volume accounting.

The previously identified same-chain nonce collision is closed by deriving a unique executor nonce from the policy nonce and exact stage identity.

## External actions

At the time of this record, no V4 contract was broadcast, no Safe proposal was created, no canary funds were used, open access was not proposed or activated, and V3 was not paused.
