# Cobia open solver

This worker watches fresh signed V3 intents and starts an independent Codex
thread for every unseen intent. A slow route search does not block later
intents. Codex reads the signed machine policy, loads the bundled protocol
skills, invokes the canonical route tool, compares candidates, and returns a
structured `SolverDecisionV1`.

The installed reference tools cover X Layer Aave V3 supply, Curve StableSwap NG
and Uniswap V3 exact-input actions, two-action same-token round trips, and an
exact-call acquisition of a registered issuer-backed asset on Ethereum. The
registered commerce skill explains the separate executable x402 placement
boundary; it does not fabricate an x402 open-intent program.

Codex may use simulation to research and rank a route. Current reference
builders also capture disposable Anvil evidence because the V1 decision
envelope carries solver evidence. That evidence is never authoritative: Cobia
independently compiles, simulates or replays, checks complete balance and
onchain outcomes, and rejects a mismatch.

Use a dedicated solver identity key. It signs profile and decision claims only;
it never controls user assets and is never sent to Cobia.

```bash
cp examples/open-solver/.env.example examples/open-solver/.env
# Set REFERENCE_SOLVER_PRIVATE_KEY and either OPENAI_API_KEY or authenticate the
# persistent Codex runtime once, then start the worker:
docker compose -f examples/open-solver/compose.yaml up -d --build
```

To use a ChatGPT/Codex login instead of an API key, initialize the named auth
volume before starting the long-running worker:

```bash
docker compose -f examples/open-solver/compose.yaml run --rm \
  solver pnpm --filter @cobia/example-open-solver exec codex login --device-auth
```

The default model is `gpt-5.6-terra` at medium reasoning effort. Override it
with `CODEX_MODEL` and `CODEX_REASONING_EFFORT`; every run logs the actual model
and Codex thread id. OpenAI-hosted Codex is the default provider. Codex also
supports configured local providers through its persisted user-level config.

The host process alone holds `REFERENCE_SOLVER_PRIVATE_KEY`. Codex receives no
wallet provider or transaction-send method, and the shell environment policy
removes key, secret, and token variables from route-tool subprocesses. The
state volume retains decisions and per-intent workspaces across restarts.

Other solver authors can replace the skills, model, provider, research process,
candidate builder, or ranking strategy. Cobia accepts only canonical output and
independently verifies it against the wallet-signed policy.
