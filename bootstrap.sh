#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 pi" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 64
fi

case "$1" in
  pi)
    source_file="${HOME}/.agents/AGENTS.md"
    target_dir="${HOME}/.pi/agent"
    target_link="${target_dir}/AGENTS.md"
    ;;
  *)
    usage
    echo "Unsupported bootstrap target: $1" >&2
    exit 64
    ;;
esac

if [[ ! -e "$source_file" ]]; then
  echo "Source file not found: $source_file" >&2
  exit 66
fi

mkdir -p "$target_dir"
cd "$target_dir"

if [[ -e "$target_link" && ! -L "$target_link" ]]; then
  echo "Refusing to replace non-symlink: $target_link" >&2
  exit 73
fi

ln -sfn "$source_file" "$(basename "$target_link")"
echo "Linked $target_link -> $source_file"
