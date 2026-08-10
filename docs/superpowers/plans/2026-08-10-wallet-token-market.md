# Wallet-Native Token Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual addresses with a connected wallet and make live solver competition asset-selectable on X Layer.

**Architecture:** A small EIP-6963 context owns the browser wallet session and is consumed by signing surfaces. An executable-asset registry constrains live OKX product discovery; both solvers continue to consume one frozen asset-specific snapshot and the verifier remains authoritative.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript 6, Viem 2.55, OKX DeFi API, OpenAI Responses API, Vitest 4.

## Global Constraints

- No manual address field and no private key in browser code.
- No mock or fallback market data.
- Only exact registry assets and Aave V3 products may become executable.
- Current solvers are visibly Cobia-operated and receive identical snapshots.
- Reveal price is `100000` atoms: `90000` winner and `10000` Cobia.
- No eyebrow elements or eyebrow CSS remain.
- Keep production files below the 300-line soft limit.

---

### Task 1: Wallet session and signing

**Files:**
- Create: `apps/web/lib/wallet/eip1193.ts`
- Create: `apps/web/components/wallet/WalletProvider.tsx`
- Create: `apps/web/components/wallet/WalletButton.tsx`
- Create: `apps/web/components/wallet/WalletProvider.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/layout/AppHeader.tsx`
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/request/PolicyForm.test.tsx`
- Modify: `apps/web/components/request/CompetitionView.tsx`
- Modify: `apps/web/components/request/CompetitionView.test.tsx`

**Interfaces:**
- Produces `useWallet(): WalletSession` with providers, provider, account,
  chainId, connect, disconnect, switchToXLayer, and request.
- Signing consumers use `wallet.request` and require `wallet.account` to equal
  the policy owner.

- [ ] Write tests that announce two EIP-6963 providers, connect the chosen one,
  update on `accountsChanged`, and surface a rejected request.
- [ ] Run the wallet test and confirm it fails because the session does not exist.
- [ ] Implement the smallest context and picker that passes the tests.
- [ ] Replace form and competition global-provider access with `useWallet` and
  update tests to prove the connected account becomes the policy owner.
- [ ] Run focused wallet and request component tests.
- [ ] Commit as `feat(wallet): connect EIP-6963 providers`.

### Task 2: Live token-specific markets

**Files:**
- Create: `apps/web/lib/chain/supported-assets.ts`
- Create: `apps/web/lib/chain/supported-assets.test.ts`
- Modify: `apps/web/lib/okx/client.ts`
- Modify: `apps/web/lib/okx/client.test.ts`
- Modify: `apps/web/lib/okx/normalize.ts`
- Modify: `apps/web/lib/okx/normalize.test.ts`
- Modify: `apps/web/lib/orchestrator/capture-snapshot.ts`
- Modify: `apps/web/lib/orchestrator/capture-snapshot.test.ts`
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/request/PolicyForm.test.tsx`

**Interfaces:**
- Produces `SUPPORTED_ASSETS`, `supportedAsset(address)`, and
  `captureSnapshot(policy, dependencies)` where the query symbol comes from the
  policy asset registry entry.
- OKX search accepts a nullable product group and protocol-family search labels.

- [ ] Add failing fixtures for the live `productGroup: null` and
  `Aave V3 / Main Market` response.
- [ ] Run the OKX and snapshot tests and confirm the live fixture is rejected.
- [ ] Implement nullable parsing, canonical Aave-family matching, and registry
  validation without weakening detail validation.
- [ ] Add USDG and USDt0 selection to the form; derive symbol and decimals from
  the selected registry record.
- [ ] Prove in component and snapshot tests that changing the asset changes the
  signed policy and exact OKX token query.
- [ ] Commit as `feat(market): solve live token-specific routes`.

### Task 3: Fee clarity and visual cleanup

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/requests/new/page.tsx`
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/request/CompetitionView.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/styles/landing.css`
- Modify: `apps/web/app/styles/request.css`
- Modify: `apps/web/components/request/CompetitionView.module.css`

**Interfaces:**
- The UI states `0.10` total, `0.09` winner, `0.01` Cobia and labels internal
  solvers `Operated by Cobia`.

- [ ] Add user-visible component assertions for the fee split and operator label.
- [ ] Run component tests and confirm the assertions fail.
- [ ] Remove eyebrow markup and styles, then add restrained headings and fee copy.
- [ ] Run all component tests and confirm they pass.
- [ ] Commit as `feat(ui): clarify solver economics`.

### Task 4: Full verification and live rehearsal

**Files:**
- Modify: `apps/web/README.md`
- Create: `docs/evidence/wallet-token-market.md`

**Interfaces:**
- Evidence records commands and public, non-secret observations only.

- [ ] Run `pnpm --filter @cobia/web test` and the workspace test suite.
- [ ] Run `pnpm --filter @cobia/web typecheck`, lint, and production build.
- [ ] Exercise both supported token queries against live OKX and record only
  investment IDs, rates, TVL, and block bounds.
- [ ] Browser-test connect, token choice, signature rejection, and responsive UI.
- [ ] Commit as `test(e2e): verify wallet token market` and push `main`.

