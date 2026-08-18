# General-intent V3 release readiness

Snapshot: `2026-08-18T17:30:52Z`. This is a pre-activation checkpoint, not a
production-readiness claim.

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

The seeded standing challenges use capability-manifest commitment
`0xaa8947f768daac5548f0f6b790db4516e58e61114b935e7086b3cd4c2d79e91a`.
They cover only the implemented Aave supply and Curve/Uniswap exact-input
capabilities. They contain no fabricated solver submission, quote, round, or
onchain evidence.

## Verification evidence

The post-change local gates completed successfully:

| Gate | Result |
| --- | --- |
| `pnpm test` | 953 tests: domain 134, solvers 110, web 709 |
| `pnpm typecheck` | all three workspace packages passed |
| `pnpm lint` | all three workspace packages passed |
| `pnpm build` | production Next.js build passed; only current product/API paths emitted |
| `pnpm audit --audit-level high` | no known vulnerabilities |
| `pnpm --filter @cobia/web test:integration` | 15 files, 62 PostgreSQL integration tests |
| `pnpm contracts:test` | 16 suites, 66 Solidity tests |
| `pnpm --filter @cobia/web test:fork` | 4 files, 7 real pinned Anvil-fork tests |

The contract and fork gates were run after the V3 architecture changes and
before the final UI/challenge-template-only edits. They must run again in the
final post-activation release gate.

Playwright inspection covered `390x844` and desktop layouts. The current mobile
render preserves a four-item bottom navigation, wallet-safe-area spacing, clear
capability status language, and an outcome-first hierarchy. The old
`/requests`, `/markets`, and `/routes` product URLs render the branded not-found
surface.

## Mainnet activation gate

At X Layer mainnet block `68305179`, hash
`0x73778502e68aa51f56b4f1b4cef653fe9595e666f7e356f88049978180ac6f43`,
read-only calls reproduced the unchanged delayed proposal:

- chain ID `196`;
- USDG and USDt0 each pending with `10,000,000` per route,
  `50,000,000` per canary wallet per day, and `1,000,000,000` cumulative;
- both token proposals activate after `1787229041`;
- canary wallet allow and unpause also activate after `1787229041`;
- risk manager paused, both tokens disabled, and canary not allowed;
- adapter registry paused;
- risk-manager runtime hash
  `0xe415bc68d215ff3c077c707e4493c0517b6ad76446feb49c0fe6cc00add9372c`;
- Executor V3 runtime hash
  `0x3f8d413eb3adc61d371012de8cb0aad91817bd3f077529bad2ee329aef103894`.

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
4. Apply migrations `0012` through `0016` to the production database using the
   canonical configured database only; verify the migration journal and seeded
   challenge commitments.
5. Push the logical local commits to `main`, deploy the production Vercel app,
   and verify `getcobia.com` desktop/mobile UI plus current public APIs.
6. Run one production coordinator generation and fresh replay without a
   mainnet principal transaction.
7. Keep the system canary-only. A retail-size wallet execution is a separate
   explicit user decision and is not an automated release test.

Community solver hosting, arbitrary generic calls, shopping/x402,
subscriptions, RWAs, asynchronous bridges, and guaranteed future yield remain
outside the activated capability manifest. They are product directions, not
live execution claims.
