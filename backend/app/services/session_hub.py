"""In-memory phone ↔ desktop pairing with shared chat transcript (single-process demo)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_sessions: dict[str, dict[str, Any]] = {}

WELCOME = (
    "Welcome aboard. Scan the QR on desktop to link your phone. "
    "On phone, the rear camera opens for crew checks. Chat stays synced on both screens."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure(session_id: str, mission: str = "") -> dict[str, Any]:
    sid = (session_id or "").strip()
    if len(sid) < 8:
        raise ValueError("Invalid session id.")
    row = _sessions.get(sid)
    if row is None:
        row = {
            "mission": mission,
            "desktop_at": None,
            "phone_at": None,
            "created_at": _now(),
            "revision": 1,
            "turns": [{"role": "assistant", "content": WELCOME, "at": _now()}],
            "events": [],
        }
        _sessions[sid] = row
    elif mission:
        row["mission"] = mission
    return row


def register(session_id: str, device: str, mission: str = "") -> dict[str, object]:
    if device not in ("phone", "desktop"):
        raise ValueError("Device must be phone or desktop.")
    row = _ensure(session_id, mission)
    row[f"{device}_at"] = _now()
    row["revision"] = int(row.get("revision") or 0) + 1
    return snapshot(session_id)


def append_turns(session_id: str, turns: list[dict[str, str]]) -> dict[str, Any]:
    row = _ensure(session_id)
    cleaned: list[dict[str, str]] = []
    for turn in turns[:20]:
        role = str(turn.get("role") or "user")
        if role not in ("user", "assistant"):
            role = "user"
        content = str(turn.get("content") or "").strip()[:4000]
        if not content:
            continue
        cleaned.append({"role": role, "content": content, "at": _now()})
    if cleaned:
        existing = list(row.get("turns") or [])
        existing.extend(cleaned)
        row["turns"] = existing[-80:]
        row["revision"] = int(row.get("revision") or 0) + 1
    return sync_payload(session_id)


def append_event(session_id: str, title: str, detail: str) -> dict[str, Any]:
    row = _ensure(session_id)
    events = list(row.get("events") or [])
    events.insert(
        0,
        {
            "id": f"{_now()}-{title}",
            "at": _now(),
            "title": str(title)[:120],
            "detail": str(detail)[:500],
        },
    )
    row["events"] = events[:40]
    row["revision"] = int(row.get("revision") or 0) + 1
    return sync_payload(session_id)


def snapshot(session_id: str) -> dict[str, object]:
    sid = (session_id or "").strip()
    row = _sessions.get(sid)
    if not row:
        return {
            "session_id": sid,
            "found": False,
            "phone_connected": False,
            "desktop_connected": False,
            "mission": "",
        }
    return {
        "session_id": sid,
        "found": True,
        "phone_connected": bool(row.get("phone_at")),
        "desktop_connected": bool(row.get("desktop_at")),
        "mission": row.get("mission") or "",
        "phone_at": row.get("phone_at"),
        "desktop_at": row.get("desktop_at"),
    }


def sync_payload(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    base = snapshot(sid)
    row = _sessions.get(sid)
    if not row:
        return {
            **base,
            "revision": 0,
            "turns": [],
            "events": [],
        }
    turns = [
        {"role": t["role"], "content": t["content"]}
        for t in (row.get("turns") or [])
        if isinstance(t, dict) and t.get("content")
    ]
    return {
        **base,
        "revision": int(row.get("revision") or 0),
        "turns": turns,
        "events": list(row.get("events") or []),
    }
