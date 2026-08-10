# Cobia Product Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship persistent purchased routes plus useful Markets, Portfolio, and Activity surfaces backed by PostgreSQL and live X Layer wallet reads.

**Architecture:** Extend the current request repository with route purchases and append-only activity events, then expose small server APIs and focused React views. The wallet remains the user identity; server components provide public market data while client components request address-scoped data after connection.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Drizzle ORM, PostgreSQL, viem, Vitest, Testing Library.

## Global Constraints

- No mock strategies, fake APYs, fabricated protocol listings, or silent fallbacks.
- A route is `policy_valid` before wallet checks; only fresh balance and simulation results may produce `ready_to_execute`.
- Wallet address plus X Layer chain ID is the release identity; no email account is required.
- Keep files below the project soft limit of 300 lines and expose errors explicitly.
- Use the existing X Layer mainnet chain ID 196 for live product reads and chain ID 1952 only for payment rehearsal.

---
### Task 1: Persist route purchases and activity events

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/lib/db/purchases.ts`
- Create: `apps/web/lib/db/activity.ts`
- Create: `apps/web/lib/db/purchases.test.ts`
- Create: `apps/web/drizzle/0002_product_surfaces.sql`
**Interfaces:**
- Consumes: `DecisionBundle`, request ID, quote ID, receipt hash, buyer address.
- Produces: `recordRoutePurchase(input)`, `getPurchasedRoute(routeId, buyer)`, `appendActivity(input)`, and `listActivity(address, chainId)`.
- [ ] **Step 1: Write failing repository tests**
```ts
it("recovers a purchased route after reload", async () => {
  await purchases.recordRoutePurchase(fixturePurchase);
  expect(await purchases.getPurchasedRoute(fixturePurchase.id, fixturePurchase.buyer))
    .toMatchObject({ bundle: fixturePurchase.bundle, receiptHash: fixturePurchase.receiptHash });
});

it("returns wallet activity newest first", async () => {
  await activity.appendActivity(olderEvent);
  await activity.appendActivity(newerEvent);
  expect((await activity.listActivity(owner, 196)).map((event) => event.id))
    .toEqual([newerEvent.id, olderEvent.id]);
});
```
- [ ] **Step 2: Run the tests and confirm missing repositories fail**

Run: `pnpm --filter @cobia/web test -- lib/db/purchases.test.ts`
Expected: FAIL because the purchase and activity repositories do not exist.
- [ ] **Step 3: Add the migration and focused repositories**
```ts
export interface RoutePurchaseInput {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: Address;
  chainId: number;
  receiptHash: string;
  bundle: DecisionBundle;
}

export interface ActivityEventInput {
  id: string;
  wallet: Address;
  chainId: number;
  kind: "signature" | "payment" | "route_revealed" | "simulation" | "execution";
  status: "pending" | "confirmed" | "failed";
  routeId?: string;
  transactionHash?: Hash;
  detail: Record<string, unknown>;
  occurredAt: Date;
}
```
- [ ] **Step 4: Run repository tests and migrate the local database**

Run: `pnpm --filter @cobia/web test -- lib/db/purchases.test.ts && pnpm --filter @cobia/web db:migrate`
Expected: PASS and migration `0002_product_surfaces.sql` applies once.
- [ ] **Step 5: Commit the persistence slice**
```bash
git add apps/web/lib/db apps/web/drizzle
git commit -m "feat(data): persist route purchases and activity"
```
### Task 2: Return and recover the purchased route

**Files:**
- Modify: `apps/web/app/api/requests/[id]/quotes/[quoteId]/reveal/route.ts`
- Modify: `apps/web/lib/db/requests.ts`
- Create: `apps/web/app/api/routes/[routeId]/route.ts`
- Create: `apps/web/app/routes/[routeId]/page.tsx`
- Create: `apps/web/components/routes/PurchasedRouteView.tsx`
- Create: `apps/web/components/routes/PurchasedRouteView.module.css`
- Modify: `apps/web/components/request/CompetitionView.tsx`
- Test: `apps/web/components/request/CompetitionView.test.tsx`
- Create: `apps/web/components/routes/PurchasedRouteView.test.tsx`
**Interfaces:**
- Consumes: Task 1 `recordRoutePurchase` and `getPurchasedRoute`.
- Produces: `GET /api/routes/[routeId]?buyer=0x…` and a route page containing typed allocation steps, receipt, fees, and eligibility.
- [ ] **Step 1: Write failing reveal-navigation and route-render tests**
```tsx
it("navigates to the persisted route returned by reveal", async () => {
  server.respondToReveal({ routeId: "route-1", bundle });
  await user.click(screen.getByRole("button", { name: /pay winner/i }));
  expect(mockPush).toHaveBeenCalledWith("/routes/route-1");
});

it("shows every purchased allocation", () => {
  render(<PurchasedRouteView route={fixtureRoute} />);
  expect(screen.getByText("6,000 USDT retained"));
  expect(screen.getByText("10,000 USDT supplied to Aave V3"));
});
```
- [ ] **Step 2: Run focused component tests to verify failure**

Run: `pnpm --filter @cobia/web test -- components/request/CompetitionView.test.tsx components/routes/PurchasedRouteView.test.tsx`
Expected: FAIL because no persisted route navigation or route component exists.
- [ ] **Step 3: Persist the purchase in the successful reveal transaction**
```ts
const routeId = quoteId;
await purchases.recordRoutePurchase({
  id: routeId,
  requestId: id,
  quoteId,
  buyer: result.payer,
  chainId: config.PAYMENT_CHAIN_ID,
  receiptHash,
  bundle,
});
return result.withReceipt(NextResponse.json({ routeId, requestId: id, quoteId, bundle }));
```
- [ ] **Step 4: Render explicit route steps and reload-safe receipt details**
```tsx
<ol aria-label="Purchased route steps">
  {route.bundle.allocations.map((allocation) => (
    <RouteStep key={`${allocation.protocolId}:${allocation.amountAtomic}`} allocation={allocation} />
  ))}
</ol>
```
- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm --filter @cobia/web test -- components/request/CompetitionView.test.tsx components/routes/PurchasedRouteView.test.tsx`
Expected: PASS.
```bash
git add apps/web/app/api apps/web/app/routes apps/web/components apps/web/lib/db/requests.ts
git commit -m "feat(routes): persist and render purchased routes"
```
### Task 3: Add recurring market storage and Explore views

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/lib/db/markets.ts`
- Create: `apps/web/lib/db/markets.test.ts`
- Create: `apps/web/app/api/markets/route.ts`
- Create: `apps/web/app/api/markets/[marketId]/route.ts`
- Create: `apps/web/app/api/markets/[marketId]/quote/route.ts`
- Create: `apps/web/lib/markets/run-recurring-rounds.ts`
- Create: `apps/web/scripts/market-worker.ts`
- Create: `apps/web/app/markets/page.tsx`
- Create: `apps/web/app/markets/[marketId]/page.tsx`
- Create: `apps/web/components/markets/MarketCard.tsx`
- Create: `apps/web/components/markets/MarketHistory.tsx`
- Create: `apps/web/components/markets/markets.module.css`
**Interfaces:**
- Produces: `MarketSummary`, `MarketDetail`, `listCurrentMarkets(now)`, and `getMarketDetail(id)`.
- Market APIs return only stored solver rounds sourced from verified snapshots; an empty database returns an empty list with a clear no-markets state.
- `runRecurringRounds(now)` takes a PostgreSQL advisory lock, stores one immutable round per due market, and releases the lock in `finally`; the quote API always starts a fresh wallet- and amount-specific round.
- [ ] **Step 1: Write failing freshness and ordering tests**
```ts
it("marks expired rounds stale and never presents them as current", async () => {
  await markets.saveRound(expiredRound);
  expect((await markets.listCurrentMarkets(now))[0].status).toBe("stale");
});
```
- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --filter @cobia/web test -- lib/db/markets.test.ts`
Expected: FAIL because market persistence is absent.
- [ ] **Step 3: Implement storage, APIs, and the two market pages**
```ts
export interface MarketSummary {
  id: string;
  inputAsset: string;
  amountBand: { minAtomic: string; maxAtomic: string };
  horizonDays: number;
  riskTier: "conservative" | "balanced";
  expectedNetApyBps: number;
  estimatedYearlyAtomic: string;
  solverCount: number;
  verifiedAtBlock: number;
  verifiedAt: string;
  status: "current" | "stale";
}
```
- [ ] **Step 4: Verify empty, current, and stale UI states**

Run: `pnpm --filter @cobia/web test -- lib/db/markets.test.ts && pnpm --filter @cobia/web typecheck`
Expected: PASS with no fabricated market cards, duplicate due rounds, or stale executable quotes.
- [ ] **Step 5: Commit Explore**
```bash
git add apps/web/app/api/markets apps/web/app/markets apps/web/components/markets apps/web/lib/db
git commit -m "feat(markets): add recurring earn marketplace views"
```
### Task 4: Add live wallet Portfolio and Activity

**Files:**
- Create: `apps/web/lib/portfolio/read-portfolio.ts`
- Create: `apps/web/lib/portfolio/read-portfolio.test.ts`
- Create: `apps/web/app/api/wallets/[address]/portfolio/route.ts`
- Create: `apps/web/app/api/wallets/[address]/activity/route.ts`
- Create: `apps/web/app/portfolio/page.tsx`
- Create: `apps/web/app/activity/page.tsx`
- Create: `apps/web/components/portfolio/PortfolioView.tsx`
- Create: `apps/web/components/activity/ActivityView.tsx`
- Create: `apps/web/components/wallet/ConnectedWalletGate.tsx`
**Interfaces:**
- Consumes: public X Layer RPC, supported asset registry, Task 1 activity repository.
- Produces: `readPortfolio(address, blockTag): Promise<PortfolioSnapshot>` plus wallet-scoped JSON APIs.
- [ ] **Step 1: Write failing wallet-gate and balance tests**
```tsx
it("asks for a wallet before loading address-scoped data", () => {
  render(<PortfolioView account={undefined} />);
  expect(screen.getByText(/connect your wallet/i)).toBeVisible();
});
```
```ts
it("returns atomic balances with the observed block", async () => {
  expect(await readPortfolio(owner, 70_000_000n)).toMatchObject({
    address: owner,
    blockNumber: "70000000",
  });
});
```
- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @cobia/web test -- lib/portfolio/read-portfolio.test.ts`
Expected: FAIL because the portfolio reader does not exist.
- [ ] **Step 3: Implement exact on-chain balance reads and append-only activity rendering**
```ts
export interface PortfolioSnapshot {
  address: Address;
  chainId: 196;
  blockNumber: string;
  observedAt: string;
  balances: Array<{ assetId: string; symbol: string; decimals: number; amountAtomic: string }>;
  positions: Array<{ adapterId: string; assetId: string; amountAtomic: string; blockNumber: string }>;
}
```
- [ ] **Step 4: Verify component and API behavior**

Run: `pnpm --filter @cobia/web test -- lib/portfolio/read-portfolio.test.ts && pnpm --filter @cobia/web typecheck`
Expected: PASS; RPC failures return an explicit 503 error rather than zero balances.
- [ ] **Step 5: Commit wallet surfaces**
```bash
git add apps/web/app/api/wallets apps/web/app/portfolio apps/web/app/activity apps/web/components apps/web/lib/portfolio
git commit -m "feat(wallet): add portfolio and activity views"
```
### Task 5: Replace navigation and validate the full product surface

**Files:**
- Modify: `apps/web/components/layout/AppHeader.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/components/layout/AppHeader.test.tsx`
**Interfaces:**
- Produces: primary navigation to `/markets`, `/portfolio`, `/activity`, and `/requests/new`.
- [ ] **Step 1: Write a failing navigation test**
```tsx
it("exposes the product navigation", () => {
  render(<AppHeader />);
  expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/markets");
  expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
  expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
});
```
- [ ] **Step 2: Run the test and confirm the old navigation fails**

Run: `pnpm --filter @cobia/web test -- components/layout/AppHeader.test.tsx`
Expected: FAIL because the current header only links to New request and How it works.
- [ ] **Step 3: Implement the new navigation and direct the home CTA to Explore**
```tsx
<nav aria-label="Primary navigation">
  <Link href="/markets">Explore</Link>
  <Link href="/portfolio">Portfolio</Link>
  <Link href="/activity">Activity</Link>
  <Link href="/requests/new">Custom</Link>
</nav>
```
- [ ] **Step 4: Run complete web verification**

Run: `pnpm --filter @cobia/web test && pnpm --filter @cobia/web lint && pnpm --filter @cobia/web typecheck && pnpm --filter @cobia/web build`
Expected: all commands pass.
- [ ] **Step 5: Browser-verify and commit**

Open `/markets`, `/portfolio`, `/activity`, and the previously purchased route. Confirm the route survives reload, wallet-gated pages identify the connected OKX wallet, empty states are explicit, and no stale route is labelled executable.
```bash
git add apps/web/components/layout apps/web/app
git commit -m "feat(app): make earn marketplace the primary product"
```
