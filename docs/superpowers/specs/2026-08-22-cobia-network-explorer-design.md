# Cobia Network Explorer and Solver Volume Design

**Date:** 2026-08-22
**Status:** Approved direction, pending review of this written specification

## Goal

Cobia exposes a public, pseudonymous proof surface for confirmed intent
outcomes on X Layer. Visitors can trace every aggregate metric to a winning
solver program, independent verifier evidence, and a confirmed wallet
transaction without exposing the owner's raw natural-language goal.

The surface is named **Cobia Network**. It makes existing technical evidence
legible to users, solver operators, ecosystem partners, judges, and investors;
it is not a separate investor portal.

## Product boundary

The network explorer reports what Cobia can prove, not projected traction.

- A proposal, accepted program, rehearsal, authorization, or submitted
  transaction is not confirmed volume.
- The owner wallet remains the principal transaction authorizer. Copy uses
  `verified outcome volume`, not language implying Cobia custody.
- Raw display goals are private-by-default on this public projection. Public
  intent labels are derived from canonical verified program semantics.
- Full wallet addresses remain available through the public chain transaction,
  but Cobia displays only abbreviated addresses in the explorer.
- Legacy route records and pending commerce placements do not enter the first
  aggregate. They remain available through their existing product surfaces.

## Information architecture

The primary navigation label `Solvers` becomes `Network` and points to
`/network`. Existing `/solvers` and `/solvers/[solverId]` routes remain
canonical and are linked from the network surface.

`/network` contains three sections rather than a nested tab application:

1. **Network overview** — denominator-backed aggregate metrics.
2. **Confirmed outcomes** — a reverse-chronological public proof ledger.
3. **Solver performance** — a compact comparison that links to the existing
   detailed solver profiles.

The connected-wallet `/activity` page remains the owner's chronological record.
It does not become the public feed.

## Canonical public outcome

The web context projects a strict `PublicOutcomeV1` from existing persisted
intent, winning submission, objective, execution, and receipt evidence:

- intent ID and normalized intent class;
- execution chain ID;
- abbreviated owner address for presentation;
- selected solver ID and submission ID;
- confirmed timestamp and transaction hash;
- input asset identity, decimals, and input amount;
- optional pinned USD valuation and its evidence block;
- normalized outcome label and verified result summary; and
- verifier state and inspectable program URL.

An outcome is public only when all of the following hold:

1. the intent resolves to exactly one selected submission;
2. that submission is `executed`;
3. it has a strict receipt artifact with a valid chain-196 transaction hash;
4. the receipt proves the signed postcondition; and
5. the projection can derive one unambiguous principal input from the canonical
   policy and verified program.

Malformed or incomplete rows fail closed and are excluded with structured
diagnostic counts. The API never partially guesses missing amounts, assets,
solver attribution, or outcome semantics.

## Metric definitions

### Confirmed outcomes

The count of valid `PublicOutcomeV1` records in the selected window.

### Verified outcome volume

The sum of each confirmed outcome's owner principal valued in USD exactly once.
Stablecoins are not assumed to equal one dollar merely from their symbol; the
projection uses the pinned valuation evidence committed to the verified
program. If no admissible USD valuation exists, the outcome is labeled
`unvalued` and excluded from USD volume while remaining in the outcome count.

Approvals, internal swaps, supplies, refunds, solver fees, gas, contract
deployments, rehearsals, failed transactions, and repeated program stages are
never counted as separate principal.

### Per-solver volume

Each confirmed outcome's valued principal is attributed once to its selected
winning solver. Non-winning submissions receive no volume attribution.

### Supporting solver metrics

The network comparison reuses the existing verifier-owned 30-day performance
projection:

- confirmed wins;
- verifier acceptance rate;
- execution success rate;
- median first-submission latency; and
- observed intent count.

Every rate keeps its numerator, denominator, segment, and preliminary or
established status. Cobia does not add a composite score or rank solvers with
incomparable intent classes.

## API and repository boundaries

Add a read-only network repository in `apps/web/lib/db` that owns joins and
projection inputs. A pure domain module owns strict public-outcome parsing,
volume aggregation, windowing, solver grouping, and exclusion reasons.

`GET /api/network` returns a versioned payload containing:

- observation time and supported window;
- network totals;
- per-solver aggregates;
- confirmed outcomes with cursor pagination; and
- excluded-record counts grouped by stable reason code.

The first version supports `30d` and `all` windows with a bounded page size.
The server derives all fields; callers cannot provide wallets, solver IDs,
valuations, or arbitrary aggregation expressions. The public response receives
short shared caching with stale-while-revalidate behavior. Database or
projection failure returns an explicit unavailable response; no zero-filled
fallback or mock data is rendered.

The page may call the repository directly during server rendering. The public
API exposes the same projection for ecosystem inspection and future widgets.

## Presentation

The page follows the existing Cobia brand system:

- one proof-led headline: `Every outcome, independently verified.`;
- a restrained metric strip, not a wall of independent cards;
- a row-based evidence ledger with monospace amounts, blocks, hashes, and
  tabular numerals;
- cobalt for active links and selected routes;
- semantic green only for confirmed evidence, amber for preliminary samples,
  and red for rejected evidence;
- the route-thread motif connecting intent, solver, verifier, wallet, and
  transaction; and
- no chart until at least two meaningful time buckets exist.

The initial low-volume state leads with confirmed outcomes and inspectability,
not a large dollar claim. Empty state copy says that no confirmed outcome exists
for the selected window and links to create an intent. It never substitutes
sample activity.

The confirmed-outcomes ledger shows:

`time | normalized intent | principal | solver | proof state | transaction`

Each row links to the program, solver profile, and X Layer explorer. The raw
display goal and full wallet address are not rendered.

## Error and privacy handling

- Strict receipt or valuation parse failures exclude the record and increment a
  stable diagnostic reason; they do not break the complete page.
- A database-level failure renders one explicit unavailable state and retains
  navigation and explanatory copy.
- Unsupported chains are excluded from the X Layer aggregate.
- Transaction links are created only from validated chain and hash values.
- Server logs may include record IDs and stable reason codes, never raw goals,
  wallet signatures, credentials, or receipt secrets.
- Public APIs return abbreviated owners only. They do not return policies,
  owner signatures, raw goals, or unfiltered receipt payloads.

## Testing and acceptance

Domain tests prove:

- one principal is counted once across a multi-stage program;
- only a confirmed winning submission receives solver attribution;
- pending, failed, replay-only, unvalued, unsupported-chain, and malformed
  records are handled as specified;
- stablecoin symbols alone cannot create USD volume;
- window boundaries and per-solver totals are deterministic; and
- raw goals and full addresses cannot enter public DTOs.

Repository integration tests use the disposable PostgreSQL lane and cover joins,
pagination, selected-submission projection, receipt evidence, and exclusion
diagnostics. Route tests cover query validation, caching, unavailable errors,
and response privacy. Component tests cover populated, preliminary, empty,
unvalued, and unavailable states plus explorer/program/solver links.

The narrow completion gate is:

```text
pnpm --filter @cobia/domain test
pnpm --filter @cobia/web test
pnpm --filter @cobia/web test:integration
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

A browser check verifies `/network` at desktop and narrow mobile widths using
real production-shaped data. This check does not claim a live production
deployment unless the change is separately pushed and deployed.

## Hackathon scope

The first increment includes the network overview, confirmed-outcome ledger,
per-solver verified volume, reuse of existing solver performance, navigation,
metadata, and a link from the BuildX evidence page.

It excludes investor authentication, revenue or retention analytics, data
exports, arbitrary date ranges, leaderboards, composite solver scores, legacy
route backfills, pending commerce volume, protocol TVL, and speculative growth
charts.
