#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

exec docker run --rm \
  --entrypoint forge \
  --volume "${repo_root}:/workspace" \
  --workdir /workspace/contracts \
  ghcr.io/foundry-rs/foundry:stable@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46 \
  "$@"
