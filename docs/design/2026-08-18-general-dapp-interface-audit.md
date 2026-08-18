# General dapp interface audit

Date: 2026-08-18

## Scope and evidence

This audit compares live, unauthenticated desktop and mobile surfaces from
[Jumper](https://jumper.xyz/), [Jupiter](https://jup.ag/swap),
[Uniswap](https://app.uniswap.org/swap), and [Aave](https://app.aave.com/).
Viewport evidence is stored locally under
`output/playwright/dapp-audit-2026-08-18/` and is intentionally gitignored.

| Product | Primary hierarchy | Useful pattern | Pattern Cobia should avoid |
| --- | --- | --- | --- |
| Jumper | Navigation, proof-led context, one route card | One dominant task card; restrained proof beside it; mobile keeps the task intact | Send/receive framing that assumes every intent is a transfer or swap |
| Jupiter | Search and market context around a compact trade card | Strong selected state; input and action remain visually dominant despite many tools | Icon-only global navigation and terminal-like market density for ordinary users |
| Uniswap | Quiet navigation and one centered transaction composer | Minimal chrome; large inputs; action always immediately discoverable | Excess empty space and product-specific pink branding without explanatory state |
| Aave | Market identity and summary, then structured asset rows | Dense data has named columns, stable alignment, filters, and secondary row actions | APY-first language and a dark header disconnected from the content surface |

## Cobia-specific interface rules

### Information architecture

1. `Intent`, `Portfolio`, `Activity`, and `Discover` are the four primary
   destinations. Solvers are discoverable from Discover and program evidence,
   not a fifth competing mobile tab.
2. The landing page starts with one general goal composer. It does not start
   with a swap pair, yield number, solver terminal, or protocol list.
3. Standing challenges, wallet-specific custom intents, and past discoveries
   are separate sections because they carry different authority and freshness.
4. A program row shows outcome, current state, expiry, solver, and verifier
   result before hashes or shell provenance. `Solver lab` is a read-only
   disclosure.
5. Portfolio and Activity remain first-class product surfaces rather than
   appendices to the intent flow.

### Layout and responsive behavior

- Use one 1200px content frame, a 12-column desktop grid, and single-column
  mobile composition. Avoid isolated floating panels with unrelated widths.
- Keep the composer as the dominant card. Supporting examples use compact
  rows rather than equal-weight marketing tiles.
- Convert desktop tables to labelled mobile rows; do not rely on horizontal
  scrolling for core state.
- Keep all controls at least 44px high. The mobile bottom navigation includes
  safe-area padding and the page reserves its full height.
- Use progressive disclosure for evidence and technical fields. Never truncate
  a commitment without a copy or expand affordance.

### Type, colour, and state

- Use sentence case and direct verbs. No eyebrow labels and no uppercase
  marketing copy.
- Dynamic amounts and commitments use tabular or monospace numerals; prose does
  not.
- Use a neutral near-white/near-black canvas and white/dark surfaces. Cobalt is
  reserved for primary actions, links, selected states, and focus. Green is
  reserved for independently verified state.
- Status is always written in text and never encoded by colour alone.
- Distinguish `Live`, `Designed`, and `Requires capability`. A domain example
  cannot imply that commerce, subscriptions, or RWA execution is live when no
  verifier-owned capability supports it.

### Writing and trust boundaries

- Prefer “Describe what should happen” over “Choose a route.”
- Prefer “Solvers may submit, revise, or abstain” over language implying every
  solver must answer.
- Prefer “Verified for your review” over “safe.” The verifier evaluates a
  canonical proposal; the user wallet remains the only production signer.
- Historical programs say why they are non-actionable: expired, superseded,
  rejected, executed, or stale evidence.
- Agent-authored provenance is never presented as authorization evidence.

## Resulting landing-page model

The first viewport should contain a compact product statement, a prominent
intent input, one primary action, and a concise explanation of the signed
policy receipt. Beneath it, standing challenges demonstrate the competition
model, while the capability section separates what is live today from domains
the architecture can support after verifier-owned capabilities are added.

