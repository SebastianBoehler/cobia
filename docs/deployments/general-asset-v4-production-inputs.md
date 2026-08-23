# General Asset V4 production inputs

Frozen on 23 August 2026. These files are signer-free inputs and checksummed
Transaction Builder batches. They do not record a deployment, Safe proposal, signature,
activation, migration, or public opening.

## Reviewed adapter manifest

- Manifest: [`general-asset-v4-okx-manifest.json`](./general-asset-v4-okx-manifest.json)
- Canonical commitment: `0x73a6338a76d461a7b3385bf790deacc3046e0bb6dbaa9b744db8ca2251b658c9`
- File SHA-256: `aefab7632fa786ac964d02214d5c34b40b78c8fe16b754aa3ddbb28cfd65288e`
- Included: same-chain OKX `okx.swap@1` on Ethereum and X Layer, with exact target,
  selector, approval spender, and both target/spender runtime code hashes.
- Omitted: LI.FI. The reviewed live USDt0/USDC route did not supply a truthful
  destination completion emitter for the current verifier, and a Diamond runtime hash
  alone does not bind its facet logic.

The entry order is schema-valid. The canonical keys compare as strings, so
`okx.swap@1:196:...` sorts before `okx.swap@1:1:...`.

## X Layer snapshot and plan

Read at X Layer block `68733577`:

- operator `0xB6da8E6d497bd3Bc5016416DA57d177085449124`: nonce `13`, balance
  `60848010688350535` wei;
- Safe `0x08eea990F0b165A20d723e59517044a519C83351`: version `1.4.1`, owner
  `0xB6da8E6d497bd3Bc5016416DA57d177085449124`, threshold `1`, nonce `5`;
- registry `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877`: owner is the Safe, unpaused,
  runtime hash `0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d`;
- OKX target runtime hash `0x38e02cc6683c3fff0758aefa8b75189fd541ce1623cc9e6139de3119185f2a7f`;
- OKX spender runtime hash `0x69c96ed2d046e83e322c31cbc8c0943dbad47bc7cc31d1f8760921c47b0d7671`;
- V3 cumulative USDG input `11981648`; remaining `988018352` atomic;
- V3 cumulative USDt0 input `10909663`; remaining `989090337` atomic.

The exact unsigned plan is
[`general-asset-v4-xlayer-unsigned-plan.json`](./general-asset-v4-xlayer-unsigned-plan.json)
(SHA-256 `13482d50b1ce5cead9268d6a0135c5855be40408d83894553d8d420b0c59e350`).
It predicts risk manager `0xE399a72B7d0fEF974e868582671D4c7a23d37637` at nonce `13` and
Executor V4 `0xa3370D2719e670B46682bcC8f7Fae2f36797b66D` at nonce `14`.

The uploadable initial Safe batch is
[`general-asset-v4-xlayer-safe-proposal.json`](./general-asset-v4-xlayer-safe-proposal.json)
(SHA-256 `1ab45acf6426bb13f978fe410423509084db91291281da540eb03df7669f65eb`,
Safe checksum `0x03a75102eccfdbd3512de9a26d60ef80387100d693f05a07ddadcc09367098ec`).
It contains exactly four calls: reduce the V4 migration cap to `$48,000`, propose the
OKX permission, propose the canary wallet, and propose unpause. It is valid only after
both predicted contracts are deployed and their constructor/code read-back succeeds.

The following uploadable files are future-only and must not be executed with the initial
proposal:

- [`general-asset-v4-xlayer-safe-activation.future.json`](./general-asset-v4-xlayer-safe-activation.future.json)
  after the first 48-hour delay and proposed-state verification;
- [`general-asset-v4-xlayer-safe-open-proposal.future.json`](./general-asset-v4-xlayer-safe-open-proposal.future.json)
  only after a successful canary;
- [`general-asset-v4-xlayer-safe-open-activation.future.json`](./general-asset-v4-xlayer-safe-open-activation.future.json)
  after the separate public-open 48-hour delay.

The first delay starts when the initial Safe proposal batch executes onchain, not when
these files are generated, committed, or uploaded.

## Ethereum snapshot and sequencing blocker

At Ethereum block `25819061`, the operator nonce and balance were both `0`, and the
planned Safe, registry, and verifier addresses had no code. The reviewed OKX target and
spender hashes matched the manifest. The deterministic sequence is nonce `0` Safe factory,
nonce `1` registry, nonce `2` RiskManager V2, and nonce `3` Executor V4. Ethereum requires
gas funding plus Safe/registry deployment and read-back before any Safe batch is usable.

Immediately before any external action, re-read the chain ID, canonical block, deployer
nonce/balance, all runtime hashes, Safe owner/threshold/nonce, registry owner/paused state,
and V3 cumulative inputs. Any drift invalidates the affected unsigned plan or batch.
