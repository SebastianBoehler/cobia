# Cobia Solver Market

Cobia coordinates signed intents, competing solver attempts, verified proposals, and bounded on-chain execution authority.

## Language

**Solver Run**:
One solver's attempt at one revision of an intent. A run is completed when the solver finishes normally, even when its proposal is rejected; failed is reserved for verification, persistence, or infrastructure failure.
_Avoid_: Job, execution

**Submission**:
The proposal produced by a Solver Run and evaluated independently from the run's operational outcome.
_Avoid_: Run, attempt

**Stage Anchor**:
The single canonical chain block against which every asset identity and executable code dependency for one stage is authorized.
_Avoid_: Input anchor, per-asset anchor

**Evidence Authority**:
The exact signed baseline, fresh identity and valuation evidence, Stage Anchor, and validity window that jointly authorize one stage. Each trust gate establishes Evidence Authority independently from the same rules.
_Avoid_: Evidence bundle, freshness check
