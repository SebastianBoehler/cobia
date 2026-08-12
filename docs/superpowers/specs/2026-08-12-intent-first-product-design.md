# Cobia Intent-First Mainnet Product Design

**Status:** Approved visual direction, implementation specification

**Reference:** `exec-1d0ed201-261b-45b6-8cc5-01b354956941.png`

**Scope:** Cobia web product, verified solver graph, simulation, and capped X Layer mainnet execution

## Product promise

Cobia lets a user describe a financial outcome, compare independently verified
routes, simulate the selected transaction graph, and execute it non-custodially
within explicit on-chain bounds.

The intent describes the outcome. It must not prescribe a protocol. Solvers may
compose registered actions including swaps, lending, staking, liquidity
provision, flash liquidity, and later bridge settlement. Cobia only makes a
route executable after a deterministic compiler reconstructs its calls and an
independent verifier proves that the route satisfies the signed policy.

## Truth boundary

The interface separates three classes of information everywhere:

1. **On-chain bounds** are exact constraints the executor can enforce in the
   transaction: maximum input, minimum output, recipient, deadline, allowed
   targets and selectors, maximum slippage, debt repayment, and final balance or
   position constraints.
2. **Simulation results** are current-state execution evidence at a named block:
   ordered calls, expected token and position deltas, gas, protocol events, and
   postconditions. They expire and must be rerun before execution.
3. **Forecasts** are estimates: APY, LP fees, reward emissions, future prices,
   impermanent loss, and profit over a horizon. They are never labelled as
   guaranteed or as an on-chain minimum.

No screen may turn an APY forecast into a guaranteed return. A guaranteed swap
minimum is permitted. A flash-loan route is permitted only when repayment and
minimum final wallet balance are enforced in the same atomic transaction.

## Intent model

The public composer exposes three user outcomes:

- **Earn:** maximize forecast portfolio value over a selected horizon while
  enforcing a minimum immediate exit value or minimum received position.
- **Swap:** maximize exact output balance for a selected input/output pair while
  enforcing `amountOutMinimum`, recipient, deadline, and spend cap.
- **Profit:** maximize immediate final wallet value through an atomic route while
  enforcing a user-selected minimum profit and full repayment of temporary
  liquidity. Non-atomic or future-yield claims cannot satisfy this objective.

Natural-language input is an editing convenience, not execution authority. It
is parsed into a visible typed receipt that the user reviews and signs. The
signed receipt remains the authoritative policy.

## Solver and adapter model

The market consumes a block-pinned graph of typed opportunities. A node is an
asset or position on a chain. An edge is a versioned adapter action with exact
input semantics, output semantics, expiry, target identity, and a deterministic
calldata builder.

Solvers can search and rank this graph but cannot invent calldata, contracts,
tokens, recipients, allocations, rates, or evidence. Each result contains only
registered action references and typed parameters. The verifier independently:

1. reconstructs every action through the current registry;
2. checks code and proxy implementation identities at the simulation block;
3. proves amount conservation and policy compliance;
4. simulates the complete atomic route against current X Layer state;
5. checks ordered calls, asset/position deltas, events, repayment, and final
   postconditions;
6. commits the policy, route, registry, simulation, and constraints hashes.

Bridges require a separate settlement model because the destination outcome
cannot be enforced inside one X Layer transaction. They remain a future route
class with an explicit settlement deadline and recovery path, never mixed into
the initial atomic-mainnet label.

### Agentic strategy harness

The agentic solver is an iterative strategy-development harness, not a text
classifier. For each immutable intent and snapshot it may:

- inspect registered asset, position, pool, rate, liquidity, gas, and risk tools;
- write and execute ephemeral strategy code in a resource-limited sandbox;
- construct route graphs, allocations, loops, and temporary-liquidity plans;
- run deterministic unit checks and fork simulations;
- inspect failed constraints and refine a candidate;
- compare candidates on exact objective values before producing an explanation.

The sandbox has no wallet key, signing authority, production database write,
unrestricted RPC, arbitrary network access, or secret-bearing environment. Its
only executable output is a canonical route IR containing versioned adapter and
opportunity references. Model-authored raw calldata, targets, selectors,
addresses, approvals, prices, evidence, or claimed simulation results are
discarded and reconstructed by the trusted compiler.

If the agent identifies an unsupported protocol, it may generate an adapter
proposal with source links, ABIs, deployment identities, codecs, invariants,
tests, and simulations. That proposal enters the normal review and registry
activation workflow. It cannot be installed or used with real funds during the
same solver run. This preserves open-ended research while keeping execution
authority small, versioned, and auditable.

## Primary user journey

### 1. Describe the outcome

The left pane is the only composition surface:

- Earn, Swap, and Profit modes;
- a concise natural-language intent;
- token selectors with real token marks;
- amount and balance;
- a single primary `Find verified routes` action;
- advanced bounds in progressive disclosure.

The user signs only after the parsed policy receipt is visible. Protocol names
belong in route results, not in the intent.

### 2. Compare verified routes

The right pane is ordered by the user's objective. One best route is expanded;
alternatives are compact rows. A route exposes only the facts needed to decide:

- route path with protocol and token marks;
- input amount;
- enforceable minimum received;
- estimated result;
- estimated gas and freshness when relevant;
- verification state.

Raw commitments, calldata, code hashes, evidence, and risk flags live under
`Simulation & verification details`.

### 3. Run final simulation

The dominant route action is `Run final simulation`. The result replaces the
forecast-only state with:

- simulation block number and hash;
- exact call sequence;
- before and expected-after balances and positions;
- minimum enforced output;
- gas estimate;
- all postconditions and their pass/fail state;
- an expiry countdown.

Any registry, implementation, block, nonce, wallet, balance, allowance, price,
or policy change invalidates the simulation.

### 4. Execute

Execution uses one atomic executor transaction for supported routes. The wallet
reviews one transaction containing the exact committed steps and constraints.
The executor is paused by default, wallet allowlisted during beta, and enforces
per-route, daily-wallet, and cumulative caps.

The interface says `Execute on X Layer`, not `guided execution`, only after the
executor is deployed, source-verified, registry-pinned, freshly simulated, and
enabled for the connected wallet. Until then it remains explicitly unavailable.

## Visual system

The approved layout is a quiet, high-contrast split canvas:

- left rail: outcome composition;
- right canvas: best route and alternatives;
- one blue action at a time;
- green only for enforceable or verified facts;
- amber only for estimates and forecasts;
- red only for failed bounds or unsafe execution state;
- generous spacing, hairline borders, and no decorative card stacking.

Light and dark themes are equally supported through semantic design tokens.
Token and protocol identity uses sourced brand assets or a maintained asset
library. Missing marks fall back to a neutral monogram with an accessible name,
never an emoji or fabricated logo.

## Navigation and terminology

Top-level navigation is deliberately small:

- `New intent`
- `Positions`
- `Activity`

The transient route market is part of the New intent journey, not a separate
empty `Explore` destination. `Positions` contains wallet assets and executed
protocol positions. `Activity` contains signed intents, simulations, payments,
executions, and recoverable states.

Preferred language:

- intent, route, solver, simulation, bound, position, execution;
- `you receive at least` for an enforceable output;
- `expected result` for simulation or forecast output;
- `estimated APY` with an explicit horizon;
- `verified` only when the named verifier stage actually passed.

Avoid `allocation quote`, `competition`, `principal protected`, or `best APY`
unless the underlying artifact proves that exact claim.

## Responsive behavior

- Desktop uses a fixed navigation header and two-column product canvas.
- Tablet stacks composer above results but preserves the single primary action.
- Mobile uses a four-stage progress header: Intent, Routes, Simulation, Execute.
- Route steps wrap horizontally only when readable; otherwise they become a
  vertical timeline.
- Critical values never truncate. Addresses and hashes may use accessible
  middle truncation with copy controls.

## Accessibility

- All controls are keyboard reachable with a visible focus ring.
- Theme contrast meets WCAG AA for body text and controls.
- Icons have text labels or accessible names.
- Color is never the only distinction between bound, estimate, and failure.
- Dynamic route, simulation, and execution states use polite live regions.
- Reduced-motion preferences disable nonessential transitions.

## Proactive wallet scout

`Cobia Scout` is a separate opt-in discovery loop. It reads public X Layer
wallet balances, registered positions, and explicit user preferences, then
matches only routes the wallet can currently fund. It never signs, approves,
executes, withdraws, borrows, or changes a position.

An alert is eligible only when a fresh candidate:

- uses assets and positions currently held by the watched wallet;
- leaves the configured gas reserve untouched;
- clears reveal cost, estimated gas, slippage, and the user's minimum value
  improvement or output bound;
- uses the saved risk, adapter, token, horizon, and exposure preferences;
- still passes the normal registry, verifier, and simulation boundary;
- has not already been sent within the user's cooldown window.

The notification leads to a prefilled, reviewable intent. It never creates a
signature or transaction automatically. Wallet analysis is local by default;
server-side monitoring requires explicit address opt-in, notification consent,
retention controls, and an immediate delete/disable action. Alerts may be shown
in-app first, then optionally through web push or email. No watched address,
balance, or position is used in public marketing content.

## Evidence-backed social agent

Marketing automation is isolated from solvers, execution, and wallet data. A
social agent may turn approved public evidence into draft posts: shipped adapter
support, source-verified deployments, transaction receipts, aggregate route
statistics, educational threads, and launch updates.

The initial X integration is draft and schedule only, with human approval per
post. It stores the source evidence and final rendered copy, applies a public
claim policy, removes addresses and user-level financial data, respects rate
limits, and has a global kill switch. Narrow auto-posting can be enabled later
only for allowlisted machine-verifiable event templates, such as a public
release tag or an explicitly public source-verified deployment. Performance,
yield, safety, and user-result claims always require human approval.

## Production gates

Public mainnet launch requires all of the following:

- atomic executor and adapter registry deployed, source-verified, and monitored;
- upgradeable targets pinned by proxy and implementation identity;
- current-state full-route simulation committed to executor authorization;
- independently reviewed contract, compiler, and postcondition validators;
- multisig-controlled pause, signer rotation, adapter activation, and caps;
- allowlisted capped beta with funded canaries and reconciliation drills;
- RPC redundancy, rate limits, error tracking, database backups, and runbooks;
- legal/risk disclosures and protocol-specific exit/recovery flows;
- no unresolved high-severity dependency or application security findings.

The first production slice remains same-chain X Layer atomic execution. Adapter
breadth grows behind the same manifest, graph, simulation, and postcondition
boundary; protocol count is never itself a launch criterion.

## Acceptance criteria

1. A retail user can understand input, minimum received, expected result, and
   next action without opening technical details.
2. The UI never presents a forecast as an enforceable minimum.
3. The best route and alternatives use live persisted artifacts, not examples.
4. Route steps show real token and protocol identities.
5. Earn, Swap, and Profit compile to distinct typed policies; unavailable route
   classes are not silently coerced into Earn.
6. Final simulation shows explicit balance/position deltas and fails closed.
7. Mainnet execution becomes available only through the capped atomic executor.
8. The app passes unit, integration, type, lint, build, accessibility, visual,
   contract, security-audit, and fixed-fork verification gates.
