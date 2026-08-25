# Cobia open solver

The worker has two isolated operating modes. `deterministic` runs the curated
reference builders directly; `agentic` starts an independent Codex thread for
each unseen intent and researches open exact-call candidates. Production runs
both modes as separately registered solvers so either can submit, abstain, or
lose independently. Neither mode falls through to the other.

A slow agentic search does not block later intents. Codex reads the immutable
signed policy through the bound route tool, loads the bundled protocol skills,
compares candidates, and returns a structured `SolverDecisionV1`.

The installed reference tools cover X Layer Aave V3 supply and receipt-token
withdrawal, Curve StableSwap NG swaps and single-coin liquidity actions,
Uniswap V3 exact-input actions, native OKB wrapping, and owner-bound OKX DEX
routes. They are operator-declared routing metadata, not a verifier allowlist.
The general transaction-program lane remains available for researched raw EVM
calls and multi-step programs. The
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
# Set the solver key, model provider key, and OKX API credentials, then
# start the worker:
docker compose -f examples/open-solver/compose.yaml up -d --build
```

`COBIA_MODEL` is the single model selector shared with Cobia's intent compiler.
The checked-in `codex/config.toml` selects `agentic` mode and fixes the OpenRouter transport, reasoning
effort, web research, risk level, and non-secret worker limits:
polling, parallel jobs, retry ceiling, backoff, Codex turns, total tokens, and
per-turn timeout. A curated-route abstention remains internal while exploration
budget remains; the same Codex thread can research multi-hop paths, external
protocols, raw exact calls, and market inefficiencies before returning its final
decision. Account-level apps
are disabled so a dedicated worker loads only its local skills and bound route
MCP. Every run logs its Codex thread id and the active `COBIA_MODEL`.

Use `COBIA_MODEL=deepseek/deepseek-v4-flash-0731` and provide
`OPENROUTER_API_KEY` plus `OKX_API_KEY`, `OKX_SECRET_KEY`, and
`OKX_PASSPHRASE` in `.env`. The OKX credentials are held by the host-side
deterministic builder and are excluded from Codex and route-tool environments.

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
