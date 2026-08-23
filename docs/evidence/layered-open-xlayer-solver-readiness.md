# Layered open X Layer solver readiness

Date: 2026-08-23

## Scope and boundary

This release adds an open transaction-program lane, operator-declared protocol
capabilities, native OKB and OKX routing, exact Aave receipt withdrawal, and
single-coin Curve liquidity actions. Capability declarations are routing and
discovery metadata; the verifier remains authoritative for every program.

The release branch is based directly on `origin/main`. It excludes the
concurrent general-asset and Executor V4 work. No wallet transaction was signed
or broadcast during deployment verification.

## Confirmed causes

- Hetzner stored the required OKX credentials, but Compose did not pass them to
  the solver container. Deterministic OKX routes therefore abstained.
- One global limiter wrapped the complete intent lifecycle. A long Codex search
  blocked later deterministic intents until their competition windows expired.
- An interrupted worker could leave a run revision unresolved. The worker now
  persists and resumes the same revision, converts terminal open-search errors
  into explicit abstentions, and aborts active Codex work during host shutdown.
- Snapshot capture already includes input and output tokens. A focused
  regression now locks output-only native OKB evidence into that contract.

## Verification

Verified on the exact non-V4 release tree before deployment:

```text
pnpm test
311 test files passed; 1,522 tests passed

pnpm typecheck
All seven workspace projects with typecheck scripts passed

pnpm build
Next.js production build and open-solver runtime build passed

docker build -f examples/open-solver/Dockerfile .
Node 24 production image built successfully; runtime reported v24.19.0

docker compose config --quiet
Production Compose contract parsed successfully and exposed the three OKX
credential names to the solver service
```

## Production deployment

- Source tree deployed from commit `0eb00be` by a tracked-file archive. The
  remote `.env`, database, Codex authentication, and solver-state volumes were
  preserved.
- Previous image retained as
  `cobia-production-solver:pre-layered-open-20260823`.
- New image manifest:
  `sha256:25bef870eb8eebeb924174ccb1776ba66abde2af90859f56b3e13aba7ada0562`.
- Solver container reported `healthy`, Node `v24.19.0`, and successful
  registration for `cobia-reference`.
- Runtime presence checks returned true for `OKX_API_KEY`, `OKX_SECRET_KEY`,
  `OKX_PASSPHRASE`, `XLAYER_RPC_URL`, and `COBIA_MODEL`; values were not printed.
- `https://api.getcobia.com/healthz` returned `ok: true` with zero active replay
  jobs.
- `https://getcobia.com/api/network/status` returned X Layer chain 196 in
  `live` state at block `68711069`.
- The public solver profile returned all declared layered capabilities,
  including `okx.dex-routing@1`, `xlayer.native-okb@1`, and
  `general.evm-program@1`.

## Remaining live check

Create a fresh low-value intent after the web deployment reaches production.
The expected result is either a verified proposal or an explicit bounded
abstention. Do not sign or broadcast wallet execution solely as a deployment
test.
