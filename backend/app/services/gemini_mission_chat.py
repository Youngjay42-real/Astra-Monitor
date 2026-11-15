"""Gemini mission assistant — text chat with live medical inventory context."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings
from app.services.gemini_client import DEFAULT_MODEL, generate_content
from app.services.gemini_observe import _parse_json

SYSTEM = """You are ASTRA-MED's mission assistant (exploration demo, not clinical diagnosis).

You receive the current onboard medical inventory JSON. Reference SKUs and quantities when helpful.
If the user asks to set, add, remove, or restock an item, include inventory_updates with absolute quantities (integers >= 0).

Return ONLY JSON:
{
  "reply": "<plain-language answer, 2-8 sentences>",
  "inventory_updates": [<optional list of {"sku": string, "quantity": int} — omit if no change>]
}
"""


def _inventory_lines(items: list[dict[str, Any]]) -> str:
    return json.dumps(items, indent=2)


def mission_chat(
    message: str,
    history: list[dict[str, str]],
    inventory: list[dict[str, Any]],
) -> dict[str, Any]:
    settings = get_settings()
    api_key = (settings.gemini_api_key or "").strip()
    model = (settings.gemini_model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured. Add it to backend/.env.")
    message = (message or "").strip()
    if not message:
        raise ValueError("Message is required.")

    parts: list[dict[str, Any]] = []
    for turn in history[-8:]:
        role = turn.get("role", "user")
        text = str(turn.get("content", "")).strip()
        if not text:
            continue
        if role not in ("user", "model"):
            role = "user"
        parts.append({"text": f"{role.upper()}: {text}"})
    parts.append(
        {
            "text": (
                f"{SYSTEM}\n\nINVENTORY:\n{_inventory_lines(inventory)}\n\n"
                f"USER: {message}\n\nRespond with JSON only."
            )
        }
    )

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.35, "responseMimeType": "application/json"},
    }
    body, model = generate_content(api_key, model, payload, timeout=60.0)

    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected Gemini response.") from exc

    raw = _parse_json(text)
    updates = raw.get("inventory_updates") or []
    if not isinstance(updates, list):
        updates = []
    cleaned: list[dict[str, Any]] = []
    for item in updates[:6]:
        if not isinstance(item, dict):
            continue
        sku = str(item.get("sku") or "").strip().upper()
        try:
            qty = int(item.get("quantity"))
        except (TypeError, ValueError):
            continue
        if sku and qty >= 0:
            cleaned.append({"sku": sku, "quantity": qty})

    return {
        "reply": str(raw.get("reply") or "No response.")[:2000],
        "inventory_updates": cleaned,
        "model": model,
    }