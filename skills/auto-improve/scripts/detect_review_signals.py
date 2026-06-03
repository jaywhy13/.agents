#!/usr/bin/env python3
"""Stop hook for the auto-improve skill.

Claude Code runs this when Claude finishes responding. It reads the hook
payload on stdin: {"transcript_path": ..., "stop_hook_active": bool, ...}.

It scans the session transcript for friction signals (corrections, clarity
requests, pushback, frustration). On a substantive session with signals, it
emits a `block` decision whose reason tells Claude to run the auto-improve
review before stopping. It fires at most once per transcript and never loops.

Wire it up in settings.json:

    {
      "hooks": {
        "Stop": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "python3 ~/.claude/skills/auto-improve/scripts/detect_review_signals.py"
              }
            ]
          }
        ]
      }
    }
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

# Minimum number of user turns before a session is worth reviewing.
MINIMUM_USER_TURNS = 3
# Minimum number of friction signals before nudging.
MINIMUM_SIGNAL_COUNT = 1

SIGNAL_PATTERNS: dict[str, list[str]] = {
    "correction": [
        r"\bno,", r"\bthat'?s (not|wrong|incorrect)", r"\bnot what i",
        r"\bredo\b", r"\brevert\b", r"\bundo\b", r"\binstead\b",
        r"\bi (said|told you|asked)\b", r"\bstop (doing|using)\b",
        r"\bdon'?t do that\b", r"\bwhy did you\b",
    ],
    "clarity": [
        r"\bwhat do you mean\b", r"\bi don'?t understand\b", r"\bunclear\b",
        r"\bconfusing\b", r"\bclarify\b", r"\brephrase\b", r"\bwhat are you\b",
    ],
    "pushback": [
        r"\bi disagree\b", r"\bthat doesn'?t (make sense|work)\b",
        r"\bwhy would (you|we)\b", r"\bwhy are you\b",
    ],
    "frustration": [
        r"\bagain\?", r"\balready (said|told|explained)\b", r"\bfor the (second|third|last) time\b",
        r"\bugh\b", r"\bseriously\b", r"\bcome on\b", r"\bas i (said|mentioned)\b", r"!\?",
    ],
}

COMPILED: list[tuple[str, re.Pattern[str]]] = [
    (category, re.compile(pattern, re.IGNORECASE))
    for category, patterns in SIGNAL_PATTERNS.items()
    for pattern in patterns
]


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def extract_user_texts(transcript_path: Path) -> list[str]:
    """Return the plain text of every user message in the transcript."""
    user_texts: list[str] = []
    try:
        lines = transcript_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return user_texts

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("type") != "user":
            continue
        content = entry.get("message", {}).get("content", "")
        if isinstance(content, str):
            user_texts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    user_texts.append(block.get("text", ""))
    return user_texts


def count_signals(user_texts: list[str]) -> int:
    signal_count = 0
    for text in user_texts:
        for _category, pattern in COMPILED:
            if pattern.search(text):
                signal_count += 1
                break  # at most one signal per message keeps the count meaningful
    return signal_count


def sentinel_path(transcript_path: str) -> Path:
    digest = hashlib.sha1(transcript_path.encode("utf-8")).hexdigest()[:16]
    return Path(tempfile.gettempdir()) / f"auto-improve-{digest}.done"


def main() -> int:
    payload = read_payload()

    # Never loop: if we already blocked once this turn, let Claude stop.
    if payload.get("stop_hook_active"):
        return 0

    transcript_path_str = payload.get("transcript_path", "")
    if not transcript_path_str:
        return 0

    sentinel = sentinel_path(transcript_path_str)
    if sentinel.exists():
        return 0  # already nudged this session

    user_texts = extract_user_texts(Path(transcript_path_str))
    if len(user_texts) < MINIMUM_USER_TURNS:
        return 0
    if count_signals(user_texts) < MINIMUM_SIGNAL_COUNT:
        return 0

    try:
        sentinel.write_text("done", encoding="utf-8")
    except OSError:
        pass  # nudging once-best-effort is fine; worst case we nudge again

    reason = (
        "This session shows signs of friction (corrections, clarity requests, "
        "pushback, or frustration). Before finishing, run the auto-improve skill: "
        "review the conversation for generalizable lessons and propose edits to "
        "~/.agents/AGENTS.md for the user's approval. If the friction was trivial "
        "or already captured, say so briefly and stop."
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
