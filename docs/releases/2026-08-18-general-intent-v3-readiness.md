# General-intent V3 release readiness

Original snapshot: `2026-08-19T00:41:56Z`. Refreshed Open V3 and governance
snapshot: `2026-08-20T11:37:54Z`. This is a pre-activation checkpoint, not a
production-readiness claim.

## Open V3 checkpoint

The public production deployment now contains the open intent exchange, signed
community solver profile registration, immutable solver/program views,
segmented solver performance evidence, SDK/example harness, and developer docs.
The coding sandbox can emit canonical `TransactionProgramV1` artifacts. The
independent verifier covers exact raw wallet calls plus strict LI.FI and OKX
provider artifacts.

That is proposal and verification infrastructure, not arbitrary production
execution. Signed community decision intake, production provider/code/replay
dispatch, staged receipt reconciliation, and multi-chain wallet review are not
complete. The tokenized-instrument and commerce production registries are empty,
so the UI must not offer tokenized-stock or x402 execution. See
`docs/evidence/general-intent-mainnet-readiness.md` and
`docs/evidence/x402-mainnet-offer.md`.

## Product delivered locally

- The public product is organized around Intent, Portfolio, Activity, Discover,
  Programs, and Solvers. Legacy request, market, route, and payment product
  paths are absent rather than redirected.
- A wallet signs a canonical General Intent V2 policy. Solvers may abstain or
  publish bounded immutable revisions during a five-minute competition.
- Only a fresh independently verified and attested V3 submission can expose
  exact wallet preparation. The server never signs or broadcasts principal.
- Standing challenges are manifest-bound templates, not quotes. Using one
  copies only its goal and validated capability parameters into an unsigned
  editor; wallet owner, request ID, nonce, times, bounds, and signature are new.
- The landing prompt rotates complete intent examples, labels live versus
  unavailable capability domains, supports direct selection and pause/play,
  pauses during interaction, and respects reduced motion.
- Commerce discovery now normalizes immutable public x402 v2 and UCP Catalog
  offers. The x402 execution lane has a canonical policy/program, coding-agent
  sandbox runner, verifier-owned merchant semantics, deterministic
  pre-authorization reproduction, exact EIP-3009 wallet authorization,
  DNS-pinned paid-resource broker, append-only lifecycle, and independent X
  Layer settlement verification.
- Payment settlement is never labeled delivery or order issuance. Direct
  contract orders require configured event/ERC-721/ERC-1155 evidence and the
  guarded V3 fresh-fork execution path. Shipping, buyer PII, tracking, refunds,
  subscriptions, and asynchronous fulfillment remain out of scope.

The production commerce merchant manifest is deliberately empty. Public offers
are therefore discovery-only and no live wallet authorization is exposed. A
remote x402 advertisement, ABI, product description, SDK, or agent output is
not sufficient trust evidence.

The seeded standing challenges use capability-manifest commitment
`0xaa8947f768daac5548f0f6b790db4516e58e61114b935e7086b3cd4c2d79e91a`.
They cover only the implemented Aave supply and Curve/Uniswap exact-input
capabilities. They contain no fabricated solver submission, quote, round, or
onchain evidence.

## Verification evidence

The earlier post-change local gates completed successfully:

| Gate | Result |
| --- | --- |
| `pnpm test` | 1,050 tests: domain 143, solvers 116, web 791 |
| `pnpm typecheck` | all three workspace packages passed |
| `pnpm lint` | all three workspace packages passed |
| `pnpm build` | production Next.js build passed; only current product/API paths emitted |
| `pnpm audit --audit-level high` | no known vulnerabilities |
| `pnpm --filter @cobia/web test:integration` | 17 files, 69 PostgreSQL integration tests |
| `pnpm contracts:test` | 16 suites, 66 Solidity tests |
| `pnpm --filter @cobia/web test:fork` | 4 files, 7 real pinned Anvil-fork tests |

After the commerce additions, the complete local pre-activation gate ran under
Node `24.19.0`: 1,050 workspace tests, all workspace typechecks and lint, the
production Next.js build, 69 PostgreSQL integration tests, 66 Solidity tests,
the high-severity dependency audit, and all seven real pinned Anvil-fork tests
passed. These commands must still be rerun after activation.

The later Open V3 checkpoint ran 1,129 workspace tests: domain 163, solvers 156,
web 804, SDK 5, and example harness 1. Workspace typecheck, lint, production
build, production dependency audit, and diff checks passed. The instrument
registry then passed its focused TDD gate as part of 168 web files and 808 web
tests, plus web typecheck and diff check. Those later checks ran under local Node
23.11.0 and emitted the repository's Node `>=24` engine warning; final release
verification must use Node 24.

The current machine's Docker daemon is unavailable, so the later Open V3
PostgreSQL/Testcontainers, Solidity wrapper, and pinned Anvil-fork gates are not
recorded as passing. The earlier pre-Open-V3 results below remain historical
evidence only, not a substitute for the required final rerun.

The contract and fork gates were run after the V3 architecture changes and
before the final UI/challenge-template-only edits. They must run again in the
final post-activation release gate.

Playwright inspection covered `390x844` and desktop layouts. The current mobile
render preserves a four-item bottom navigation, wallet-safe-area spacing, clear
capability status language, and an outcome-first hierarchy. The old
`/requests`, `/markets`, and `/routes` product URLs render the branded not-found
surface.

## Mainnet activation gate

At X Layer mainnet block `68456889`, hash
`0x32a951370ad7a5bbbf58d28e76367f91266249022e60e6881937c2b1ed8e75a9`,
read-only calls reproduced the unchanged delayed proposal:

- chain ID `196`;
- USDG and USDt0 each pending with `10,000,000` per route,
  `50,000,000` per canary wallet per day, and `1,000,000,000` cumulative;
- both token proposals activate after `1787229041`;
- canary wallet allow and unpause also activate after `1787229041`;
- risk manager paused, both tokens disabled, and canary not allowed;
- adapter registry paused;
- all three pending adapter permissions remain inactive, and each configured
  target runtime hash still equals its pending permission hash;
- risk-manager runtime hash
  `0xe415bc68d215ff3c077c707e4493c0517b6ad76446feb49c0fe6cc00add9372c`;
- Executor V3 runtime hash
  `0x3f8d413eb3adc61d371012de8cb0aad91817bd3f077529bad2ee329aef103894`.

The deterministic read-only gate is `pnpm executor:v3:verify proposed`. It pins
one canonical block and rejects changes to the chain, bindings, limits, canary,
pause state, pending governance, permissions, or runtime code. After the Safe
activation batch, the same implementation must pass as
`pnpm executor:v3:verify active` before production is enabled.

The activation batch in
`docs/deployments/xlayer-executor-v3-activation.json` must not execute before
`2026-08-20T12:30:41Z`. It requires the user's separate Safe confirmation.
Cobia does not possess a Safe signer or production principal key.

## Final release sequence

1. At or after the activation time, reread the proposals and ask the user to
   execute the already-reviewed Safe batch.
2. Independently verify the receipt, exact eight calls, registry permissions,
   token limits, canary allow state, pause state, owner/verifier/executor
   identities, and runtime hashes.
3. Run the complete workspace, integration, contract, audit, build, and pinned
   fork gates again.
4. Apply migrations `0012` through `0019` to the production database using the
   canonical configured database only; verify the migration journal and seeded
   challenge commitments.
5. Push the logical local commits to `main`, deploy the production Vercel app,
   and verify `getcobia.com` desktop/mobile UI plus current public APIs.
6. Run one production coordinator generation and fresh replay without a
   mainnet principal transaction.
7. Keep the system canary-only. A retail-size wallet execution is a separate
   explicit user decision and is not an automated release test.

Community decision submission, arbitrary staged wallet execution,
subscriptions, RWAs, asynchronous bridges, and guaranteed future yield remain
outside the production execution surface. The generic verifier, LI.FI/OKX
adapters, x402 discovery, and closed-world placement machinery are implemented,
but their production wallet paths remain disabled until the independent
decision, replay, stage, instrument, merchant, and receipt gates pass.
