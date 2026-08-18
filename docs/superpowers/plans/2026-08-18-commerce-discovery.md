# Commerce Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover public x402 v2 and Shopify UCP Catalog offers, normalize them into immutable canonical Cobia offers, and expose their provenance and execution eligibility without trusting merchant content.

**Architecture:** Protocol adapters parse untrusted wire data behind a bounded read-only network broker. A canonical domain schema commits every executable field and source hash. PostgreSQL stores immutable snapshots; the API and Discover UI show only snapshot-backed offers and distinguish executable X Layer offers from discovery-only results.

**Tech Stack:** TypeScript 5, Zod, viem, Vitest, Next.js App Router, Drizzle/PostgreSQL, React Testing Library, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-18-x402-commerce-discovery-design.md`

## Global Constraints

- X Layer mainnet is chain `196`; testnet is `1952` and must not be mislabeled.
- Discovery is broad and untrusted; eligibility never implies verifier acceptance or authorization.
- Fetches carry no wallet, cookies, authorization headers, private RPC URL, or buyer PII.
- HTTPS only; reject loopback, private, link-local, reserved, credential-bearing, rebinding, and redirect escapes.
- Canonical offers are immutable and hash all executable fields, provenance, and source response bytes.
- No fallback to the legacy MPP request/quote/reveal flow and no fabricated offers when sources fail.
- Files remain below the 300 LOC soft limit and failures remain explicit.

## File Map

- `packages/domain/src/commerce-offer.ts`: canonical offer schema and commitment.
- `apps/web/lib/commerce/x402-wire.ts`: x402 v2 header and Bazaar resource parser.
- `apps/web/lib/commerce/ucp-catalog.ts`: UCP profile/catalog parser.
- `apps/web/lib/commerce/network-policy.ts`: destination and response bounds.
- `apps/web/lib/commerce/discovery-broker.ts`: source fetch and normalization orchestration.
- `apps/web/lib/db/commerce-schema.ts`: immutable offer table.
- `apps/web/lib/db/commerce-offers.ts`: idempotent persistence and query surface.
- `apps/web/app/api/commerce/discover/route.ts`: authenticated read endpoint.
- `apps/web/components/discover/CommerceOffers.tsx`: truthful offer cards.

---

### Task 1: Canonical Commerce Offer

**Files:**
- Create: `packages/domain/src/commerce-offer.ts`
- Create: `packages/domain/test/commerce-offer.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `CommerceOfferV1Schema`, `CommerceOfferV1`, `CommerceOfferEligibilityV1`, and `commerceOfferCommitmentV1(offer): Hash`.

- [ ] **Step 1: Write failing schema tests**

Cover x402 and UCP sources, lowercase canonical addresses/hashes, integer atomic amounts, exact chain/asset/payee fields, quantity, expiration, source hash, merchant manifest hash, evidence class, and eligibility. Reject unknown keys, dirty addresses, negative amounts, missing expiry, unbound placement endpoints, and executable non-X-Layer offers.

```ts
const offer = CommerceOfferV1Schema.parse(validOffer);
expect(commerceOfferCommitmentV1(offer)).toMatch(/^0x[0-9a-f]{64}$/);
expect(() => CommerceOfferV1Schema.parse({ ...validOffer, chainId: 1, eligibility: { status: "executable" } })).toThrow();
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/domain test -- commerce-offer.test.ts`

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement the strict schema and commitment**

Use a discriminated `source.protocol` of `x402-v2 | ucp-catalog`, `evidence.profile` of `onchain-order | payment-settled`, and `eligibility.status` of `executable | discovery-only | blocked`. Require a stable `blockedReason` for non-executable offers and forbid it for executable offers.

- [ ] **Step 4: Confirm GREEN and type safety**

Run: `pnpm --filter @cobia/domain test -- commerce-offer.test.ts && pnpm --filter @cobia/domain typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add canonical commerce offers"
```

### Task 2: x402 and UCP Normalizers

**Files:**
- Create: `apps/web/lib/commerce/x402-wire.ts`
- Create: `apps/web/lib/commerce/x402-wire.test.ts`
- Create: `apps/web/lib/commerce/ucp-catalog.ts`
- Create: `apps/web/lib/commerce/ucp-catalog.test.ts`

**Interfaces:**
- Consumes: `CommerceOfferV1Schema`.
- Produces: `parseX402PaymentRequiredV2`, `normalizeX402ResourceV1`, `parseUcpProfileV1`, and `normalizeUcpCatalogProductV1`.

- [ ] **Step 1: Write failing protocol tests**

For x402, cover `PAYMENT-REQUIRED` base64 JSON, Bazaar resources, `exact` scheme, CAIP-2 network, asset/payTo/amount/timeout, offer/receipt extensions, malformed base64, duplicate JSON keys, oversized headers, wrong version, and missing placement binding. For UCP, accept profile-declared catalog/search results and reject checkout/order tool invocation, unknown capability versions, floating-point prices, external placement redirects, and uncommitted variants.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/x402-wire.test.ts lib/commerce/ucp-catalog.test.ts`

- [ ] **Step 3: Implement pure fail-closed parsers**

The functions receive raw bytes plus a trusted source record, hash the exact response bytes, and return parsed canonical offers. They perform no I/O and never infer missing payment, merchant, product, expiry, or evidence fields.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/x402-wire.test.ts lib/commerce/ucp-catalog.test.ts && pnpm --filter @cobia/web typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce
git commit -m "feat(web): normalize x402 and ucp offers"
```

### Task 3: Bounded Discovery Broker

**Files:**
- Create: `apps/web/lib/commerce/network-policy.ts`
- Create: `apps/web/lib/commerce/network-policy.test.ts`
- Create: `apps/web/lib/commerce/discovery-sources.ts`
- Create: `apps/web/lib/commerce/discovery-broker.ts`
- Create: `apps/web/lib/commerce/discovery-broker.test.ts`

**Interfaces:**
- Produces: `CommerceDiscoverySourceV1`, `CommerceFetchV1`, `DnsResolverV1`, `assertPublicCommerceUrlV1`, and `discoverCommerceOffersV1(input)`.

- [ ] **Step 1: Write failing adversarial broker tests**

Reject HTTP, credentials, loopback/private/link-local/reserved IPv4 and IPv6, mixed DNS answers, DNS rebinding, redirect-to-private, redirect loops, excessive redirects, timeout, compressed/decoded byte overflow, excessive JSON nesting, unsupported content types, and source URL mutation. Assert no authorization/cookie/wallet/RPC headers are sent and partial source failures return explicit per-source errors rather than fake results.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/network-policy.test.ts lib/commerce/discovery-broker.test.ts`

- [ ] **Step 3: Implement the broker**

Resolve and validate every hostname before each bounded request, pin the resolved address for the request abstraction, revalidate every redirect, cap elapsed time and decoded bytes, and normalize only through Task 2. The source registry contains only reviewed public endpoints and never accepts a request-provided URL.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/network-policy.test.ts lib/commerce/discovery-broker.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce
git commit -m "feat(web): broker public commerce discovery"
```

### Task 4: Immutable Offer Persistence

**Files:**
- Create: `apps/web/lib/db/commerce-schema.ts`
- Create: `apps/web/lib/db/commerce-offers.ts`
- Create: `apps/web/lib/db/commerce-offers.integration.test.ts`
- Create: `apps/web/drizzle/0017_commerce_offers.sql`
- Modify: `apps/web/lib/db/schema.ts`

**Interfaces:**
- Produces: `storeCommerceOfferSnapshotV1`, `listCurrentCommerceOffersV1`, and `getCommerceOfferByCommitmentV1`.

- [ ] **Step 1: Write failing PostgreSQL integration tests**

Require idempotency by commitment, immutable canonical JSON/source hash, distinct snapshots after any executable-field change, expiry filtering, stable ordering, source-error independence, and no update/delete repository methods.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test:integration -- lib/db/commerce-offers.integration.test.ts`

- [ ] **Step 3: Add migration and repository**

Store `commitment`, `offer_id`, `source_protocol`, `source_url`, `source_response_hash`, `chain_id`, `expires_at`, `eligibility`, `canonical_json`, and `created_at`. Use insert-on-conflict-do-nothing only; queries parse canonical JSON through the domain schema.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test:integration -- lib/db/commerce-offers.integration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/drizzle apps/web/lib/db
git commit -m "feat(db): persist immutable commerce offers"
```

### Task 5: Discovery API and Product Surface

**Files:**
- Create: `apps/web/lib/commerce/discovery-service.ts`
- Create: `apps/web/app/api/commerce/discover/route.ts`
- Create: `apps/web/app/api/commerce/discover/route.test.ts`
- Create: `apps/web/components/discover/CommerceOffers.tsx`
- Create: `apps/web/components/discover/CommerceOffers.test.tsx`
- Modify: `apps/web/components/discover/DiscoverView.tsx`
- Modify: `apps/web/components/discover/DiscoverView.test.tsx`
- Modify: `apps/web/app/discover/page.tsx`

**Interfaces:**
- Consumes: Task 3 broker and Task 4 repository.
- Produces: `GET /api/commerce/discover` and `CommerceOffers` rendering.

- [ ] **Step 1: Write failing route and component tests**

Assert the route persists before returning, serves unexpired snapshots, bounds pagination, reports source errors, and never exposes raw response bodies or headers. Assert cards show product, merchant, exact amount/asset/network, expiry, evidence class, source provenance, and `Executable`, `Discovery only`, or `Blocked`; only executable offers expose “Create intent”.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- app/api/commerce/discover/route.test.ts components/discover/CommerceOffers.test.tsx components/discover/DiscoverView.test.tsx`

- [ ] **Step 3: Implement service, route, and UI**

The API returns `{ offers, sourceErrors, generatedAt }`. The Discover page remains useful if one source fails, but labels the failure. The create-intent link contains only the immutable offer commitment; the server resolves all other fields.

- [ ] **Step 4: Confirm GREEN and accessibility**

Run: `pnpm --filter @cobia/web test -- app/api/commerce/discover/route.test.ts components/discover/CommerceOffers.test.tsx components/discover/DiscoverView.test.tsx && pnpm --filter @cobia/web typecheck && pnpm --filter @cobia/web lint`

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/components apps/web/lib/commerce
git commit -m "feat(web): expose commerce offer discovery"
```

### Task 6: Verification Gate

- [ ] Run focused domain/web/integration tests from Tasks 1–5.
- [ ] Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] Run `git diff --check` and verify changed source files remain under 300 LOC.
- [ ] Review every spec rejection condition against a named test.
- [ ] Confirm no credentials, buyer PII, production send path, or legacy paid-route fallback was introduced.
- [ ] Commit only gate documentation changes, if any, as `docs(commerce): document discovery verification`.
