# Purchased Route Execution Design

Date: 2026-08-11
Status: Approved design; implementation not started

## Goal

Let a request owner see an exact purchased V2 route execute on an isolated X
Layer mainnet fork, then optionally submit the same still-valid route through
their injected wallet on X Layer mainnet. The product must distinguish payment,
rehearsal, and principal execution at every boundary.

This slice also changes the new-intent retail default from 40% to 100% exact
protocol exposure. Users may lower the exposure deliberately. Existing signed
policies and purchased routes remain unchanged.

## Chain boundary

- Reveal payment remains on X Layer testnet, chain 1952, using the fixed payment
  asset. It pays for access to the private bundle.
- Route execution remains on X Layer mainnet, chain 196, because the registered
  Aave V3 and Uniswap V3 contracts are mainnet deployments.
- Testnet faucet balances do not represent executable route principal. They can
  exercise the payment flow only.
- Fork rehearsal uses simulated mainnet state and simulated funds. It never
  requests a wallet transaction and never changes public chain state.
- Mainnet execution requires real registered USDG or USDt0 plus OKB for gas.

The UI must not use “testnet execution” for the current route graph because no
official chain-1952 Aave/Uniswap deployment is registered.

## Product flow

The purchased-route surface becomes a linear execution ledger:

1. **Plan unlocked** — show signed policy, snapshot, route, expiry, principal,
   retained amount, and enforceable bounds.
2. **Fork rehearsal** — authenticate the buyer, execute the exact bundle at its
   captured block in disposable Anvil state, and show the verified trace.
3. **Mainnet preflight** — available only after a matching fork pass; verify
   freshness, wallet/chain, balances, registry identities, allowance, and gas.
4. **Guided transactions** — show one approval, swap, or supply step at a time.
   The user confirms every wallet prompt separately.
5. **Verified position** — report success only after transaction attribution,
   protocol events, canonical receipt checks, and state postconditions pass.

The UI never offers “execute all,” silently switches from rehearsal to mainnet,
or reports success from `eth_estimateGas` alone.

### Visual thesis

A calm transaction ledger with one obvious next safe action. Status and evidence
are primary; decorative cards and promotional language are secondary.

### Content hierarchy

- Current execution stage and network
- Exact next transaction and amount
- Preconditions and blocking errors
- Confirmed transaction hashes and protocol evidence
- Recovery action when a submitted transaction is unresolved

### Interaction

- A completed stage unlocks the next stage with a short transition.
- Expanding a confirmed step reveals target, selector, amount, gas estimate,
  block, events, and postcondition evidence.
- A wallet rejection stays on the current prepared step and never becomes a
  failure or a submitted transaction.

## Fork rehearsal

### Endpoint

`POST /api/routes/:routeId/execution/rehearsal`

The request uses a fresh, action-scoped buyer proof over:

- domain `cobia.execution.rehearsal.v1`
- configured realm
- route ID and bundle hash
- buyer address
- execution chain ID 196
- nonce and expiry

The proof nonce is consumed once. The response is `Cache-Control: no-store` and
contains no private keys, credentials, raw provider errors, or unvalidated
bundle fields.

### Execution

The service:

1. Loads the purchased artifact through the existing integrity boundary.
2. Requires a V2 bundle and re-verifies policy, snapshot, solver signature,
   registry hash, route authorization, and the captured block identity.
3. Starts the pinned Anvil container at the exact snapshot block number and
   confirms that block hash before any transaction.
4. Impersonates the purchased-route owner only inside Anvil.
5. Funds that fork address with exactly the input principal from a verified
   fork-only source and enough simulated OKB for gas.
6. Runs the existing execution engine without bypassing deployment, receipt,
   event, or state checks.
7. Always stops the container, including timeout and failure paths.

The stored rehearsal result is bound to route ID, bundle hash, registry hash,
snapshot block hash, engine version, and the resulting trace hash. A fork pass
is evidence that the committed route executed against that historical state; it
is not a guarantee that current mainnet state is unchanged.

If the local Docker/Anvil capability is unavailable, the endpoint returns an
explicit unavailable error. It does not downgrade to `eth_estimateGas` or fake a
passing trace.

## Mainnet execution

### Entry gate

Mainnet execution is available only when all conditions hold:

- purchased artifact is V2 and belongs to the connected buyer;
- a successful rehearsal exists for the exact bundle, registry, and block;
- bundle and policy are still valid at current time;
- local verification creates a fresh branded authorization verdict;
- wallet account equals the policy owner;
- wallet and read client both report chain 196;
- current registered contract runtime and proxy implementation identities match;
- the owner has sufficient input balance and OKB for the next step;
- current allowance and state are read immediately before construction;
- gas estimation succeeds for the exact transaction.

An expired bundle cannot execute. This first slice directs the owner to create a
fresh solver request; it does not extend, mutate, or silently reprice the paid
bundle.

### Guided transaction boundary

The browser constructs transactions only from the verified policy, snapshot,
bundle, verdict, and pinned registry. Model output and server-provided arbitrary
calldata are never accepted.

Before each wallet prompt the UI displays:

- action label;
- exact token amount;
- target protocol and contract;
- whether the transaction changes allowance or principal;
- expected minimum output or minted position;
- current chain and expiry.

The engine rechecks authority, freshness, deployment identity, pre-block hash,
state, and gas immediately before `eth_sendTransaction`. A prompt can outlive a
request-time deadline; therefore the product continues to describe this EOA
path as guided execution rather than atomic execution. The Uniswap action keeps
its on-chain deadline. Approval and Aave supply cannot gain an on-chain deadline
without a separate executor/account-abstraction design.

## Durable lifecycle and recovery

Add two focused persistence entities.

### Execution attempt

One live mainnet attempt is allowed per purchased bundle and owner. It stores:

- attempt ID, route ID, bundle hash, buyer, chain ID, and mode;
- rehearsal binding and trace hash;
- state: `prepared | active | partial | reconcile | failed | complete`;
- created, updated, and completed timestamps.

### Execution step

Each ordered step stores:

- ordinal and engine action label;
- exact expected `from`, `to`, zero value, calldata hash, and amount semantics;
- pre-block number/hash, expected wallet nonce, and gas estimate;
- state: `prepared | submitted | confirmed | reconcile | failed`;
- transaction hash when known;
- canonical receipt identity, protocol evidence, postcondition result, and safe
  failure code.

The prepared step is persisted before opening the wallet prompt. Once the wallet
returns a hash, that hash is durably attached before the next step appears. A
reload resumes by stored hash. If the browser disappears after broadcast but
before storing the hash, the attempt enters reconciliation: scan forward from
the stored pre-block for the buyer and expected nonce, then accept only an exact
from/to/value/input match. The product never resends a principal-moving action
while its prior submission is unresolved.

All state transitions use row locks, compare-and-set state changes, uniqueness
constraints, and exact retry comparison. Execution activity is written in the
same transaction as each durable state transition.

## API and authentication

Starting an execution attempt requires a fresh owner signature over:

- domain `cobia.execution.mainnet.v1`;
- realm, route ID, bundle hash, buyer, chain ID, rehearsal trace hash;
- nonce and expiry.

The nonce is unique and consumed transactionally. The server returns a scoped,
short-lived attempt credential for step persistence. The credential authorizes
metadata persistence only; it cannot sign or relay a chain transaction. The
wallet remains the sole transaction authority.

Expected domain, validation, provider, and database failures map to stable safe
codes. Raw RPC URLs, SQL details, headers, signatures, and credentials are never
returned to the client.

## Retail exposure

The form default becomes 100% exact protocol exposure, so a 10 USDG direct Aave
route supplies 10 USDG rather than supplying 4 and retaining 6. The signed field
remains adjustable from 0% to 100%.

Retention is a risk/liquidity choice, not a yield enhancement. The receipt shows
both the source strategy rate and portfolio-level rate so a user can see the
effect of retaining capital. LP asset splits still count as deployed capital;
they are not labelled retained cash.

## Testing

Implementation follows strict RED-GREEN cycles.

### Unit and component

- V2-only execution controls and explicit V1/non-executable states
- 100% retail default and exact atomic policy serialization
- no mainnet button before a matching fork pass
- wrong wallet, wrong chain, stale bundle, insufficient token, and insufficient
  gas states
- exact per-step amount/target/selector presentation
- wallet rejection, submitted, confirmed, partial, reconcile, and failed states
- no second send while a step is submitted or reconciling

### Disposable PostgreSQL

- attempt and step uniqueness
- legal transitions and exact idempotent retries
- concurrent start/submit/confirm behavior
- rollback when activity persistence fails
- reload recovery from stored hash
- missing-hash recovery by exact owner/nonce/calldata identity
- cross-route and cross-owner replay rejection

### Fork acceptance

- direct Aave route for the exact purchased principal
- Uniswap exact-input followed by capped Aave supply
- exact deployment identities at snapshot and receipt blocks
- canonical receipt, event, amount, and state attribution
- container cleanup on pass, rejection, timeout, and exception

### Mainnet boundary

Automated tests use scripted EIP-1193 clients and never spend live funds. A live
mainnet canary is manual, explicitly approved, capped to the entered retail
principal, and performed only after all automated gates pass.

## Non-goals

- No official claim of chain-1952 Aave or Uniswap execution.
- No arbitrary agent-authored calldata or protocol addresses.
- No automatic multi-prompt execution.
- No guaranteed APY, LP fees, token price, or future exit value.
- No LP position-manager execution in this slice.
- No bridge, leverage, borrow, recurring rebalance, or withdrawal execution.
- No production claim that a historical fork pass is current-state simulation.
- No new executor contract or account-abstraction dependency.

## Success criteria

- A purchased V2 route can produce a truthful, inspectable fork trace from the
  running app without wallet writes.
- A fresh rehearsed route can execute as guided wallet transactions on chain 196
  with every submitted hash and verified postcondition persisted.
- Reloading cannot cause an unresolved principal-moving transaction to be sent
  again.
- Old, wrong-owner, wrong-chain, altered, or insufficient-balance routes fail
  before wallet submission.
- New requests default to 100% exposure, and the UI explains retention as a
  user-selected risk buffer.
