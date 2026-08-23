---
name: xlayer-curve
description: Construct Curve StableSwap NG swaps and bounded single-coin liquidity actions on X Layer.
---

# X Layer Curve

Use the pinned Cobia registry and route tool. Installed support is an
operator-declared construction capability, not execution authority.

Deterministic actions:

- exact-input swaps between the two registered pool coins;
- single-coin add liquidity with an exact spend and LP-token mint floor;
- single-coin remove liquidity with an exact LP burn and output-token floor.

Always bind the canonical pool, exact coin index/order, owner receiver, exact
spend or burn, and minimum output. Do not hand-author alternate pools. Balanced
multi-coin actions remain open-lane research until the signed program can bind
every input independently. The verifier must replay every candidate.
