# Cobia Remotion promos

Short, silent social clips built around the live Cobia intent UI captured on
2026-08-21. The real screenshot establishes product evidence; animated scenes
explain the interaction without representing a fabricated transaction.

## Compositions

- `Cobia-Prompt-Tags-16x9` — animated intent prompt and typed policy
- `Cobia-Prompt-Tags-9x16` — vertical variant for short-form social
- `Cobia-Intent-UI-Reveal` — live UI screenshot and prompt-bar detail
- `Cobia-Verify-Flow-Square` — compact trust-boundary explainer
- `Cobia-Landed-Program-Proof-X` — real intent and receipt around an explicitly labeled solver-selection mechanism

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
