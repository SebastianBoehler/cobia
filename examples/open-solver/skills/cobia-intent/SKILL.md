---
name: cobia-intent
description: Solve a signed Cobia intent by inspecting its machine policy, gathering canonical route evidence, and emitting SolverDecisionV1.
---

# Cobia intent

1. Read `intent.json`; the signed policy is authoritative, not its prose alone.
2. Run the route tool `capabilities` command to learn the live reference-tool surface.
3. Use the relevant protocol skill and run the route tool `solve` command to produce `candidate.json`.
4. Inspect the complete candidate against every input ceiling, output floor, deadline, recipient, execution chain, and stage bound. `policy.limits.minimumStages` counts wallet-transaction stages; never collapse an explicit multi-step intent into one swap.
5. Use optional simulation only when it helps research or rank candidates.
6. Return the canonical candidate, or emit a more precise schema-valid abstention.
7. Return only `{"decisionJson":"<canonical SolverDecisionV1 JSON string>"}` as the entire final response. Do not write `decision.json`; the host writes it after validation.

The route tools are already attached. Do not call MCP resource or resource-template discovery APIs.

Never expose or request signing material. Never describe your own result as verified.
