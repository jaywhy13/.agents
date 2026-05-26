---
name: nvim-open
description: Open files in the user's running Neovim instance from Pi. Use proactively whenever discussing a specific file or code location — open it in their editor so they can see it. Supports jumping to a line or selecting a line range. Auto-detects which Zellij session has Neovim running.
---

# nvim-open

Open files in the user's running Neovim instance inside a Zellij session.

## When to use

**Use this proactively** — whenever you and the user are discussing a specific file or code location, open it in their Neovim so they can see it alongside the conversation. You don't need to be asked.

Good triggers:
- You're reading or showing code from a specific file
- You reference a file:line in a review finding or debugging session
- The user asks "where is X defined?" and you find it
- You're walking through code changes or a PR diff
- You and the user are discussing a specific function or class

## Usage

```bash
scripts/nvim-open.sh <file> [line_or_range] [session]
```

### Arguments

| Arg | Required | Description |
|-----|----------|-------------|
| `file` | Yes | Path to the file (relative or absolute) |
| `line_or_range` | No | Line number (`42`) or range (`10:25`) |
| `session` | No | Zellij session name. Auto-detected if omitted. |

### Examples

```bash
# Open a file
scripts/nvim-open.sh /path/to/file.rb

# Open at a specific line (cursor jumps there, screen centers)
scripts/nvim-open.sh /path/to/file.rb 42

# Open and visually select a range of lines
scripts/nvim-open.sh /path/to/file.rb 10:25

# Target a specific Zellij session
scripts/nvim-open.sh /path/to/file.rb 42 anc-reliability
```

## How it works

1. Finds all Neovim Unix sockets on the system
2. Walks each socket's PID up the process tree to find which Zellij session owns it
3. Sends `:edit +<line> <file>` via `nvim --server <socket> --remote-send`
4. Focuses the Neovim pane in Zellij via `zellij action focus-pane-id`

## Notes

- Auto-detection skips Pi's own Zellij session and exited sessions
- If multiple sessions have Neovim, it picks the first match; pass `session` explicitly to control this
- The pane focus finds the pane by looking for "Nvim" in the pane title
- Line ranges use Vim visual line mode (`V`) so the user sees the selection highlighted
