# Build X AI Season: current-repository presentation benchmark

- **Snapshot:** 2026-08-25
- **Scope:** public, first-party repositories that explicitly identify themselves
  as entries in the 7–21 August 2026 X Layer Build X AI Season, or are linked to
  that event by the project's own current-season source.
- **Boundary:** this is a repository-presentation benchmark, not an official
  eligibility list or score. X Layer has not published the accepted form
  responses.

## Bottom line

Cobia already has the strongest engineering-assurance surface in this verified
sample: three substantive Actions workflows, current green CI and security runs,
a root security policy, architecture and deployment documentation, a reproducible
fork lane, source-level capability boundaries, and public mainnet evidence. Its
remaining repository gap is **decision ergonomics**, not technical substance.

[Reckonz](https://github.com/wngstnr-code/reckonz) is the repository to beat on
judge-oriented presentation. It opens with a five-minute judging route, links
mainnet evidence, provides a second judge tour, maps itself to the judging
criteria, and states refusals and roadmap boundaries. [Aura
Homes](https://github.com/kr8tiv-ai/aura-homes) is the strongest model for
claim-state discipline: a 60-second judge path, `Live / Pilot / Testnet / In
build / Planned` vocabulary, screenshots, safeguards, documentation index, and
canonical submission package.

No verified current-season competitor combines those presentation strengths
with Cobia's CI, security scanning, independent fork replay, public program
receipts, and solver-verification depth. Cobia can therefore lead the repository
comparison without adding speculative capability; it needs to put its existing
proof into a faster, more canonical judge path.

## Strict event boundary

The [official Build X page](https://web3.okx.com/xlayer/build-x-series) lists
August AI Season separately from Genesis, X Cup, Season 1, and Season 2. Those
older events are deliberately excluded here. In particular,
[Otto X](https://github.com/useOttoAI/otto-x) says in its own README that it was
built for **Season 2**, so it is not treated as a current August repository even
though Otto discussed the current event publicly.

The comparison set below is not a claim that no private or unlinked submission
exists. It is the clean public set found through first-party event and repository
evidence. Similar-name repositories without a project-owned event link were not
used.

## Strongest current-season repository patterns

| Repository | Judge and AI-evaluator legibility | Visuals and proof | Engineering, security, reproducibility | Cobia should take |
| --- | --- | --- | --- | --- |
| [Reckonz](https://github.com/wngstnr-code/reckonz) | Best overall: “Five minutes, if you are judging,” a second judge tour, direct judging-criteria mapping, explicit refusals and roadmap | Mainnet evidence and product media are surfaced from the README | MIT license, `.env.example`, four Actions workflows, public topics | Use its judge-first hierarchy and rubric mapping, but remain materially shorter than its roughly 493-line README |
| [Aura Homes](https://github.com/kr8tiv-ai/aura-homes) | Best claim discipline: 60-second judge path, current-state matrix, canonical [`SUBMISSION.md`](https://github.com/kr8tiv-ai/aura-homes/blob/main/docs/SUBMISSION.md), roadmap and documentation index | Full-width hero, diagrams, evidence/status badges | Architecture, deployment and safeguard coverage; reproducible verification; MIT and rich GitHub topics; no project CI workflow visible | Adopt the explicit status vocabulary and canonical submission/evidence index, not the roughly 454-line density |
| [Aetheria Exchange](https://github.com/mrnetwork0001/AetheriaExchange) | Strong chronological build and autonomous-agent narrative | Mainnet contracts, transactions and agent decisions are narrated as a proof timeline | Quickstart and environment example, but no visible Actions, detected license or dedicated security document | Add a compact “proof milestones” strip only if every milestone links to a receipt |
| [HashPayStream](https://github.com/Cyano88/hashpaystream) | Concise product surfaces plus a submission document and 90-second demo script | Deployment manifests and pilot paths are linked; README has no strong hero visual | Reproducible verification and a green production-readiness workflow | Keep a short root README and route technical depth to canonical evidence documents |
| [MandateLayer](https://github.com/devpetrate/mandatelayer) | Clear problem, operation and current AI/X Layer role in about 206 lines | Mainnet deployments and decision outcomes carry the proof | Concise security model and production-safety boundaries; no Actions or detected license | Explain Cobia's AI authority and onchain authority split with the same economy of language |
| [Prism Pulse](https://github.com/Stella112/Prismpulse-Rwa) | Strong AI-agent roles, evidence decay, tradeability gates and operational boundaries | Mainnet proof and screenshot assets exist, but the screenshots are not surfaced in the README | Dedicated security, architecture, deployment and operations docs; no Actions or detected license | Make the threat model and fail-closed behavior prominent without burying the product story |
| [Pricewise](https://github.com/A-Raphie/pricewise) | Small README with direct positioning, status seams and spec links | Five status/test/network badges; no repository product media found | Green CI, security and architecture docs, reproducible Anvil path | Use live workflow badges and one copied command that proves the core path; avoid manually maintained test-count badges |
| [Redline](https://github.com/emmaGH1/Redline) | Clean architecture, enforced-rule list, repository map and quickstart in about 195 lines | Contract addresses are clear; no README hero or badges | Test commands and environment contract are documented; no Actions, security document or detected license | Preserve Cobia's current length discipline while improving its first screen |
| [Aegis](https://github.com/bas-coder/aegis) | Immediate demo CTA, protocol explanation and explicit “what this is not” | Strongest visual submission package in the sample: branded badges and in-repo slide deck | Two-wallet run path, but no Actions, security document or detected license | Put the current demo and one representative product frame above the fold |
| [Liquidation Survivor](https://github.com/harryyyym/liquidation-survivor) | Best brevity: why, operation, deployments, run and links in roughly 62 lines | Branded hero and immediate identity | Mainnet/testnet addresses, but little AI, security or test depth and no Actions or detected license | Keep the opening screen this direct, then let Cobia's deeper evidence win below it |

## Cobia's current position

The current [Cobia repository](https://github.com/SebastianBoehler/cobia) already
has a useful 190-line README, five badges, a product screenshot, a capability
truth table, trust-boundary diagram, topology, setup and verification commands,
and links into architecture and deployment material. Its
[CI](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml),
[security](https://github.com/SebastianBoehler/cobia/actions/workflows/security.yml),
and [mainnet-fork](https://github.com/SebastianBoehler/cobia/actions/workflows/fork.yml)
workflows are a stronger assurance package than any other current-season repo
reviewed here. The latest observed CI and security runs were green.

The GitHub landing metadata is weaker than the contents:

- the About homepage still points to `cobia-web.vercel.app`, while the canonical
  product is `getcobia.com`;
- no GitHub topics are configured;
- GitHub reports no public release, and the three visible tags are operational
  rollback tags rather than judge-readable product milestones;
- the repository license is shown as `NOASSERTION` by GitHub even though the
  README accurately links the PolyForm Noncommercial source-available license;
  do not relabel it as open source;
- the README does not yet offer a timed judge route, an official-criteria
  scorecard, the current demo CTA, or one canonical competition/evidence page;
- the current truth table is technically valuable but reaches implementation
  detail before a judge has seen the human problem, differentiated product loop,
  and strongest receipts.

For an LLM evaluator, the same issue appears as fragmented canonicality. The
facts exist, but a crawler must infer the product summary, current proof,
limitations, roadmap, and competition mapping from several sections and files.
Structured, explicit facts will help more than keyword repetition or claims of
being “best.”

## Prioritized gap list

### P0 — make the decision possible from the first screen

1. **Correct GitHub About metadata.** Set the homepage to `https://getcobia.com`
   and add focused topics: `x-layer`, `okx`, `ai-agents`, `defi`,
   `solver-market`, `intents`, `xstocks`, `rwa`, `solidity`, `nextjs`,
   `typescript`, and `security`.
2. **Open with one human sentence and three CTAs.** The first screen should link
   `Try Cobia`, `Watch the 60–90 second demo`, and `Verify mainnet evidence`.
   Keep one current product frame directly below it.
3. **Add a timed judge path.** Show the exact intent-to-receipt sequence:
   multi-asset intent, competing proposals, meaningful rejection, verified
   winner, wallet confirmations, xStocks balance deltas, program page and
   explorer receipt.
4. **Add a one-screen proof table.** Use stable nouns and direct links for X
   Layer chain 196, V4, xStocks, many-to-one/one-to-many/many-to-many programs,
   solver evaluation, adversarial rejection, network ledger, contracts and
   code. Timestamp mutable counts instead of letting them silently drift.
5. **Map the official criteria explicitly.** One row each for AI application,
   innovation, product completeness, user value, X Layer integration, growth
   potential and ecosystem contribution; each row gets one strongest proof and
   one honest limitation.

### P1 — make technical review and automated summarization deterministic

6. **Create one canonical `docs/SUBMISSION.md`.** It should contain the
   competition identity, 100-word summary, current-vs-planned matrix, demo path,
   architecture, security model, deployments, evidence manifest, reproducible
   commands, limitations and roadmap. README claims should link here rather than
   duplicate mutable values.
7. **State the AI/security authority split early.** Use a compact flow:
   `human policy -> AI/solver proposals -> deterministic verifier -> fresh-fork
   replay -> owner wallet approval -> onchain receipt`. Explicitly state what the
   model cannot sign, authorize or bypass.
8. **Add `Security` and `Mainnet fork` badges beside CI.** Link badges to the
   live workflows. Preserve the existing detailed security policy and avoid a
   static “secure” badge.
9. **Provide a copy-paste core verification lane.** Keep the full test matrix,
   but identify one bounded command or short command sequence that reproduces
   the central verifier path without production secrets.
10. **Use explicit state labels everywhere.** Prefer `Live mainnet`, `Verified
    in CI/fork`, `Testnet`, `Implemented but not public`, and `Roadmap`. This
    prevents judges and bots from blending current V4/xStocks evidence with
    future cross-chain or ecosystem plans.

### P2 — finish the repository product surface

11. **Publish a named release after the evidence set is frozen.** A judge-readable
    release such as `Build X AI Season — V4 mainnet/xStocks` should attach the
    demo, commit, deployment/evidence manifest and known limitations. Do not use
    rollback tags as product releases.
12. **Add a small contribution surface only if it will be maintained.** A short
    `CONTRIBUTING.md`, labeled roadmap issues and one external-solver integration
    issue would make the open market invitation concrete. Empty ceremony is not
    useful.
13. **Keep the root README under roughly 250–300 lines.** Aura, Reckonz and
    Aetheria prove that completeness can become a wall of text. The root should
    route a judge in under 90 seconds; architecture, operations and research stay
    in focused documents.

## Recommended README information architecture

1. Product sentence + live/demo/evidence CTAs
2. Current product screenshot
3. Why Cobia exists and why a normal router/agent is insufficient
4. 60–90 second judge path
5. Proven on X Layer mainnet
6. How AI, solvers and the verifier work
7. Architecture and security boundary
8. Current capabilities and explicit limitations
9. Official judging-criteria mapping
10. Reproduce locally / CI
11. Documentation, roadmap, license and team

This structure gives human judges and automated evaluators the same canonical
answer: what Cobia is, what is live, what is technically different, how to
verify it, what remains bounded, and what comes next.

## Source set and exclusions

The benchmark uses only the first-party repositories linked above plus the
official event page. Additional current-season repositories reviewed during
discovery included [Deputy](https://github.com/Oseodion/deputy) and project
repositories with weaker event/repository linkage; they did not change the
priority order.

Explicitly excluded: [Otto X](https://github.com/useOttoAI/otto-x),
YieldAgent, ShieldSuite, Bobby Agent Trader, Silopolis, AutoYield and other
repositories whose own documentation identifies Season 1, Season 2, April
Build X, X Cup or July Genesis. They may be useful historical references, but
they are not competitors in this current-season comparison.
