"""NASA Life Sciences Portal (NLSP) integration.

Portal: https://www.nasa.gov/hrp/nlsp/

Honest access model:
- Public: portal pages, Standard Measures descriptions, UTMB open-access bedrest campaigns,
  and ALSDA/OSDR study metadata (already queried via OSDR search).
- Restricted: identifiable / astronaut PHI in LSDA and Lifetime Surveillance of Astronaut
  Health require formal NLSP data requests + NASA IRB — we never fabricate that access.
"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.services import nasa as nasa_service

NLSP_PORTAL = "https://www.nasa.gov/hrp/nlsp/"
NLSP_LSDA = "https://nlsp.nasa.gov/explore/lsdahome"
NLSP_STANDARD_MEASURES = "https://nlsp.nasa.gov/resources/standard-measures"
NLSP_DATA_REQUEST = "https://nlsp.nasa.gov/data-request-guidelines"
OSDR_SEARCH = "https://osdr.nasa.gov/osdr/data/search"

# Core Standard Measures domains used to ground ASTRA-MED indicators
STANDARD_MEASURE_DOMAINS = [
    {
        "id": "behavioral",
        "name": "Behavioral health and performance",
        "platforms": ["ISS", "HERA", "NEK", ":envihab"],
        "astra_domain": "behavioral",
        "detail": "Sleep, mood, isolation/confinement stress indicators from Standard Measures.",
    },
    {
        "id": "cardiovascular",
        "name": "Cardiovascular",
        "platforms": ["ISS", ":envihab"],
        "astra_domain": "cardio",
        "detail": "Heart rate, blood pressure, orthostatic and cardiovascular physiology measures.",
    },
    {
        "id": "bone",
        "name": "Bone mineral density / muscle physiology",
        "platforms": [":envihab"],
        "astra_domain": "bone",
        "detail": "Bedrest and unloading analogs for bone and muscle loss countermeasure tracking.",
    },
    {
        "id": "immunology",
        "name": "Cellular profile / immunology",
        "platforms": ["ISS", ":envihab"],
        "astra_domain": "immune",
        "detail": "Immune and biochemistry markers used in flight and analog Standard Measures.",
    },
    {
        "id": "biochemistry",
        "name": "Biochemistry",
        "platforms": ["ISS", "HERA", "NEK", ":envihab"],
        "astra_domain": "immune",
        "detail": "Core biochemistry panels (e.g. cortisol-related behavioral stress context).",
    },
    {
        "id": "sensorimotor",
        "name": "Sensorimotor",
        "platforms": ["ISS", ":envihab"],
        "astra_domain": "behavioral",
        "detail": "Sensorimotor and neurological outcomes under microgravity analogs.",
    },
]

OPEN_ACCESS_BEDREST = [
    {
        "id": "utmb-campaign-1",
        "title": "UTMB Bedrest Campaign 1",
        "detail": "Head-down-tilt bedrest analog simulating microgravity fluid shifts.",
        "url": "https://www.nasa.gov/hrp/nlsp/",
        "access": "open_catalog",
    },
    {
        "id": "utmb-campaign-3",
        "title": "UTMB Bedrest Campaign 3",
        "detail": "Extended bedrest studies covering bone, cardiovascular, and neurology outcomes.",
        "url": "https://www.nasa.gov/hrp/nlsp/",
        "access": "open_catalog",
    },
    {
        "id": "utmb-70-day",
        "title": "UTMB 70-Day Bedrest Exercise and Performance Testing",
        "detail": "Campaign 11: task performance and exercise countermeasures during 70-day HDT bedrest.",
        "url": "https://www.nasa.gov/hrp/nlsp/",
        "access": "open_catalog",
    },
]


def _search_alsda(term: str, size: int = 4) -> list[dict[str, str]]:
    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.get(
                OSDR_SEARCH,
                params={"term": term, "type": "cgene,alsda", "from": 0, "size": size},
            )
            if resp.status_code != 200:
                return []
            hits = resp.json().get("hits", {}).get("hits", [])
            out: list[dict[str, str]] = []
            for h in hits:
                src = h.get("_source", {})
                acc = str(src.get("Study Identifier") or src.get("Accession") or "")
                if not acc:
                    continue
                out.append(
                    {
                        "accession": acc,
                        "title": str(src.get("Study Title") or acc)[:200],
                        "url": f"https://osdr.nasa.gov/bio/repo/data/studies/{acc}",
                    }
                )
            return out
    except Exception:
        return []


def get_nlsp_catalog(db: Session) -> dict[str, Any]:
    """Cached NLSP-oriented catalog for ASTRA-MED evidence and Medical Officer grounding."""
    cached = nasa_service._cache_get(db, "nlsp_catalog")
    if cached is not None:
        return cached

    alsda_cardio = _search_alsda("ALSDA cardiovascular", 3)
    alsda_bone = _search_alsda("ALSDA bone loss", 3)
    alsda_immune = _search_alsda("ALSDA immune", 3)

    catalog = {
        "portal": {
            "name": "NASA Life Sciences Portal",
            "url": NLSP_PORTAL,
            "summary": (
                "Human research data from spaceflight and ground-analog studies (HRP / LSDA / "
                "Lifetime Surveillance of Astronaut Health and related resources)."
            ),
        },
        "access": {
            "public": [
                "NLSP portal pages and Standard Measures documentation",
                "UTMB open-access bedrest campaign descriptions",
                "ALSDA study metadata via NASA OSDR search API",
            ],
            "restricted": [
                "De-identified or attributable astronaut / analog subject datasets in LSDA",
                "Lifetime Surveillance of Astronaut Health medical monitoring extracts",
            ],
            "request_url": NLSP_DATA_REQUEST,
            "note": (
                "ASTRA-MED uses public NLSP/OSDR metadata and published measure definitions. "
                "It does not claim live access to restricted astronaut PHI."
            ),
        },
        "standard_measures": {
            "url": NLSP_STANDARD_MEASURES,
            "explore_url": "https://nlsp.nasa.gov/explore/home/lsda_sm",
            "domains": STANDARD_MEASURE_DOMAINS,
        },
        "open_access_bedrest": OPEN_ACCESS_BEDREST,
        "lsda": {
            "url": NLSP_LSDA,
            "detail": "Life Sciences Data Archive catalog of flight and analog investigations.",
        },
        "alsda_studies": {
            "cardiovascular": alsda_cardio,
            "bone": alsda_bone,
            "immune": alsda_immune,
        },
    }
    nasa_service._cache_set(db, "nlsp_catalog", catalog)
    return catalog


def nlsp_evidence_items(db: Session) -> list[dict[str, str]]:
    """Flatten NLSP sources into evidence-style records for the Evidence UI."""
    catalog = get_nlsp_catalog(db)
    items: list[dict[str, str]] = [
        {
            "id": "nlsp-portal",
            "source": "NLSP",
            "title": "NASA Life Sciences Portal",
            "description": catalog["portal"]["summary"],
            "url": NLSP_PORTAL,
        },
        {
            "id": "nlsp-standard-measures",
            "source": "NLSP",
            "title": "HRP Standard Measures (ISS, HERA, NEK, :envihab)",
            "description": (
                "Baseline physiological, psychological, and biological measures that ground "
                "ASTRA-MED domain monitors (cardio, bone, immune, behavioral)."
            ),
            "url": NLSP_STANDARD_MEASURES,
        },
        {
            "id": "nlsp-lsda",
            "source": "NLSP",
            "title": "Life Sciences Data Archive (LSDA)",
            "description": (
                "Catalog of spaceflight and analog human research. Restricted datasets require "
                "NLSP data request + NASA IRB — not accessed directly by this demo."
            ),
            "url": NLSP_LSDA,
        },
    ]
    for study in catalog["alsda_studies"].get("bone", [])[:2]:
        items.append(
            {
                "id": study["accession"],
                "source": "OSDR",
                "title": study["title"],
                "description": "ALSDA study metadata via OSDR (NLSP/HRP life sciences lineage).",
                "url": study["url"],
            }
        )
    return items
