# X Layer Executor V2 deployment evidence

This records the paused X Layer mainnet (`196`) deployment. It is evidence of
deployment and delayed proposals, not production-readiness or permission to move
principal.

## Identities

| Role | Address |
|---|---|
| Operator | `0xB6da8E6d497bd3Bc5016416DA57d177085449124` |
| Governance Safe | `0x08eea990F0b165A20d723e59517044a519C83351` |
| Verifier signer | `0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4` |
| Canary wallet | `0x9Afbf85e52612A9922617aDdA9569e13f565de31` |

The Safe was independently read as version 1.4.1, one owner (the operator),
threshold 1. Its creation transaction is
`0x9121ca908597b00a956d7b31db8700e8ec5600396b4660b3b343753246526b4d`.

## Contracts

| Contract | Address | Runtime code hash |
|---|---|---|
| Adapter registry | `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877` | `0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d` |
| Risk manager | `0x4029dD2e07f7951e52Fa67E64573B0e5DB3225ab` | `0x3f8795bf6f49d3ff98a13aaa3c1c9dee09b340ace87c88e1d2f56996eb37a3b5` |
| Executor V2 | `0x554Dd547C797d6A4350D6A2b098350C1ad6aE674` | `0xe151a94fefb129c1c2ce1529578ce72f15ac1f7417ef9aff389c52cc75ad7640` |

Creation receipts:

| Contract | Transaction | Block | Creation-input hash |
|---|---|---:|---|
| Registry | `0x524c80caa7c78000dd3ae3bb7bbd90617df5b7905a941193912a2f2017699bc6` | 68047817 | `0xeff0bb65ee72ef130327b34040ab0153dc6ac27b00afe021e005bea105423dfc` |
| Risk manager | `0x91bb696f711edb11d3a386892ea1c723c85c82df9a3c595fd4acfdc45948e907` | 68047822 | `0x523025fcdd4f7870c5f8306bf15c5c599c18794a64deba64ce9d27f1ceda0bf9` |
| Executor | `0x55b32bf4ed68355fe32cfbba5b913977d091f1b50e08b2b4b9c8bb50a8d00222` | 68047828 | `0xdb7ab0a9cfc28528a01a1202c0e0109ff822326572e7c89e22dc2057ef23413f` |

All receipts succeeded and every creation input was byte-for-byte equal to the
locally generated nonce-bound plan. The registry runtime equals its artifact.
The contracts with Solidity immutables have the expected runtime length and
constructor-bound getters. Both governance contracts report the Safe as owner;
the risk manager and executor cross-references and verifier signer match the
table above.

## Delayed proposal batch

The Safe executed batch transaction
`0x5d9f72b402b96340458df1b970c1eb4d7dc6a7171d36645af50a6b780870f93f`
in block 68048824, block hash
`0x19fe67bde21bf8b01b28c30448b64ef9a43b7ba01d5a03c755407afb439340de`.
The receipt succeeded and Safe nonce advanced from 0 to 1.

The batch:

- paused the registry;
- proposed Aave V3 supply, Curve StableSwap-NG exact input, and Uniswap V3
  exact input with live runtime hashes matching the trusted manifest;
- proposed USDG and USDt0 six-decimal caps of 10 per route, 50 per wallet/day,
  and 1,000 cumulative;
- proposed only the canary wallet; and
- proposed unpause.

All pending changes have activation timestamp `1786990660`, which is
2026-08-17 18:17:40 UTC / 20:17:40 CEST. Until a later Safe activation batch:

- all three permissions are inactive;
- both tokens are disabled;
- the canary is not allowed;
- the registry and risk manager are paused; and
- risk access mode remains allowlist-only.

## Remaining activation gates

1. Independent contract source/bytecode review.
2. Published-source verification on the chain explorer where supported.
3. Fresh checks of owners, bindings, code hashes, proxy implementations,
   proposal values, block continuity, and timelock maturity.
4. Fresh pinned X Layer fork execution and complete relevant test/build/audit
   gates on the release SHA.
5. A separately reviewed Safe activation batch generated from the committed
   plan. No activation file is retained before these gates pass.
6. A separate explicit approval before any canary principal transaction.
