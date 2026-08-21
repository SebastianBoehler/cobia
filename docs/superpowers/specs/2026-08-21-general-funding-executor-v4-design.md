# General Funding and Executor V4

## Status

Approved design direction, pending review of this written specification.

This design replaces the funding and action restrictions of Executor V3. It
does not make semantic templates, token lists, or protocol adapters execution
allowlists. A solver may propose any bounded EVM call program that the
independent verifier accepts and the contract can enforce safely.

## Goal

Cobia accepts an intent funded by one wallet asset, whether native OKB or an
ERC-20, and authorizes any ordered transaction combination that satisfies the
signed outcome and the verifier's whole-program proof.

OKB is a normal funding asset as well as the X Layer gas token. It may be sent,
wrapped, exchanged, supplied, paid, staked, or composed with other verified
actions. The same principle applies to ERC-20 funding: token admission is an
evidence decision, not a hard-coded product taxonomy.

## Non-goals

- multiple wallet funding assets in one intent;
- unrestricted verifier-signed execution without contract invariants;
- `delegatecall`, contract creation, or code executed in the executor's storage
  context;
- unattended signing, server custody, solver custody, or wallet-key access;
- claiming that one favorable balance delta proves the complete program safe;
- atomic claims about asynchronous bridges or off-chain fulfillment; and
- automatic mainnet activation or principal transactions during release tests.

## Authority and trust boundary

Generation is open-world. Authorization is verifier-bound and contract-bounded.

- The owner signs the policy and broadcasts the exact accepted execution.
- A solver may propose general ordered calls and may use semantic adapters as
  research or compilation aids. Adapter coverage does not determine what may
  execute.
- The verifier independently resolves identities, analyzes asset authority,
  compiles the exact program, replays it on a fresh pinned fork, and signs only
  the complete execution commitment.
- Executor V4 accepts general `CALL` actions but enforces funding, value,
  deadline, nonce, commitment, call-count, calldata, gas, approval, refund,
  predicate, and final-state invariants on-chain.
- The risk manager caps exposure per funding asset and wallet without limiting
  the semantic purpose or action composition.

A verifier signature is necessary but insufficient. A compromised verifier
must not be able to bypass the immutable V4 invariants.

## General policy V3

`GeneralIntentPolicyV3` is strict canonical JSON and commits to:

- version, request ID, chain, owner, nonce, creation time, deadline, evidence
  age, and manifest commitment;
- one `FundingAuthorizationV1`;
- the intended outcome as exact balance constraints and/or code-bound state
  predicates;
- forbidden targets, assets, recipients, selectors, and state changes;
- maximum calls, aggregate calldata, verifier-estimated gas, and native value;
- maximum temporary approvals and refund assets; and
- the objective used to rank otherwise valid programs.

The human-language goal is descriptive. The expanded signed fields are the
authority. Product labels such as Swap, Earn, Pay, Buy, Stake, or Bridge are UI
and solver hints only.

Every value-moving policy requires at least one enforceable final outcome. A
positive outcome alone is not enough: the policy also defines the permitted
wallet debit and all required non-regression, conservation, refund, and
approval conditions.

## One general funding authorization

`FundingAuthorizationV1` commits to:

- kind: `native` or `erc20`;
- chain ID and, for ERC-20, token address and runtime identity evidence;
- maximum wallet debit;
- minimum executor credit;
- token behavior evidence and freshness;
- maximum per-program native value; and
- the owner's minimum native OKB gas reserve at preflight time.

For native OKB, the wallet sends the exact accepted input as `msg.value`. Gas
is paid separately by the wallet. The browser must prove that the current
native balance covers both `msg.value` and a conservative maximum gas cost.

For a standard ERC-20, maximum debit and minimum credit are equal to the exact
input. A fee-on-transfer, rebasing, hooked, or otherwise unusual token is not
rejected merely by category, but it executes only if the verifier can model its
current behavior and the program remains valid for the observed credit. If the
on-chain debit or credit falls outside the signed bounds, execution reverts.

The executor never infers funding from its pre-existing balance. Baselines are
captured before acquisition so unrelated residue cannot satisfy the program.

## General call program

`GeneralProgramV4` commits to:

- policy, manifest, canonical-program, simulation, and evidence commitments;
- pinned block number/hash, owner, executor, deadline, and nonce;
- the exact funding authorization and accepted debit/credit bounds;
- one to eight ordered `GeneralCallV1` actions;
- all temporary approval pairs and refund assets;
- all before/after predicates and balance constraints; and
- gas, calldata, call-count, and native-value totals.

Each `GeneralCallV1` commits to:

- target, target kind, runtime code hash, and proxy identity evidence where
  applicable;
- exact calldata and native value;
- per-call gas limit;
- declared assets, accounts, approvals, and state surfaces touched; and
- descriptive provenance that carries no authority.

V4 executes only ordinary EVM `CALL`. It exposes no `delegatecall`, arbitrary
storage mutation primitive, or contract-creation path. An EOA recipient is
allowed only when the signed policy names that recipient and value transfer.

Native OKB is not forced through a swap lane. A program may retain it, transfer
it, call canonical WOKB deposit/withdraw, or use it in any later verified call.
Intermediate and output assets may be numerous; only wallet funding is limited
to one declared asset.

## Whole-program verification

The verifier fails closed in this order:

1. Strictly parse and canonicalize policy, program, manifest, and evidence.
2. Match chain, owner, executor, nonce, deadline, hashes, funding authority,
   forbidden sets, limits, predicates, constraints, and objective.
3. Confirm a canonical, final-enough, fresh pinned block.
4. Resolve every target, proxy implementation, recipient, token, selector,
   calldata field, approval, and native value.
5. Establish the wallet's maximum possible debit and the executor's exact
   authority over every asset.
6. Prove conservative flow for funding, intermediates, outputs, fees, refunds,
   and temporary approvals.
7. Reject any undeclared access to another wallet asset or recipient.
8. Replay the exact program on a fresh fork and require matching traces,
   events, state diffs, balance deltas, predicates, gas bounds, and outcome.
9. Sign an EIP-712 authorization for only the complete V4 commitment.

Verification is based on exact effects, not action names. A program may combine
swaps, supplies, payments, staking, bridging initiation, exact calls, or future
actions when the same proof succeeds.

For asynchronous protocols, V4 may prove only the source-chain transaction and
its immediate post-state. Later delivery, claims, refunds, or fulfillment are
separate lifecycle states and cannot be represented as an atomic final result.

## Conservation and non-regression

An accepted program must prove all of the following:

- the declared wallet funding debit stays within its signed maximum;
- requested balance or state outcomes satisfy their signed bounds;
- undeployed native and ERC-20 funding returns to the owner;
- every intermediate asset has a declared final owner, recipient, or zero
  executor residue requirement;
- temporary approvals are zero after their final use;
- no forbidden asset, account, recipient, target, or selector changes;
- the executor retains no undeclared native value or token residue; and
- all required before/after predicates hold against the committed code.

The verifier must reject a program that achieves the requested gain while also
causing an undeclared loss, approval, recipient transfer, or persistent
executor balance.

## Executor V4 sequence

Executor V4 performs:

1. validate the complete program and verifier authorization;
2. require the owner as caller and enforce exact native-value semantics;
3. mark the nonce and consume the maximum risk budget;
4. run before predicates and capture all declared balance/allowance baselines;
5. acquire the one funding asset and verify actual debit/credit bounds;
6. establish only the exact temporary approvals required for the next call;
7. execute each committed call with its exact value and gas cap;
8. clear each temporary approval immediately after its final use;
9. refund all declared residual assets and native value;
10. enforce balance, allowance, residue, and state constraints;
11. run after predicates; and
12. emit program, simulation, evidence, and observed-result commitments.

Any failure reverts the complete transaction, including nonce and risk-budget
consumption. V4 is non-upgradeable and separately governed. V3 remains readable
and has no implicit fallback from a V4 policy.

## Immutable V4 limits

Initial constants bound the verifier's authority:

- one funding asset;
- eight calls, eight predicates, and eight balance constraints;
- sixteen approval pairs and sixteen refund assets;
- bounded per-call and aggregate calldata;
- bounded per-call and aggregate gas;
- bounded native value equal to committed allocations plus refund closure;
- no delegatecall or creation; and
- non-reentrant owner-only entry.

Limit increases require a new audited executor version. Risk-manager caps may
be reduced immediately and increased only through delayed governance.

## Product flow

The composer accepts native OKB or an ERC-20 identity rather than selecting
from a fixed execution token list. Search and mentions resolve symbols to exact
chain/address identities; ambiguous symbols require clarification.

Before the owner signs, the receipt shows:

- funding kind, exact identity, maximum debit, and minimum credited amount;
- native value and worst-case gas reserve;
- complete ordered calls, targets, values, and temporary approvals;
- requested outcomes and non-regression constraints;
- refund and residual rules;
- pinned evidence and expiry; and
- separate confirmations for policy signing and transaction execution.

Unsupported means the verifier could not prove the current proposal, not that
the product category or token symbol is absent from a template.

## Failure model

Stable rejection codes distinguish:

- ambiguous or unresolved asset identity;
- insufficient funding or native gas reserve;
- stale/reorganized evidence or code/proxy drift;
- debit/credit behavior outside signed bounds;
- undeclared wallet authority, asset flow, recipient, approval, or residue;
- forbidden call type, target, selector, value, or state change;
- call revert, gas exhaustion, false predicate, or failed balance constraint;
- fork trace/event/state mismatch; and
- expired, replayed, or mismatched authorization.

The UI reports the exact verifier abstention or execution preflight failure. It
does not collapse these conditions into a generic unsupported-intent message.

## Tests and adversarial review

Implementation starts with red tests for:

- canonical commitments across native and arbitrary ERC-20 funding;
- exact `msg.value`, gas reserve, debit/credit, nonce, deadline, and rollback;
- changed call order, target, code hash, proxy identity, calldata, value, gas,
  recipient, approval, refund, predicate, balance constraint, or evidence;
- malicious and unusual tokens, transfer fees, rebases, callbacks, dirty return
  values, missing returns, and balance spoofing;
- approval theft, unrelated pre-existing allowances, reentrancy, hidden residue,
  undeclared wallet debits, and favorable-outcome-plus-hidden-loss programs;
- native OKB retain/send/wrap/unwrap and multi-action compositions;
- arbitrary ERC-20 multi-action compositions on a fresh pinned fork; and
- verifier-compromise attempts against every immutable V4 invariant.

Required gates are unit, property, Foundry fuzz/invariant, integration,
typecheck, lint, build, migration, diff, and opt-in real pinned-fork suites. An
independent adversarial review must attempt to turn general calls, existing
allowances, token behavior, native value, and incomplete constraint sets into
wallet or executor loss.

## Release boundary

Production wallet authentication must first have a valid independent
`WALLET_AUTH_SECRET`; the current generic compiler 503 is a deployment
configuration defect, not part of V4.

V4 deployment does not activate it. Release requires exact source/build/runtime
identity, verifier and risk-manager binding, delayed governance, live read-only
state verification, fresh-fork reproduction, and a separate explicit owner
approval for a capped native-OKB canary. Automated tests never broadcast a
mainnet principal transaction.
