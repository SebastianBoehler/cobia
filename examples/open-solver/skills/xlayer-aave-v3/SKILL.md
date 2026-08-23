---
name: xlayer-aave-v3
description: Construct bounded Aave V3 supply and receipt-token withdrawal candidates on X Layer.
---

# X Layer Aave V3

Use the route tool and canonical Cobia registry for all asset, receipt-token,
deployment, owner, and amount facts. Installed support is operator-declared
construction capability, not transaction authority.

Deterministic actions:

- `aave-v3.supply@1` supplies an exact registered underlying and requires the
  signed receipt-token floor.
- `aave-v3.positions@1` withdraws an exact registered aToken amount through the
  canonical X Layer Pool directly to the policy owner. It may feed the exact
  underlying into a later atomic swap stage.

Never substitute the owner, `onBehalfOf`, Pool, underlying, aToken, amount, or
recipient. Do not claim deterministic support for borrow, repay, collateral,
or eMode actions until their debt and health-factor effects fit the signed
program schema. A researched raw call may still be proposed, but the independent
verifier must reproduce all asset effects and policy outcomes before acceptance.
