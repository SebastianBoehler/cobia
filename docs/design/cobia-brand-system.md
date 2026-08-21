# Cobia brand system

Status: canonical living guide

Updated: 2026-08-21

This guide defines how Cobia presents the product. Technical claims remain
controlled by the repository, deployment evidence, and live chain state. The
dated product specs in `docs/superpowers/specs/` explain earlier decisions; this
file owns the current public brand and language.

## Brand idea

**State the outcome. Keep the keys.**

Cobia is the verification layer between open-ended agent work and wallet
authority. Solvers may search creatively. Cobia independently checks the exact
program against the limits the owner signed. Only the owner wallet can approve
production calls.

The memorable sequence is:

> Outcome -> limits -> proposals -> independent proof -> exact wallet call

Lead with the outcome, show the boundary, then offer the evidence. Architecture
supports the story; it is not the opening story.

## Positioning

### Category

Use `verified intent system`, `intent exchange`, or `transaction firewall` when
the distinction matters. In ordinary product copy, describe what Cobia does
instead of repeatedly naming a category.

### Audience

1. Wallet owners who want agent assistance without delegating signing authority.
2. X Layer builders who need a trustworthy route from proposals to execution.
3. Solvers, merchants, and protocols that want their work evaluated on outcomes.
4. Reviewers who need to distinguish live evidence from planned capability.

### Competitive stance

Cobia does not win by looking like the broadest AI application. It wins by
making one hard boundary unusually clear and inspectable:

- Agents can propose programs; they cannot authorize production execution.
- Competing solvers improve search without weakening the signed policy.
- Verification reproduces exact calls and outcomes before wallet review.
- X Layer activity resolves to public deployments, receipts, and Builder Code.

Do not imitate another product's palette, mark, or personality. Jumper is a
useful reference for message discipline: one product claim per primary asset,
consistent visual grammar, and a more playful community voice in replies.

## Message hierarchy

Use this order across the landing page, demos, social posts, and pitches:

1. **Outcome:** what the owner wanted and what happened.
2. **Authority:** the wallet retained approval of exact calls.
3. **Verification:** Cobia checked the program against explicit limits.
4. **Competition:** solvers could submit, revise, or abstain.
5. **Evidence:** transaction, block, receipt, source, or reproduction steps.
6. **Architecture:** sandbox, verifier modules, commitments, and governance.

For BuildX, the same story maps to the published judging dimensions:

| Dimension | Cobia proof to foreground |
| --- | --- |
| AI application | Solvers research and propose bounded programs. |
| Innovation | Open generation is separated from authorization. |
| Completeness | A user can state, review, sign, execute, and inspect an outcome. |
| User value | Agent assistance without blind approvals or custody. |
| X Layer integration | Chain 196 execution, chain 1952 deployment, and Builder Code. |
| Growth potential | More solvers, protocols, and merchants improve one intent market. |
| Ecosystem contribution | Safer agent demand can create attributable X Layer activity. |

## Voice

Cobia is precise, calm, direct, and quietly confident.

- **Clear before clever.** Use short sentences and concrete verbs.
- **Proof before promise.** Link claims to evidence when the evidence matters.
- **Technical without gatekeeping.** Explain the boundary before its mechanism.
- **Confident without hype.** Let verified outcomes carry the excitement.
- **Human without being casual about risk.** Warmth belongs around the task;
  security and transaction copy stays serious.

### Tone by context

| Context | Tone |
| --- | --- |
| Product entry and onboarding | Calm, encouraging, outcome-first |
| Routine controls | Neutral, brief, verb-first |
| Verification and receipts | Exact, evidence-led, unambiguous |
| Errors and rejected programs | Serious, plain, recovery-oriented |
| Primary social posts | Polished, concise, proof-led |
| Community replies | Curious, witty, specific to the conversation |

### Preferred language

Use:

- `State the outcome.`
- `Review the policy.`
- `Solvers may submit, revise, or abstain.`
- `Cobia independently verifies the exact program.`
- `Your wallet approves exact calls.`
- `Confirmed on X Layer.`
- `Verified for your review.`
- `No funds or approvals move when you sign this intent.`

Avoid:

- `AI-powered`, `revolutionary`, `autonomous wealth`, or `guaranteed`.
- `Safe` as a substitute for naming the check that passed.
- `Cobia executes for you` when the owner wallet authorizes the transaction.
- `Verified` when only syntax or schema validation passed.
- `Profit` for an estimate or forecast.
- `Gas` for a solver success fee or research payment.
- `We` when the responsible actor should be named.

### Product vocabulary

| Use | Do not drift to |
| --- | --- |
| outcome | command, trade idea |
| signed policy | prompt guardrail, AI instruction |
| proposal or program | strategy when it is executable code |
| independent verification | AI review, safety score |
| exact wallet call | autonomous execution |
| solver success fee | gas, platform tip |
| confirmed outcome | guaranteed result |
| rejected | failed when the system correctly blocked a proposal |

## Visual identity

### Logo and route motif

Write `Cobia` in prose and `COBIA` only in the wordmark. The route-node mark is
the primary symbol. Never use a literal fish.

The route thread represents one outcome entering, multiple proposals being
evaluated, and one eligible program reaching wallet review. Use it to explain
state or evidence. Do not scatter it as decoration.

### Color

The implementation tokens in `apps/web/app/globals.css` are authoritative.

- `paper`, `surface`, `ink`, `muted`, and `line` form the neutral system.
- `cobalt` is the only decorative brand accent and identifies actions, links,
  focus, selected state, and the active route.
- `verified`, `estimated`, and `rejected` are semantic only.
- Every state also uses text and, where helpful, an icon.
- Light and dark themes use the same semantic roles; do not invent separate
  campaign palettes.

### Typography

- Geist Sans for wordmark, headings, prose, navigation, and controls.
- Geist Mono for hashes, addresses, blocks, amounts, fees, and countdowns.
- Use sentence case. Uppercase is reserved for the wordmark and tiny data labels.
- Use tabular numerals for changing financial or chain values.
- Keep body text between 14 and 16 px and long prose below 65 characters per line.

### Layout and shape

- One dominant task or claim per viewport or social asset.
- Use spacing, alignment, hierarchy, and dividers before borders or shadows.
- Cards represent real objects: an intent, proposal, policy, receipt, or proof.
- Do not nest cards or turn every field into a tile.
- Controls remain at least 44 px high.
- Use 8 px control radii, 16 px panels, and up to 24 px for a major stage.
- Reserve shadows for menus, confirmation surfaces, and true elevation.

### Signature visual families

1. **Outcome thread:** natural-language intent connected to policy, proof, and
   wallet review.
2. **Policy receipt:** exact limits displayed as a calm, inspectable document.
3. **Verifier signal:** one dark technical surface for proposal, replay, verdict,
   and approval states.
4. **Evidence row:** one claim paired with one inspectable source or transaction.

These are a reusable grammar, not four competing themes. A single asset usually
uses one family.

### Motion and imagery

- Motion shows state advancing, never ambient excitement.
- Use 120-180 ms for control feedback, 240-300 ms for panels, and 500-800 ms
  for route progression.
- Respect `prefers-reduced-motion` and keep the final state fully legible.
- Use authentic product capture, chain evidence, and real protocol marks.
- Avoid generic AI brains, robots, coins, neon networks, fish, and invented data.

## Product writing pattern

Every important product surface should answer, in order:

1. What can I do here?
2. What will happen next?
3. What can move or change?
4. Who retains authority?
5. Where can I inspect the evidence?

Button labels name the action: `Review policy`, `Sign and publish intent`,
`Inspect execution`, and `Create an intent`. Security copy names the actual
boundary instead of relying on reassurance.

## Acceptance checks

A new public asset or product change is on-brand when:

1. It contains one primary claim or task.
2. It distinguishes proposal, verification, and wallet approval.
3. Live, estimated, rejected, and planned states cannot be confused.
4. Every material claim can resolve to product or chain evidence.
5. Cobalt and semantic colors retain their defined roles.
6. The copy remains clear without protocol expertise.
7. The visual could be recognized as Cobia without copying another crypto brand.
