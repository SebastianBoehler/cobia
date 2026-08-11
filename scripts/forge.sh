#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
image="ghcr.io/foundry-rs/foundry:stable@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46"

exec docker run --rm \
  --volume "$repo_root:/workspace" \
  --workdir /workspace/contracts \
  --entrypoint forge \
  "$image" "$@"
