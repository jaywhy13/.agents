#!/usr/bin/env python3
"""Harvest and condense the past week's Claude Code conversations.

Reads the per-session JSONL transcripts under ~/.claude/projects/, keeps only the
sessions touched within the look-back window, and prints a compact, human-readable
digest to stdout: one section per session, user messages in full, assistant prose in
full, and tool noise collapsed to short markers. The retrospect skill reads this
digest and synthesises the weekly retrospective from it.

Usage:
    collect_conversations.py [--days 7] [--max-chars 4000] [--projects-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7,
                        help="Look-back window in days (default: 7).")
    parser.add_argument("--max-chars", type=int, default=4000,
                        help="Truncate any single message longer than this (default: 4000).")
    parser.add_argument("--projects-dir", type=Path,
                        default=Path.home() / ".claude" / "projects",
                        help="Root holding per-project transcript folders.")
    return parser.parse_args()


def transcripts_within_window(projects_dir: Path, days: int) -> list[Path]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent: list[Path] = []
    for transcript in projects_dir.glob("*/*.jsonl"):
        modified_at = datetime.fromtimestamp(transcript.stat().st_mtime, tz=timezone.utc)
        if modified_at >= cutoff:
            recent.append(transcript)
    return sorted(recent, key=lambda path: path.stat().st_mtime)


def readable_text_from_content(content: object, max_chars: int) -> str:
    """Flatten a message's content into prose, collapsing tool traffic to markers."""
    if isinstance(content, str):
        return truncate(content, max_chars)

    fragments: list[str] = []
    for block in content if isinstance(content, list) else []:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type == "text":
            fragments.append(truncate(block.get("text", ""), max_chars))
        elif block_type == "thinking":
            continue  # internal reasoning is not part of the shared conversation
        elif block_type == "tool_use":
            fragments.append(f"[tool call: {block.get('name', 'unknown')}]")
        elif block_type == "tool_result":
            fragments.append("[tool result]")
    return "\n".join(fragment for fragment in fragments if fragment)


def truncate(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"\n…[truncated {len(text) - max_chars} chars]"


def digest_session(transcript: Path, max_chars: int) -> str:
    lines: list[str] = []
    project_label = transcript.parent.name.lstrip("-").replace("-", "/")
    modified_at = datetime.fromtimestamp(transcript.stat().st_mtime, tz=timezone.utc)
    lines.append(f"\n{'=' * 80}")
    lines.append(f"SESSION {transcript.stem}  ·  project: {project_label}  ·  last active: {modified_at.date()}")
    lines.append("=" * 80)

    for raw_line in transcript.read_text(errors="replace").splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            record = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        message = record.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if role not in ("user", "assistant"):
            continue
        prose = readable_text_from_content(message.get("content"), max_chars)
        if prose:
            lines.append(f"\n[{role.upper()}]\n{prose}")
    return "\n".join(lines)


def main() -> int:
    arguments = parse_arguments()
    if not arguments.projects_dir.is_dir():
        print(f"No projects directory at {arguments.projects_dir}", file=sys.stderr)
        return 1

    transcripts = transcripts_within_window(arguments.projects_dir, arguments.days)
    if not transcripts:
        print(f"No conversations modified in the last {arguments.days} days.", file=sys.stderr)
        return 1

    print(f"# Conversation digest — last {arguments.days} days — {len(transcripts)} session(s)")
    for transcript in transcripts:
        print(digest_session(transcript, arguments.max_chars))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
