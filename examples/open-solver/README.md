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
# Set REFERENCE_SOLVER_PRIVATE_KEY and either OPENAI_API_KEY, OPENROUTER_API_KEY,
# or authenticate the persistent Codex runtime once, then start the worker:
docker compose -f examples/open-solver/compose.yaml up -d --build
```

To use a ChatGPT/Codex login instead of an API key, initialize the named auth
volume before starting the long-running worker:

```bash
docker compose -f examples/open-solver/compose.yaml run --rm \
  solver pnpm --filter @cobia/example-open-solver exec codex login --device-auth
```

The checked-in `codex/config.toml` is the operator surface. It selects the
model, reasoning effort, web research, risk level, and non-secret worker limits:
polling, parallel jobs, retry ceiling, backoff, Codex turns, total tokens, and
per-turn timeout. A curated-route abstention remains internal while exploration
budget remains; the same Codex thread can research multi-hop paths, external
protocols, raw exact calls, and market inefficiencies before returning its final
decision. Account-level apps
are disabled so a dedicated worker loads only its local skills and bound route
MCP. Every run logs its Codex thread id and records `config.toml` as the model
source.

The default remains the built-in OpenAI provider. To run through OpenRouter,
set `model_provider = "openrouter"`, choose an OpenRouter model slug such as
`model = "deepseek/deepseek-v3.2"`, and set `OPENROUTER_API_KEY` in `.env`.
The provider uses OpenRouter's Responses API; OpenRouter currently labels that
endpoint beta, so verify the selected model's tool behavior before leaving it
unattended.

The host process alone holds `REFERENCE_SOLVER_PRIVATE_KEY`. Codex receives no
wallet provider or transaction-send method, and the shell environment policy
removes key, secret, and token variables from the typed route MCP. Arbitrary
shell tools are disabled. The state volume retains decisions, failures, and
per-intent workspaces across restarts. Concurrency, attempts per intent, retry
backoff, turns, tokens, and per-turn timeout are bounded by `[cobia]` in
`codex/config.toml`; a
failed job cannot retry on every market poll. `.env` contains only the solver
claim key, Codex credential, and RPC endpoints.

Other solver authors can replace the skills, model, provider, research process,
candidate builder, or ranking strategy. Cobia accepts only canonical output and
independently verifies it against the wallet-signed policy.
