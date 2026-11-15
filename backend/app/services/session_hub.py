"""In-memory phone ↔ desktop pairing for demo sessions (single-process)."""

from __future__ import annotations

from datetime import datetime, timezone

_sessions: dict[str, dict[str, object]] = {}


def register(session_id: str, device: str, mission: str = "") -> dict[str, object]:
    sid = (session_id or "").strip()
    if len(sid) < 8:
        raise ValueError("Invalid session id.")
    if device not in ("phone", "desktop"):
        raise ValueError("Device must be phone or desktop.")
    now = datetime.now(timezone.utc).isoformat()
    row = _sessions.setdefault(
        sid,
        {"mission": mission, "desktop_at": None, "phone_at": None, "created_at": now},
    )
    if mission:
        row["mission"] = mission
    row[f"{device}_at"] = now
    return snapshot(sid)


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