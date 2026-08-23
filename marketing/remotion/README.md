# Cobia Remotion promos

Responsive social clips in Cobia's current light visual system. Large type,
UI-native intent tags, the current logo, and a restrained ambient score carry
across landscape, square, and vertical formats. Product evidence stays labeled;
animated explanations do not represent fabricated transactions.

## Compositions

- `Cobia-Prompt-Tags-16x9` — animated intent prompt and typed policy
- `Cobia-Prompt-Tags-9x16` — vertical variant for short-form social
- `Cobia-Clean-Prompt` / `Cobia-Clean-Prompt-X` — responsive intent-bar loops
- `Cobia-Bouncy-Prompt-X` — higher-energy tagged-intent loop
- `Cobia-Tag-Picker-X` — explicit entity-resolution interaction
- `Cobia-Token-Evidence-X` — tagged intent resolved into reviewable UI objects
- `Cobia-Intent-UI-Reveal` — live UI screenshot and prompt-bar detail
- `Cobia-Verify-Flow-Square` — compact trust-boundary explainer
- `Cobia-Landed-Program-Proof-X` — real intent and receipt around an explicitly labeled solver-selection mechanism
- `Cobia-Launch-Analytics-X` — 22-second launch cut: intent, competition, independent verification, and an explicitly labeled prior receipt
- `Cobia-Solver-Better-Route-X` — solver recruitment around competitive, verifier-ranked programs
- `Cobia-Solver-No-Keys-X` — solver freedom separated from wallet authority
- `Cobia-Solver-Reputation-X` — public, verifier-derived solver history and wins

## Commands

```bash
cd marketing/remotion
pnpm install --ignore-workspace --config.minimum-release-age=0
pnpm dev
pnpm lint
pnpm render:all
```

Rendered videos are written to `output/`. Source UI captures live under
`public/ui/`; the user-facing originals are also on the macOS Desktop.
