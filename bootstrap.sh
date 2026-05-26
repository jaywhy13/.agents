#!/usr/bin/env bash
set -euo pipefail

TEMPLATE_DIR="${HOME}/.agents"
TEMPLATE_FILE="${TEMPLATE_DIR}/AGENTS.md"

usage() {
  cat >&2 <<EOF
Usage:
  $0 claude      Symlink AGENTS.md and skills into ~/.claude/
  $0 pi          Symlink AGENTS.md into ~/.pi/agent/
  $0 repo        Interactively bootstrap AGENTS.md in a target repository
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 64
fi

# ---------------------------------------------------------------------------
# Subcommand: claude — symlink AGENTS.md and skills into ~/.claude/
# ---------------------------------------------------------------------------
bootstrap_claude() {
  local claude_dir="${HOME}/.claude"
  mkdir -p "$claude_dir"

  # Symlink AGENTS.md as the user-level CLAUDE.md
  local source_file="${TEMPLATE_FILE}"
  local target_link="${claude_dir}/CLAUDE.md"

  if [[ ! -e "$source_file" ]]; then
    echo "Source file not found: $source_file" >&2
    exit 66
  fi

  if [[ -e "$target_link" && ! -L "$target_link" ]]; then
    echo "Refusing to replace non-symlink: $target_link" >&2
    exit 73
  fi

  ln -sfn "$source_file" "$target_link"
  echo "Linked $target_link -> $source_file"

  # Symlink skills directory
  local source_skills="${TEMPLATE_DIR}/skills"
  local target_skills="${claude_dir}/skills"

  if [[ ! -d "$source_skills" ]]; then
    echo "Skills directory not found: $source_skills" >&2
    exit 66
  fi

  if [[ -e "$target_skills" && ! -L "$target_skills" ]]; then
    echo "Refusing to replace non-symlink: $target_skills" >&2
    exit 73
  fi

  ln -sfn "$source_skills" "$target_skills"
  echo "Linked $target_skills -> $source_skills"
}

# ---------------------------------------------------------------------------
# Subcommand: pi — symlink AGENTS.md into the pi agent directory
# ---------------------------------------------------------------------------
bootstrap_pi() {
  local source_file="${TEMPLATE_FILE}"
  local target_dir="${HOME}/.pi/agent"
  local target_link="${target_dir}/AGENTS.md"

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
}

# ---------------------------------------------------------------------------
# Subcommand: repo — interactively bootstrap AGENTS.md in a target repo
# ---------------------------------------------------------------------------
bootstrap_repo() {
  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    echo "Error: template not found at $TEMPLATE_FILE" >&2
    exit 1
  fi

  # Which LLM executable?
  read -r -p "LLM executable [claude/pi] (default: claude): " LLM
  LLM="${LLM:-claude}"

  if ! command -v "$LLM" >/dev/null 2>&1; then
    echo "Error: '$LLM' is not on PATH." >&2
    exit 1
  fi

  # Which repository?
  DEFAULT_REPO="$(pwd)"
  read -r -p "Target repo path [${DEFAULT_REPO}]: " REPO_PATH
  REPO_PATH="${REPO_PATH:-$DEFAULT_REPO}"

  if [[ ! -d "$REPO_PATH" ]]; then
    echo "Error: '$REPO_PATH' is not a directory." >&2
    exit 1
  fi

  # Scaffold docs/ files too?
  read -r -p "Also scaffold docs/architecture.md, docs/coding_conventions.md, docs/testing.md? [Y/n]: " SCAFFOLD_ANSWER
  SCAFFOLD_ANSWER="${SCAFFOLD_ANSWER:-Y}"

  if [[ "$SCAFFOLD_ANSWER" =~ ^[Yy] ]]; then
    SCAFFOLD_DOCS_BLOCK=$(cat <<'BLOCK'
## Also scaffold the docs/ files

Create (or improve, if they already exist) these files in the target repo:

- `docs/architecture.md` — full layered-architecture writeup tailored to this repo's language and stack.
- `docs/coding_conventions.md` — full conventions writeup (naming, comments, abstractions, error handling, etc.).
- `docs/testing.md` — full testing writeup (what to test, how to structure tests, fakes vs. mocks, factories).

Use the template at the path above as the source for tone, depth, and reasoning style — but adapt every code example to the repo's actual language. Do not leave Python examples in a Go or TypeScript repo.

If a docs/ file already exists, *improve* it rather than overwriting. Preserve repo-specific guidance already present.
BLOCK
)
  else
    SCAFFOLD_DOCS_BLOCK=$(cat <<'BLOCK'
## Do NOT create the docs/ files

Reference `docs/architecture.md`, `docs/coding_conventions.md`, and `docs/testing.md` by relative path in AGENTS.md, but do not create them. The user will fill them in separately.
BLOCK
)
  fi

  PROMPT=$(cat <<EOF
You are bootstrapping an AGENTS.md file for the repository at:

  ${REPO_PATH}

A reference template of personal conventions lives at:

  ${TEMPLATE_FILE}

Read that template first. It defines the tone, structure, and depth expected: direct, opinionated, examples-driven, explains *why* each rule exists rather than just stating it.

## Your task

Create or update \`AGENTS.md\` at the root of the target repo. If one already exists, **improve** it rather than overwriting — preserve any repo-specific guidance that's already there.

## Determine the language first

Before writing examples:

1. Inspect the repo to determine the primary language(s) and stack. Look at file extensions, package manifests (\`package.json\`, \`pyproject.toml\`, \`go.mod\`, \`Cargo.toml\`, \`Gemfile\`, \`pom.xml\`, etc.), and lockfiles.
2. If the repo is empty, polyglot in a non-obvious way, or you genuinely can't tell — **ASK the user** before continuing.
3. Tailor every code example to the chosen language. Do not leave examples in a different language than the repo uses.

## Non-negotiable sections

AGENTS.md MUST include short summary sections for each of the following. Each summary should be tight and scannable, and link to a fuller document under \`docs/\`:

1. **Layered Architecture** — summary in AGENTS.md, full version in \`docs/architecture.md\`.
2. **Coding Conventions** — summary in AGENTS.md, full version in \`docs/coding_conventions.md\`.
3. **Tests** — summary in AGENTS.md, full version in \`docs/testing.md\`.

For each:

- State the rule(s) clearly.
- Link to the full docs file with a relative path (e.g. \`See docs/architecture.md for the full version.\`).
- Stay short — the deep content lives in \`docs/\`, not in AGENTS.md. AGENTS.md is the quick-reference; \`docs/\` is the canonical source.

${SCAFFOLD_DOCS_BLOCK}

## Repository conventions come first

If the repo already has established conventions (existing code patterns, existing docs, lint config, framework idioms), **match what's already there**. Only fall back to the defaults in the template when there is no existing convention to follow.

## When in doubt, ask

If you are unsure about a repository-specific decision — preferred test runner, build tool, deployment target, framework idiom — **ASK** rather than guess. A short clarifying question now beats wrong guidance baked into AGENTS.md.

Begin now.
EOF
)

  cd "$REPO_PATH"
  printf '%s\n' "$PROMPT" | "$LLM"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$1" in
  claude) bootstrap_claude ;;
  pi)     bootstrap_pi ;;
  repo)   bootstrap_repo ;;
  *)
    usage
    echo "Unsupported bootstrap target: $1" >&2
    exit 64
    ;;
esac
