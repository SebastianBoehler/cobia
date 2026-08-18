# General intent product experience

Date: 18 August 2026  
Status: approved design

## Purpose

Cobia should present one general product: a user describes an on-chain outcome,
reviews explicit authorization bounds, receives independently verified solver
programs, and decides whether to execute the exact accepted program with their
wallet.

Earn, swap, and profit are useful examples. They are not the product taxonomy.
The interface must also make room for payments, subscriptions, commerce, RWAs,
staking, liquidity, borrowing, and wallet management as verifier-owned
capability modules are admitted.

## Goals

- Make a hybrid natural-language composer the primary entry point.
- Show the canonical policy before the wallet signs it.
- Organize public discovery around intents and verified programs, not APY-only
  asset markets.
- Keep portfolio, activity, and wallet history as first-class product surfaces.
- Give solvers a competition lifecycle with immutable revisions and expiry.
- Replace the old market, quote, and Earn/Swap/Profit product taxonomy cleanly.
- Give each solver a public evidence-backed identity and submission history.
- Unify the header, canvas, cards, and mobile navigation into one visual system.
- State what is enforceable, forecast, unsupported, or historical.

## Non-goals

- Solver hosting, worker queues, admission, bonding, and community scheduling.
- Pretending an unsupported domain can execute before a trusted capability
  module and deployment manifest exist.
- Giving an LLM authority to sign, approve, broadcast, or declare safety.
- Guaranteeing future APY, LP fees, impermanent loss, asynchronous bridge
  completion, merchant fulfillment, or off-chain delivery.
- Replacing the independent verifier or user-wallet execution boundary.

## Product model

The primary object is an intent. An intent contains:

- a human goal for display;
- a canonical typed policy for authorization;
- a fixed competition window;
- immutable solver-program revisions;
- independent verifier verdicts and evidence;
- one selected current proposal, if any;
- a separate wallet-controlled execution lifecycle.

A standing challenge can remain publicly discoverable without an end date, but
its solver programs cannot. Every challenge runs bounded rounds whose revisions
expire with their block snapshot and evidence. A discovered program is only a
template or past observation. It becomes executable only after Cobia creates a
fresh custom intent and regenerates wallet state, policy, pinned evidence,
authorization, and verification for the connected owner.

## Information architecture

The primary navigation is:

1. **Intent** — create an intent and inspect owned intent competitions.
2. **Portfolio** — balances, positions, allowances, and wallet-specific context.
3. **Activity** — signed policies, verified programs, confirmations, receipts,
   failures, and reconciliation.
4. **Discover** — standing challenges, custom competitions, and verified program
   discoveries.

Solver identities are a first-class Discover dimension. `/solvers` lists
participating implementations; `/solvers/:solverId` shows capabilities,
accepted, rejected, and superseded submissions, verified wins, and evidence
anchors. Solver rationale and self-description are clearly separated from
verifier-owned measurements.

Desktop uses a compact top navigation. Mobile and wallet browsers use a fixed
four-item bottom navigation with safe-area padding. The top bar keeps brand,
network, theme, and wallet controls only.

This release is a deliberate product-surface reset. `/requests`, `/markets`,
and `/routes` are removed rather than retained as compatibility aliases. The
new canonical paths are `/intents`, `/programs`, `/discover`, and `/solvers`.
Immutable execution receipts and persisted verification evidence remain
retained for audit, but old quote or market records do not become actionable
through the new interface.

## Hybrid composer

### Step 1: describe the outcome

The default control is a multi-line prompt titled “What should happen?” It may
use connected-wallet context but never asks for a private key or seed phrase.

Example prompts are grouped by domain:

- Invest: “Rebalance 100 USDG into the best verified low-risk position.”
- Exchange: “End with at least 99.5 USDt0 from at most 100 USDG.”
- Pay: “Pay this x402 request, but spend at most 8 USDG.”
- Buy: “Settle this verified on-chain order below 50 USDG including fees.”
- Manage: “Renew approved subscriptions while keeping 200 USDG untouched.”

Only examples supported by the active manifest are actionable. Others carry a
“Requires capability module” label and explain the missing verifier boundary.

### Step 2: review the policy receipt

An agent may draft structured fields, but the draft has no authority. The user
reviews an editable receipt containing:

- chain and owner address;
- maximum input assets and amounts;
- allowed output assets;
- recipient or owner constraints;
- allowed capability identifiers and versions;
- forbidden targets and assets;
- action, value, gas, slippage, and deadline bounds;
- required final balances or predicate outcomes;
- atomicity requirements;
- forecasts that are explicitly not enforced.

Unknown or ambiguous intent text fails closed and asks for a specific missing
constraint. Cobia never silently broadens a policy.

### Step 3: sign and compete

The wallet signs the canonical policy commitment. Signing opens a bounded solver
competition; it does not move funds or approve tokens.

The competition screen shows remaining time, solver participation, current
verified leader, revision history, and why rejected proposals failed. A solver
may abstain or replace its own result with a new immutable revision until close.

### Step 4: inspect and execute

The accepted program page leads with:

- requested outcome;
- independently verified result;
- enforced minimum or postcondition;
- wallet spend and approval requirements;
- gas estimate and freshness;
- atomic program steps;
- verifier verdict and rejection codes;
- expiry and pinned block.

Agent provenance, commands, fetched sources, generated files, dependency hashes,
trace hashes, and state diffs live in an expandable read-only lab. The lab is not
the safety verdict.

Execution remains a separate flow. The browser obtains the exact independently
attested calls, reconstructs and compares them, and asks the owner wallet to
confirm each required approval followed by the atomic executor call.

## Domain truth model

Every domain card has one of three states:

- **Available** — the active manifest and verifier implement the capability.
- **Rehearsal** — implemented and independently testable, but not active for
  production wallet execution.
- **Designed for** — a product direction with no executable claim.

The initial production manifest remains narrow: Aave V3 supply and exact-input
Curve or Uniswap V3 swaps on X Layer. The protocol-neutral schema is broader,
but schema acceptance alone is not semantic support.

x402 can authorize a bounded on-chain payment when the merchant request,
recipient, asset, amount, expiry, and settlement semantics verify. It does not
prove delivery or make arbitrary commerce atomic. Recurring subscriptions need
separate per-period policy and revocation semantics.

## Discover and solver competition

Discover has two filters:

- **Standing challenges** — common outcomes that remain discoverable and accept
  solver revisions through rolling bounded rounds.
- **Custom intents** — owner-, amount-, recipient-, and deadline-specific
  competitions.
- **Past discoveries** — historical, expired, superseded, or template programs.

An always-available challenge is not an always-valid quote. Its current leader
must still have a fresh pinned block, independently reproduced evidence, and an
unexpired round. Selecting a challenge instantiates a new editable policy
receipt; it never copies authorization, calldata, wallet state, or simulation
from the public discovery.

Only current independently verified revisions receive a rank or executable CTA.
Past items show discovery time, block, expiry reason, and “Create fresh intent.”
They never reuse calldata, simulation, authorization, or wallet state.

Ranking is deterministic from policy-defined objectives and verifier-owned
measurements. Solver rationale and popularity are context, not ranking evidence.

Each immutable program revision is attributed to a solver identity. A solver
may abstain or publish a higher revision until the competition closes. Only its
latest current independently verified revision can rank; prior revisions remain
visible as superseded history. Solver profile statistics are derived from
persisted verifier verdicts and receipts, never from solver claims.

## Visual system

The interface uses one neutral green-white surface family in light appearance
and one near-neutral green-black family in dark appearance.

- Header, canvas, and mobile navigation share the same base surface.
- White cards create elevation; large blue-tinted containers are removed.
- Cobalt is reserved for the primary action, selected state, links, and focused
  controls.
- Green communicates independently verified or successful state only.
- Amber communicates forecast, waiting, or expiring state.
- Red communicates rejection or failed enforcement only.
- Borders communicate structure; restrained shadows communicate elevation.

The header is visually quiet and does not compete with the outcome composer.
There is one filled primary action per view. Nested radii remain concentric.
Motion is limited to interruptible color, opacity, and small positional changes,
and reduced-motion preferences remove nonessential movement.

## Responsive behavior

- At narrow widths, the composer, receipt, and result sections form one column.
- Critical amounts, recipient, deadline, and minimum outcome remain visible
  without horizontal scrolling.
- Advanced constraints collapse behind a clearly labelled disclosure.
- The bottom navigation never overlaps content or wallet confirmation controls.
- Tables become labelled cards; commitments wrap or truncate with copy controls.
- Touch targets are at least 44 by 44 CSS pixels.

## Accessibility

- Every state has text in addition to color.
- Navigation exposes `aria-current`; tabs and disclosures use native semantics.
- Policy validation errors link to and focus the exact field.
- Dynamic solver updates use restrained live regions and do not steal focus.
- Focus indicators remain visible across header, composer, cards, and bottom nav.
- Light and dark rendered pairs meet WCAG AA; body text targets stronger contrast.

## Error handling

- Removed product paths render a branded not-found state with Intent and
  Discover actions instead of the framework 404.
- Missing capability semantics return a named unsupported-capability result.
- Expired, stale, reorged, or superseded programs cannot produce execution calls.
- Infrastructure failures preserve the signed policy and expose a safe retry;
  they never fabricate a proposal.

## Implementation boundaries

The redesign reuses the general policy, typed capability program, verifier,
attestation, portfolio, activity, and execution modules already in the repository.
New UI modules remain focused and below the 300-line soft limit.

Natural-language drafting must produce a typed draft that passes the same domain
schema as a manually authored policy. The draft is displayed before signature.
The LLM response never becomes calldata or an authorization verdict.

The initial implementation may expose only manifest-supported examples while
showing future domains as non-actionable education. It must not add fallback
routes, mock market data, or speculative production support.

## Verification

- Test removed product paths and unknown identifiers use the branded not-found
  state without exposing framework error copy.
- Test natural-language draft review cannot skip required canonical fields.
- Test unsupported domains cannot sign or open a solver competition.
- Test signed commitments change when any displayed bound changes.
- Test active, expired, rejected, and superseded proposal presentation.
- Test standing challenges survive round expiry while every contained program
  becomes historical and non-executable.
- Test “Use this challenge” creates a fresh unsigned receipt and copies no
  program calldata, evidence, owner, nonce, or deadline.
- Test keyboard, focus, live-region, reduced-motion, light/dark, mobile safe-area,
  and wallet-browser layouts.
- Run unit, integration, typecheck, lint, production build, contract, audit, and
  pinned-fork release gates before deployment.

## Rollout

The V3 governance activation remains a separate release gate. Before activation,
the production site continues serving the existing safe flow. After the timelock:

1. the user executes the retained Safe activation batch;
2. Cobia independently reads back every permission and risk bound;
3. production database migration and runtime configuration are applied;
4. the redesigned app is deployed and checked without a principal transaction;
5. one explicit retail canary is separately approved and wallet-confirmed.

## Success criteria

- A new user can state an outcome without choosing Earn, Swap, or Profit first.
- The user can explain exactly what the signed policy permits before signing.
- Current and historical solver results cannot be confused.
- Portfolio and activity remain primary, usable mobile surfaces.
- Current Intent, Program, Discover, and Solver links never return the framework
  404; removed product paths use the branded not-found state.
- The header and body read as one coherent application in light and dark modes.
- Unsupported domains are inspiring but never represented as executable.
