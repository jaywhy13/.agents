#!/bin/bash
# Open a file (optionally at a line/range) in a running Neovim instance
# inside a specific Zellij session.
#
# Usage:
#   nvim-open.sh <file> [line] [session]
#   nvim-open.sh <file> [start_line:end_line] [session]
#
# Examples:
#   nvim-open.sh /path/to/file.rb                    # open file in default session
#   nvim-open.sh /path/to/file.rb 42                  # open at line 42
#   nvim-open.sh /path/to/file.rb 10:25               # open, select lines 10-25
#   nvim-open.sh /path/to/file.rb 42 anc-reliability  # open in specific session

set -euo pipefail

FILE="$1"
LINE_SPEC="${2:-}"
SESSION="${3:-}"

# --- Resolve file to absolute path ---
if [[ "$FILE" != /* ]]; then
  FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
fi

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: File not found: $FILE" >&2
  exit 1
fi

# --- Parse line spec ---
START_LINE=""
END_LINE=""
if [[ -n "$LINE_SPEC" ]]; then
  if [[ "$LINE_SPEC" == *:* ]]; then
    START_LINE="${LINE_SPEC%%:*}"
    END_LINE="${LINE_SPEC##*:}"
  else
    START_LINE="$LINE_SPEC"
  fi
fi

# --- Auto-detect session if not provided ---
# If we're inside a Zellij session, skip it (that's Pi's session).
# Try to find a session that has a running nvim.
find_nvim_socket_for_session() {
  local target_session="$1"
  for socket in $(find /var/folders -path "*/nvim.*/nvim.*.0" -type s 2>/dev/null); do
    local nvim_pid
    nvim_pid=$(basename "$socket" | cut -d. -f2)
    local current_pid="$nvim_pid"
    while [ "$current_pid" != "1" ] && [ -n "$current_pid" ] && [ "$current_pid" != "0" ]; do
      local cmd
      cmd=$(ps -o command= -p "$current_pid" 2>/dev/null) || break
      if echo "$cmd" | grep -q "zellij --server.*/${target_session}\$"; then
        echo "$socket"
        return 0
      fi
      current_pid=$(ps -o ppid= -p "$current_pid" 2>/dev/null | tr -d ' ')
    done
  done
  return 1
}

auto_detect_session() {
  local current_session="${ZELLIJ_SESSION_NAME:-}"

  # First: try the CURRENT session (Pi and Neovim are usually side-by-side)
  if [[ -n "$current_session" ]]; then
    if find_nvim_socket_for_session "$current_session" >/dev/null 2>&1; then
      echo "$current_session"
      return 0
    fi
  fi

  # Fallback: try other active sessions
  local sessions
  sessions=$(zellij list-sessions --no-formatting 2>/dev/null | grep -v "EXITED" | awk '{print $1}')
  for s in $sessions; do
    [[ "$s" == "$current_session" ]] && continue
    if find_nvim_socket_for_session "$s" >/dev/null 2>&1; then
      echo "$s"
      return 0
    fi
  done
  return 1
}

if [[ -z "$SESSION" ]]; then
  SESSION=$(auto_detect_session) || {
    echo "ERROR: No Zellij session with a running Neovim found." >&2
    echo "Available sessions:" >&2
    zellij list-sessions 2>/dev/null >&2
    exit 1
  }
fi

# --- Find the nvim socket ---
SOCKET=$(find_nvim_socket_for_session "$SESSION") || {
  echo "ERROR: No Neovim instance found in Zellij session '$SESSION'" >&2
  exit 1
}

# --- Build the Neovim command ---
if [[ -n "$END_LINE" ]]; then
  # Open file, go to start line, visually select to end line
  NVIM_CMD=":edit +${START_LINE} ${FILE}<CR>V${END_LINE}Gzz"
elif [[ -n "$START_LINE" ]]; then
  # Open file at specific line, center it
  NVIM_CMD=":edit +${START_LINE} ${FILE}<CR>zz"
else
  # Just open the file
  NVIM_CMD=":edit ${FILE}<CR>"
fi

nvim --server "$SOCKET" --remote-send "$NVIM_CMD" 2>&1 || {
  echo "ERROR: Failed to send command to Neovim at $SOCKET" >&2
  exit 1
}

# --- Find and focus the nvim pane in Zellij ---
# Look for a pane whose title contains "Nvim" or "nvim"
PANE_ID=$(zellij --session "$SESSION" action list-panes 2>/dev/null \
  | grep -i "nvim\|Nvim" \
  | head -1 \
  | awk '{print $1}')

if [[ -n "$PANE_ID" ]]; then
  zellij --session "$SESSION" action focus-pane-id "$PANE_ID" 2>/dev/null
fi

echo "Opened ${FILE}${START_LINE:+:${START_LINE}}${END_LINE:+-${END_LINE}} in Neovim (session: ${SESSION})"
