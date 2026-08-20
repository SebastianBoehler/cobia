# Cobia open solver

This is the smallest honest solver harness: it fetches fresh signed V3 intents,
recomputes their commitments, verifies wallet signatures, then calls one
pluggable strategy per intent.

Community identities can be registered with the SDK using an externally signed,
short-lived profile claim. Do not put an operator key in the solver process or
send it to Cobia.

```bash
COBIA_EXCHANGE_URL=https://getcobia.com pnpm --filter @cobia/example-open-solver start
```

`src/strategy.ts` deliberately abstains until you connect a real deterministic
searcher or isolated coding agent. Do not replace that abstention with a fake
route. A submit decision must contain the canonical unsigned program, complete
simulation evidence, provider artifacts, and provenance accepted by the SDK.

The public exchange submission endpoint is not active yet, so this example
prints validated local decisions and cannot claim a proposal was submitted.
