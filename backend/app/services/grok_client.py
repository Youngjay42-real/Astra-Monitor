"""xAI Grok chat completions (OpenAI-compatible) with model fallback on 404."""

from __future__ import annotations

from typing import Any

import httpx

API_BASE = "https://api.x.ai/v1"
DEFAULT_MODEL = "grok-4.7"
FALLBACK_MODELS = ("grok-4.7", "grok-4", "grok-2-vision-1212")


def chat_completions(
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0.3,
    timeout: float = 60.0,
    json_mode: bool = True,
) -> tuple[str, str]:
    """POST /chat/completions. On model 404, retry known Grok ids.

    Returns (assistant_text, model_used).
    """
    tried: list[str] = []
    candidates = [model.strip() or DEFAULT_MODEL]
    for alt in FALLBACK_MODELS:
        if alt not in candidates:
            candidates.append(alt)

    last_detail = ""
    payload_base: dict[str, Any] = {
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        payload_base["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=timeout, base_url=API_BASE) as client:
        for name in candidates:
            if name in tried:
                continue
            tried.append(name)
            payload = {**payload_base, "model": name}
            response = client.post("/chat/completions", json=payload, headers=headers)
            if response.status_code == 404 and "model" in response.text.lower():
                last_detail = response.text[:300]
                continue
            if response.status_code >= 400:
                raise RuntimeError(f"Grok failed ({response.status_code}): {response.text[:300]}")
            body = response.json()
            try:
                text = body["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise RuntimeError("Unexpected Grok response.") from exc
            if not isinstance(text, str) or not text.strip():
                raise RuntimeError("Empty Grok response.")
            return text, name

    raise RuntimeError(
        f"Grok model unavailable (tried {', '.join(tried)}). "
        f"Set GROK_MODEL=grok-4.7 on Render. Last error: {last_detail}"
    )
