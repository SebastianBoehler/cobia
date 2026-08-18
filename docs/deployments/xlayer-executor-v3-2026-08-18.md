# X Layer mainnet Executor V3 deployment

Snapshot: 18 August 2026. X Layer mainnet is chain `196`.

## Independently reproduced deployment

| Component | Address | Runtime code hash |
| --- | --- | --- |
| Existing adapter registry | `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877` | rechecked by execution preflight |
| V3 risk manager | `0xc69A1Fb1DD8AeECfbc557e4fc6a03E5a95201ded` | `0xe415bc68d215ff3c077c707e4493c0517b6ad76446feb49c0fe6cc00add9372c` |
| Executor V3 | `0xa31dDF9b68F0d3cE859c3dC2c12e17d9288231A0` | `0x3f8d413eb3adc61d371012de8cb0aad91817bd3f077529bad2ee329aef103894` |

The operator wallet signed both creations locally in OKX Wallet. No private key
or server-side broadcaster was used.

| Creation | Operator nonce | Transaction | Block / hash |
| --- | ---: | --- | --- |
| Risk manager | 5 | `0x02fb3c93982908521c9bbf116523770d1ae6348b9e9c391488854ea6487fb878` | `68286855` / `0x8f116ceda0f2832cc89e40b81478949e0eace204376928e149c5cb0ba9276ca1` |
| Executor V3 | 6 | `0x2278a9241529becaf1baac9a3de7777fd5ab6051e0e65b3b4fc45e1e3f3fc767` | `68286860` / `0x2d067282cd45cbb0973cf722fa04582f86675c82a91c79d34fd28608e116834e` |

The independently generated creation-input hashes matched the mined transaction
inputs exactly:

- risk manager: `0x3117a5898b62629983216febaf45b9bc4baa445690548fd89545d2f388f1bee7`;
- Executor V3: `0x40435e38a54ea43687e9571c1197aca69bb483d45cafe4722aa5539606e929f1`.

## Read-back state

- Risk-manager owner: governance Safe
  `0x08eea990F0b165A20d723e59517044a519C83351`.
- Risk-manager executor: exact Executor V3 address above.
- Risk-manager verifier: `0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4`.
- Risk manager is paused and access mode is `Allowlist`.
- Executor V3 points to the existing adapter registry and the new risk manager.
- Operator nonce after both creations is `7`.

## Delayed proposal evidence

The governance Safe executed the four-call proposal batch in transaction
`0xfa7e36f2f1287e79d8e7f07df8ba12fdcfe9f547841044d4b63d3bf954672cad`
at block `68287205` / hash
`0xd3caed435547db544d40d061262aadb289dd7d0d4f1f76a900134228d9b197f5`.
Direct contract reads reproduced:

- USDG and USD₮0 each pending at `10_000_000` per route,
  `50_000_000` per canary wallet per day, and `1_000_000_000` cumulative;
- canary wallet `0x9Afbf85e52612A9922617aDdA9569e13f565de31` pending;
- risk-manager unpause pending;
- one shared `activateAfter` value: `1787229041`, or
  `2026-08-20 12:30:41 UTC` (`14:30:41 CEST`).

The risk manager remains paused, both tokens remain disabled, and the canary is
not yet allowed. The registry remains paused. Its three pending permissions are
mature and their current target runtime hashes still match Aave supply, Curve
exact-input, and Uniswap exact-input.

## Activation boundary

Deployment is not activation. The Safe must first propose token limits, the
canary wallet, and unpause. `CobiaRiskManagerV1` enforces a 48-hour delay. Only
after that delay may a second Safe batch activate the matured registry
permissions and V3 limits and unpause both controls.

The deterministic eight-call Safe Transaction Builder file is retained at
[`xlayer-executor-v3-activation.json`](./xlayer-executor-v3-activation.json).
Its checksum is
`0xa0edcf91b9ae4044e3edf4921771b67e69b71519582fe2761814828186d7560c`.
It must not be executed before `1787229041`, and execution still requires an
independent read-back of every activated value.

Until the final read-back verifies every activated value, the production runtime
must treat Executor V3 as unavailable. A later retail canary is a separate,
explicit owner-wallet principal transaction and is never part of automated
release verification.
