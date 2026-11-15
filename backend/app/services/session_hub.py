"""In-memory phone ↔ desktop pairing with shared chat transcript (single-process demo)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_sessions: dict[str, dict[str, Any]] = {}

WELCOME = (
    "Welcome aboard. Scan the QR on desktop to link your phone. "
    "On phone, open the rear camera — the live feed mirrors on this console. Chat stays synced."
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
            "frame_revision": 0,
            "frame": None,
            "rtc_offer": None,
            "rtc_answer": None,
            "rtc_streaming": False,
            "ice_for_phone": [],
            "ice_for_desktop": [],
            "rtc_revision": 0,
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


def put_frame(
    session_id: str,
    *,
    mime_type: str,
    data_base64: str,
    live: bool = True,
) -> dict[str, Any]:
    row = _ensure(session_id)
    if not live:
        row["frame"] = None
        row["frame_revision"] = int(row.get("frame_revision") or 0) + 1
        return {"ok": True, "frame_revision": int(row["frame_revision"]), "live": False}
    mime = (mime_type or "image/jpeg").strip().lower()
    if mime not in ("image/jpeg", "image/jpg", "image/png", "image/webp"):
        raise ValueError("Unsupported frame type.")
    data = (data_base64 or "").strip()
    if not data:
        raise ValueError("Frame data required.")
    if len(data) > 450_000:
        raise ValueError("Frame too large.")
    row["frame"] = {
        "mime_type": "image/jpeg" if mime == "image/jpg" else mime,
        "data_base64": data,
        "at": _now(),
        "live": True,
    }
    row["frame_revision"] = int(row.get("frame_revision") or 0) + 1
    row["phone_at"] = _now()
    return {"ok": True, "frame_revision": int(row["frame_revision"]), "live": True}


def rtc_signal(
    session_id: str,
    *,
    role: str,
    kind: str,
    sdp: str = "",
    candidate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if role not in ("phone", "desktop"):
        raise ValueError("Role must be phone or desktop.")
    if kind not in ("offer", "answer", "ice", "hangup"):
        raise ValueError("Unsupported signal kind.")
    row = _ensure(session_id)
    if kind == "hangup":
        row["rtc_offer"] = None
        row["rtc_answer"] = None
        row["rtc_streaming"] = False
        row["ice_for_phone"] = []
        row["ice_for_desktop"] = []
        row["rtc_revision"] = int(row.get("rtc_revision") or 0) + 1
        return rtc_state(session_id)
    if kind == "offer":
        if role != "phone":
            raise ValueError("Only phone can post an offer.")
        text = (sdp or "").strip()
        if len(text) < 20:
            raise ValueError("Offer SDP required.")
        row["rtc_offer"] = text
        row["rtc_answer"] = None
        row["ice_for_phone"] = []
        row["ice_for_desktop"] = []
        row["rtc_streaming"] = True
        row["phone_at"] = _now()
        row["rtc_revision"] = int(row.get("rtc_revision") or 0) + 1
        return rtc_state(session_id)
    if kind == "answer":
        if role != "desktop":
            raise ValueError("Only desktop can post an answer.")
        text = (sdp or "").strip()
        if len(text) < 20:
            raise ValueError("Answer SDP required.")
        row["rtc_answer"] = text
        row["desktop_at"] = _now()
        row["rtc_revision"] = int(row.get("rtc_revision") or 0) + 1
        return rtc_state(session_id)
    # ice
    if not isinstance(candidate, dict) or not candidate:
        raise ValueError("ICE candidate required.")
    bucket = "ice_for_desktop" if role == "phone" else "ice_for_phone"
    queue = list(row.get(bucket) or [])
    queue.append(candidate)
    row[bucket] = queue[-40:]
    row["rtc_revision"] = int(row.get("rtc_revision") or 0) + 1
    return rtc_state(session_id)


def rtc_state(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    row = _sessions.get(sid)
    if not row:
        return {
            "session_id": sid,
            "streaming": False,
            "has_offer": False,
            "has_answer": False,
            "offer_sdp": None,
            "answer_sdp": None,
            "rtc_revision": 0,
        }
    offer = row.get("rtc_offer")
    answer = row.get("rtc_answer")
    return {
        "session_id": sid,
        "streaming": bool(row.get("rtc_streaming") and offer),
        "has_offer": bool(offer),
        "has_answer": bool(answer),
        "offer_sdp": offer,
        "answer_sdp": answer,
        "rtc_revision": int(row.get("rtc_revision") or 0),
    }


def rtc_take_ice(session_id: str, role: str) -> list[dict[str, Any]]:
    if role not in ("phone", "desktop"):
        raise ValueError("Role must be phone or desktop.")
    row = _ensure(session_id)
    bucket = "ice_for_phone" if role == "phone" else "ice_for_desktop"
    items = list(row.get(bucket) or [])
    row[bucket] = []
    return items


def get_frame(session_id: str) -> dict[str, Any] | None:
    sid = (session_id or "").strip()
    row = _sessions.get(sid)
    if not row:
        return None
    frame = row.get("frame")
    if not isinstance(frame, dict) or not frame.get("data_base64"):
        return None
    return {
        "mime_type": frame.get("mime_type") or "image/jpeg",
        "data_base64": frame["data_base64"],
        "at": frame.get("at"),
        "live": bool(frame.get("live")),
        "frame_revision": int(row.get("frame_revision") or 0),
    }


def sync_payload(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    base = snapshot(sid)
    row = _sessions.get(sid)
    if not row:
        return {
            **base,
            "revision": 0,
            "frame_revision": 0,
            "frame_live": False,
            "frame_at": None,
            "rtc_streaming": False,
            "rtc_revision": 0,
            "turns": [],
            "events": [],
        }
    turns = [
        {"role": t["role"], "content": t["content"]}
        for t in (row.get("turns") or [])
        if isinstance(t, dict) and t.get("content")
    ]
    frame = row.get("frame") if isinstance(row.get("frame"), dict) else None
    return {
        **base,
        "revision": int(row.get("revision") or 0),
        "frame_revision": int(row.get("frame_revision") or 0),
        "frame_live": bool(frame and frame.get("live") and frame.get("data_base64")),
        "frame_at": frame.get("at") if frame else None,
        "rtc_streaming": bool(row.get("rtc_streaming") and row.get("rtc_offer")),
        "rtc_revision": int(row.get("rtc_revision") or 0),
        "turns": turns,
        "events": list(row.get("events") or []),
    }
