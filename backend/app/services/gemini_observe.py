"""Gemini multimodal observe — frames + NASA HRP context → short health assessment."""

from __future__ import annotations

import base64
import json
import re
from typing import Any, Literal

import httpx

from app.config import get_settings
from app.services.nasa_hrp_context import build_observe_brief

DEFAULT_MODEL = "gemini-3.5-flash"
Mode = Literal["assess", "sleep"]


def _prompt(mode: Mode) -> str:
    focus = (
        "SLEEP WATCH: crew may be resting. Note stillness, restlessness, face visibility, "
        "and behavioral-domain cues only (Standard Measures behavioral health & performance)."
        if mode == "sleep"
        else "STANDING ASSESS: estimate height if full-body; note wellness / fatigue cues "
        "against Standard Measures cardio / bone / immune / behavioral families."
    )
    return f"""You are ASTRA-MED's exploratory crew observe assistant (NASA Space Apps demo).

{build_observe_brief()}

Mode: {mode}. {focus}

Return ONLY JSON:
{{
  "condition": <short phrase of how the crew appears>,
  "wellness_score": <0-100 higher=more attention>,
  "height_cm": <number or null>,
  "temperature_c": <number or null — thermometer readout if visible, else null; never invent fever>,
  "temperature_note": <short string>,
  "sleep_note": <short string; required for sleep mode, else optional>,
  "observations": [<up to 4 short strings>],
  "domain_attention": {{
    "radiation": <0-100>, "bone": <0-100>, "cardio": <0-100>,
    "immune": <0-100>, "behavioral": <0-100>
  }},
  "disclaimer": "Exploratory demo only — not clinical measurement or diagnosis."
}}
"""


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _clamp(v: Any, default: int = 40) -> int:
    try:
        return max(0, min(100, int(v)))
    except (TypeError, ValueError):
        return default


def analyze_frames(frames: list[tuple[bytes, str]], mode: Mode = "assess") -> dict[str, Any]:
    settings = get_settings()
    api_key = (settings.gemini_api_key or "").strip()
    model = (settings.gemini_model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured. Add it to backend/.env.")
    if not frames:
        raise ValueError("At least one frame is required.")

    parts: list[dict[str, Any]] = [{"text": _prompt(mode)}]
    for data, mime in frames[:3]:
        parts.append(
            {
                "inline_data": {
                    "mime_type": mime or "image/jpeg",
                    "data": base64.b64encode(data).decode("ascii"),
                }
            }
        )

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.25, "responseMimeType": "application/json"},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    with httpx.Client(timeout=45.0) as client:
        response = client.post(url, json=payload)
        if response.status_code >= 400:
            raise RuntimeError(f"Gemini failed ({response.status_code}): {response.text[:300]}")
        body = response.json()

    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected Gemini response.") from exc

    raw = _parse_json(text)
    domains = raw.get("domain_attention") or {}
    height = raw.get("height_cm")
    try:
        height_cm = float(height) if height is not None else None
    except (TypeError, ValueError):
        height_cm = None
    if height_cm is not None and not (90 <= height_cm <= 230):
        height_cm = None

    temp = raw.get("temperature_c")
    try:
        temperature_c = float(temp) if temp is not None else None
    except (TypeError, ValueError):
        temperature_c = None
    if temperature_c is not None and not (30 <= temperature_c <= 45):
        temperature_c = None

    observations = raw.get("observations") or []
    if not isinstance(observations, list):
        observations = [str(observations)]
    observations = [str(o).strip()[:200] for o in observations if str(o).strip()][:4]

    return {
        "mode": mode,
        "condition": str(raw.get("condition") or "Exploratory observation")[:160],
        "wellness_score": _clamp(raw.get("wellness_score"), 45),
        "height_cm": height_cm,
        "temperature_c": temperature_c,
        "temperature_note": str(raw.get("temperature_note") or "No thermometer visible; phone cannot measure core temp.")[:240],
        "sleep_note": str(raw.get("sleep_note") or ("Sleep-watch pass complete." if mode == "sleep" else ""))[:240],
        "observations": observations,
        "domain_attention": {
            "radiation": _clamp(domains.get("radiation"), 20),
            "bone": _clamp(domains.get("bone"), 35),
            "cardio": _clamp(domains.get("cardio"), 40),
            "immune": _clamp(domains.get("immune"), 35),
            "behavioral": _clamp(domains.get("behavioral"), 45),
        },
        "disclaimer": str(
            raw.get("disclaimer") or "Exploratory demo only — not clinical measurement or diagnosis."
        )[:300],
        "model": model,
    }
