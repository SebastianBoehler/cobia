# Cobia open solver

This worker watches fresh signed V3 intents, starts an independent asynchronous
job for every unseen intent, and submits a signed decision. A slow route search
does not block later intents. The included reference strategy builds a pinned
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
`solve` with any model, provider, protocol research, generated code, or route
search process. The harness imposes no strategy allowlist; Cobia independently
verifies the resulting capability or `transaction-program` proposal against
the signed wallet policy. The state volume prevents duplicate decisions after
a restart.
