# Cobia open solver

This worker fetches fresh signed V3 intents, verifies their wallet authority,
and submits a signed decision. The included reference strategy builds a pinned
X Layer Aave V3 supply or Curve exact-input swap, or an exact-call acquisition
of a registered issuer-backed asset on Ethereum. It generates evidence by
executing the route on a disposable Anvil fork before submission.

Use a dedicated solver identity key. It signs profile and decision claims only;
it never controls user assets and is never sent to Cobia.

```bash
cp examples/open-solver/.env.example examples/open-solver/.env
# Set REFERENCE_SOLVER_PRIVATE_KEY, then:
docker compose -f examples/open-solver/compose.yaml up -d --build
```

For other goals the reference strategy records an explicit abstention. Replace
the strategy with additional capability or `transaction-program` searchers;
the exchange is intentionally not restricted to the registered X Layer
protocol adapters or RWA instruments. The state volume prevents duplicate
decisions after a restart.
