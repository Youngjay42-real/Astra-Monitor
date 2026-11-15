"""Grok mission assistant — text chat with live medical inventory context."""

from __future__ import annotations

import json
from typing import Any

from app.config import get_settings
from app.services.grok_client import DEFAULT_MODEL, chat_completions
from app.services.grok_observe import parse_json

SYSTEM = """You are ASTRA-MED's mission assistant (exploration demo, not clinical diagnosis).

You receive the current onboard medical inventory JSON. Reference SKUs and quantities when helpful.
If the user asks to set, add, remove, or restock an item, include inventory_updates with absolute quantities (integers >= 0).

Return ONLY JSON:
{
  "reply": "<plain-language answer, 2-8 sentences>",
  "inventory_updates": [<optional list of {"sku": string, "quantity": int} — omit if no change>]
}
"""


def mission_chat(
    message: str,
    history: list[dict[str, str]],
    inventory: list[dict[str, Any]],
) -> dict[str, Any]:
    settings = get_settings()
    api_key = (settings.xai_api_key or "").strip()
    model = (settings.grok_model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("XAI_API_KEY is not configured. Add it to backend/.env.")
    message = (message or "").strip()
    if not message:
        raise ValueError("Message is required.")

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": f"Current medical inventory JSON:\n{json.dumps(inventory, indent=2)}",
        },
    ]
    for turn in history[-8:]:
        role = turn.get("role", "user")
        text = str(turn.get("content", "")).strip()
        if not text:
            continue
        if role in ("assistant", "model"):
            messages.append({"role": "assistant", "content": text})
        else:
            messages.append({"role": "user", "content": text})
    messages.append({"role": "user", "content": message})

    text, model = chat_completions(
        api_key, model, messages, temperature=0.35, timeout=60.0, json_mode=True
    )

    raw = parse_json(text)
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
