# Mainnet agent-program activation

This is the release gate for X Layer mainnet (`196`). Implementation in the
repository is not evidence that the production contracts or environment are
active.

## Implemented

- New V2 requests launch one open coding-agent sandbox job with canonical policy,
  address-only public wallet state, trusted manifest, and a pinned block.
- The agent has a temporary shell/filesystem, Node/TypeScript and package access,
  official-source egress, and a credential-free pinned read broker. It has no
  private key, browser wallet, unrestricted RPC, or production send method.
- The protocol-neutral program schema accepts typed capability namespaces. The
  trusted production registry currently compiles Aave supply and Curve/Uniswap
  exact-input actions; unsupported namespaces reject with no fallback.
- Independent verification covers policy, chain, block/freshness, target and
  proxy identities, selectors, value, assets, amounts, owner/recipient, deadline,
  conservation, objective/final balances, and exact fresh-fork reproduction.
- The governed executor and risk manager enforce verifier authorization, owner,
  deadline, allowed targets/selectors, token and route limits, and final balances
  atomically. Contract tests cover pause, delayed risk increases, replay,
  tampering, limits, target denial, and pre-existing executor balances.
- The product has owner-only execution preparation, live contract preflight,
  exact wallet confirmations, on-chain receipt attribution, and a public program
  view. Expired programs are shown only as `Past discovery` with no execution
  control.

## Production release gates

| Gate | Required evidence | Current repository state |
|---|---|---|
| Contract review | independent source and bytecode review | not externally reviewed |
| Deploy risk manager/executor | chain-196 receipts and verified source | deployed; receipts and local bytecode evidence recorded, explorer source verification pending |
| Configure restrictions | paused start, verifier, tokens, route/daily/cumulative caps, targets/selectors | proposals executed; everything remains paused/inactive |
| Wait delayed increases | on-chain timestamps and executed changes | eligible no earlier than 2026-08-17 18:17:40 UTC; activation not executed |
| Production environment | exact executor address/hash, verifier, OIDC identity, public origin, model, RPC | schema implemented; values not yet verified |
| Database | migrations 0009-0011 applied and checked | production migrations applied; post-release read check pending |
| Agent canary | real production sandbox + pinned replay, no principal send | pending deployed environment |
| Wallet canary | selected owner, retail amount, exact receipts and state deltas | requires separate explicit transaction approval |
| Monitoring | pause authority, alerts, receipt/reconciliation checks | pause controls implemented; operational alerts pending |

No release test may broadcast a principal transaction. Deployment/configuration
transactions and a later wallet canary are separate approvals.

## Competition and marketplace

The market projection already ranks only currently eligible quotes. Once a quote
or verified program expires, it is labeled `Past discovery`; it cannot be
selected or executed. A historical idea can only prefill a new intent whose
wallet state, block, calldata, evidence, and authorization are regenerated.

The intended timed competition model is:

1. A signed intent opens a fixed window, such as five minutes.
2. Cobia-operated and admitted community solvers may abstain, submit, or replace
   their own result with a new immutable revision while the window is open.
3. Every revision has its own pinned block, program/evidence commitments, verifier
   verdict, freshness window, and deterministic score. Replacement supersedes
   display eligibility; it never mutates prior evidence.
4. Only current independently verified revisions rank. Expired, withdrawn,
   rejected, reorged, or superseded revisions remain auditable history and have
   no selection/execution API.
5. Closing the competition freezes the winning revision. Execution still runs a
   fresh preflight and requires the owner wallet.

Continuous showcase discovery is a separate workload: solvers may publish useful
verified strategies without a user request, but those are always templates or
past observations—not wallet-specific executable quotes. Community admission,
revision storage, worker scheduling, anti-spam/bonding, and continuous discovery
are not implemented in this release slice.

## First activation sequence

1. Review the final diff, dependency audit, migrations, contract tests, unit/
   integration/fork suites, Node 24 typecheck/lint/build, and sandbox egress tests.
2. Obtain explicit authorization for the chain-196 deployment transactions.
   After `pnpm contracts:test`, generate the unsigned, nonce-bound transaction
   plan with:

   ```bash
   pnpm executor:plan -- \
     --deployer 0xDEPLOYER --nonce CURRENT_NONCE \
     --owner 0xSAFE --verifier 0xVERIFIER \
     --canary-wallet 0xCANARY
   ```

   The command has no signer or broadcast method. It emits three CREATE inputs,
   the immediately restrictive proposal batch, and a separate activation batch.
3. Deploy paused, verify source and bytecode, record code hashes, and configure
   only restrictive state.
4. Schedule capped/open-wallet risk changes, wait the full delay, inspect state,
   then enable the selected canary wallet or capped open mode.
5. Apply database migrations and production environment values, deploy the web
   app, and run API/UI plus agent/fork smoke tests without moving principal.
6. Obtain separate approval for one retail wallet canary. Confirm every approval
   and the atomic call in the wallet, attribute its receipt, then decide whether
   to remain active or pause.
