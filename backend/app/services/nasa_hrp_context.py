"""NASA HRP / NLSP grounding for exploratory Gemini observe prompts.

Uses the same public catalog language as the Evidence UI (NLSP portal, Standard Measures,
LSDA, ALSDA/OSDR) — not restricted astronaut PHI.
"""

from __future__ import annotations

from app.services.nlsp import (
    NLSP_LSDA,
    NLSP_PORTAL,
    NLSP_STANDARD_MEASURES,
    STANDARD_MEASURE_DOMAINS,
)

# Evidence-strip sources shown in the Research UI (public metadata only).
EVIDENCE_SOURCES = [
    {
        "source": "NLSP",
        "title": "NASA Life Sciences Portal",
        "detail": (
            "Human research data from spaceflight and ground-analog studies "
            "(HRP / LSDA / Lifetime Surveillance of Astronaut Health)."
        ),
        "url": NLSP_PORTAL,
    },
    {
        "source": "NLSP",
        "title": "HRP Standard Measures (ISS, HERA, NEK, :envihab)",
        "detail": (
            "Baseline physiological, psychological, and biological measures that ground "
            "ASTRA-MED domain monitors (cardio, bone, immune, behavioral)."
        ),
        "url": NLSP_STANDARD_MEASURES,
    },
    {
        "source": "NLSP",
        "title": "Life Sciences Data Archive (LSDA)",
        "detail": (
            "Catalog of spaceflight and analog human research. Restricted datasets need "
            "NLSP data request + NASA IRB — not accessed by this demo."
        ),
        "url": NLSP_LSDA,
    },
    {
        "source": "OSDR",
        "title": "ALSDA / OSDR bone & muscle unloading studies",
        "detail": (
            "Open Science Data Repository metadata for spaceflight-induced bone/muscle loss "
            "(DXA, lumbar spine, countermeasure targets) — lineage via NLSP/HRP."
        ),
        "url": "https://osdr.nasa.gov/bio/",
    },
]


def build_observe_brief() -> str:
    domain_lines = []
    for d in STANDARD_MEASURE_DOMAINS:
        domain_lines.append(
            f"- {d['astra_domain']} ← Standard Measures «{d['name']}» "
            f"({', '.join(d['platforms'])}): {d['detail']}"
        )
    domain_block = "\n".join(domain_lines)

    evidence_lines = []
    for i, src in enumerate(EVIDENCE_SOURCES, start=1):
        evidence_lines.append(
            f"{i:02d}. [{src['source']}] {src['title']} — {src['detail']} ({src['url']})"
        )
    evidence_block = "\n".join(evidence_lines)

    return f"""
You are grounded in NASA Human Research Program monitoring culture via the NASA Life
Sciences Portal (NLSP) — the same public evidence ASTRA-MED lists under Research.

Evidence catalog (public metadata only; no restricted LSDA / LSAH PHI):
{evidence_block}

Map phone-camera cues to ASTRA-MED domains using HRP Standard Measures families:
{domain_block}
- radiation: space radiation / SEP risk. Dosimetry is instrumented — never invent a dose from a photo.

Operational rules for this demo:
- Scores are exploratory attention (0–100, higher = more attention), not diagnoses.
- Prefer conservative scores when visual evidence is weak.
- Phone cameras cannot measure core temperature; only read a visible thermometer display or return null.
- Height only when a full-body standing frame allows; otherwise null.
- Sleep watch: emphasize behavioral / sleep-restlessness cues only.
- Never invent diseases, medications, or treatment plans.
- Keep observations short and console-ready.
""".strip()


# Backward-compatible alias used by older imports.
HRP_MONITORING_BRIEF = build_observe_brief()
