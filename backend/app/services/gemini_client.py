"""Shared Gemini generateContent helper with model fallback on 404."""

from __future__ import annotations

from typing import Any

import httpx

DEFAULT_MODEL = "gemini-3.8-flash"
FALLBACK_MODELS = ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3-flash-preview")


def generate_content(
    api_key: str,
    model: str,
    payload: dict[str, Any],
    *,
    timeout: float = 60.0,
) -> tuple[dict[str, Any], str]:
    """POST generateContent. On model 404, retry known-good Flash ids."""
    tried: list[str] = []
    candidates = [model.strip() or DEFAULT_MODEL]
    for alt in FALLBACK_MODELS:
        if alt not in candidates:
            candidates.append(alt)

    last_detail = ""
    with httpx.Client(timeout=timeout) as client:
        for name in candidates:
            if name in tried:
                continue
            tried.append(name)
            url = (
                "https://generativelanguage.googleapis.com/v1beta/"
                f"models/{name}:generateContent?key={api_key}"
            )
            response = client.post(url, json=payload)
            if response.status_code == 404 and "model" in response.text.lower():
                last_detail = response.text[:300]
                continue
            if response.status_code >= 400:
                raise RuntimeError(f"Gemini failed ({response.status_code}): {response.text[:300]}")
            return response.json(), name

    raise RuntimeError(
        f"Gemini model unavailable (tried {', '.join(tried)}). "
        f"Set GEMINI_MODEL=gemini-3.8-flash on Render. Last error: {last_detail}"
    )
