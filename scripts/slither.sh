#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contracts_dir="$repo_root/contracts"

command -v forge >/dev/null || { echo "native forge is required" >&2; exit 1; }
command -v slither >/dev/null || { echo "slither 0.11.6+ is required" >&2; exit 1; }

# Absolute paths prevent Foundry from emitting duplicate relative/absolute
# OpenZeppelin source units, which Slither cannot merge safely.
export FOUNDRY_LIBS="[\"$repo_root/node_modules\"]"
export FOUNDRY_REMAPPINGS="@openzeppelin/contracts/=$repo_root/node_modules/@openzeppelin/contracts/"

cd "$contracts_dir"
slither src/CobiaExecutorV1.sol \
  --filter-paths 'node_modules|test' \
  --exclude-dependencies \
  --exclude-low \
  --exclude-informational \
  --exclude-optimization
