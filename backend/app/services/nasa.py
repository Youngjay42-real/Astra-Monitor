"""NASA data clients with DB-backed cache for offline-capable demos.

Space-weather SEP events come from the official Open NASA API gateway
(https://api.nasa.gov/DONKI/SEP) authenticated with NASA_API_KEY.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import NasaCache
from app.schemas import EvidenceItem, EvidenceOut, RadiationEvent

DONKI_SEP = "https://api.nasa.gov/DONKI/SEP"
OSDR_SEARCH = "https://osdr.nasa.gov/osdr/data/search"
NTRS_SEARCH = "https://ntrs.nasa.gov/api/citations/search"

FALLBACK_SEP: list[dict[str, Any]] = [
    {
        "sepID": "2026-09-05T15:45:00-SEP-001",
        "eventTime": "2026-09-05T15:45Z",
        "instruments": [{"displayName": "GOES-P: SEISS >100 MeV"}],
        "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/48551/-1",
    }
]

FALLBACK_OSDR = [
    {
        "Accession": "OSD-661",
        "Study Title": "Bone microstructure and DXA measures under unloading (ALSDA)",
    }
]

FALLBACK_NTRS = [
    {
        "id": "19990041014",
        "title": "Space radiation monitoring and astronaut dose projection practices",
    }
]


def _cache_get(db: Session, key: str) -> Any | None:
    row = db.query(NasaCache).filter(NasaCache.key == key).one_or_none()
    if not row:
        return None
    ttl = get_settings().nasa_cache_ttl_seconds
    if datetime.utcnow() - row.fetched_at > timedelta(seconds=ttl):
        return None
    return json.loads(row.payload)


def _cache_set(db: Session, key: str, payload: Any) -> None:
    raw = json.dumps(payload)
    row = db.query(NasaCache).filter(NasaCache.key == key).one_or_none()
    if row:
        row.payload = raw
        row.fetched_at = datetime.utcnow()
    else:
        db.add(NasaCache(key=key, payload=raw, fetched_at=datetime.utcnow()))
    try:
        db.commit()
    except IntegrityError:
        # Concurrent first-write race on the unique key — update the winner.
        db.rollback()
        row = db.query(NasaCache).filter(NasaCache.key == key).one_or_none()
        if row:
            row.payload = raw
            row.fetched_at = datetime.utcnow()
            db.commit()


def _normalize_sep(raw: list[dict[str, Any]]) -> list[RadiationEvent]:
    events: list[RadiationEvent] = []
    for item in raw:
        instruments = item.get("instruments") or []
        names = []
        for inst in instruments:
            if isinstance(inst, dict):
                names.append(inst.get("displayName") or str(inst))
            else:
                names.append(str(inst))
        events.append(
            RadiationEvent(
                sepID=str(item.get("sepID") or item.get("eventTime") or "unknown"),
                eventTime=str(item.get("eventTime") or ""),
                instruments=names,
                link=str(item.get("link") or ""),
            )
        )
    return events


def fetch_sep_events(db: Session, *, force_refresh: bool = False) -> list[RadiationEvent]:
    if not force_refresh:
        cached = _cache_get(db, "donki_sep")
        if cached is not None:
            return _normalize_sep(cached)

    end = datetime.utcnow().date()
    # api.nasa.gov DONKI rejects windows longer than 60 days (inclusive).
    start = end - timedelta(days=30)
    settings = get_settings()
    params = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "api_key": settings.resolved_nasa_api_key(),
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(DONKI_SEP, params=params)
            resp.raise_for_status()
            data = resp.json()
            # Quiet windows are valid; seed reference SEP so demos still show structure.
            if not isinstance(data, list) or len(data) == 0:
                data = FALLBACK_SEP
    except Exception:
        cached_any = db.query(NasaCache).filter(NasaCache.key == "donki_sep").one_or_none()
        if cached_any:
            cached_payload = json.loads(cached_any.payload)
            if isinstance(cached_payload, list) and cached_payload:
                return _normalize_sep(cached_payload)
        data = FALLBACK_SEP

    _cache_set(db, "donki_sep", data)
    return _normalize_sep(data)


def sep_stats(events: list[RadiationEvent]) -> tuple[int, bool]:
    """Return (count in window, high-energy flag)."""
    high = any(
        ">100" in " ".join(e.instruments) or "100 MeV" in " ".join(e.instruments)
        for e in events
    )
    return len(events), high


def fetch_evidence(db: Session) -> EvidenceOut:
    # Bump key when NLSP/catalog shape changes so stale caches do not hide new sources.
    cache_key = "evidence_nlsp_v1"
    cached = _cache_get(db, cache_key)
    if cached is not None:
        return EvidenceOut.model_validate(cached)

    from app.services import nlsp as nlsp_service

    osdr_hits = FALLBACK_OSDR
    ntrs_hits = FALLBACK_NTRS
    try:
        with httpx.Client(timeout=25.0) as client:
            osdr = client.get(
                OSDR_SEARCH,
                params={"term": "bone loss", "type": "cgene,alsda", "from": 0, "size": 3},
            )
            if osdr.status_code == 200:
                hits = osdr.json().get("hits", {}).get("hits", [])
                parsed = []
                for h in hits:
                    src = h.get("_source", {})
                    parsed.append(
                        {
                            "Accession": src.get("Study Identifier") or src.get("Accession") or "",
                            "Study Title": src.get("Study Title") or "",
                        }
                    )
                if parsed:
                    osdr_hits = parsed

            ntrs = client.post(
                NTRS_SEARCH,
                json={"q": "astronaut radiation health monitoring", "page": {"size": 3}},
            )
            if ntrs.status_code == 200:
                results = ntrs.json().get("results", [])
                parsed_n = []
                for r in results:
                    parsed_n.append({"id": str(r.get("id") or ""), "title": r.get("title") or ""})
                if parsed_n:
                    ntrs_hits = parsed_n
    except Exception:
        pass

    items: list[EvidenceItem] = []
    seen_ids: set[str] = set()

    for raw in nlsp_service.nlsp_evidence_items(db):
        eid = str(raw["id"])
        if eid in seen_ids:
            continue
        seen_ids.add(eid)
        items.append(
            EvidenceItem(
                source=str(raw["source"]),
                id=eid,
                title=str(raw["title"]),
                url=str(raw["url"]),
                description=str(raw.get("description") or "") or None,
            )
        )

    for o in osdr_hits:
        acc = str(o.get("Accession") or "OSDR")
        if acc in seen_ids:
            continue
        seen_ids.add(acc)
        items.append(
            EvidenceItem(
                source="OSDR",
                id=acc,
                title=str(o.get("Study Title") or acc),
                url=f"https://osdr.nasa.gov/bio/repo/data/studies/{acc}",
                description="ALSDA / space-biology study metadata via NASA OSDR (NLSP life-sciences lineage).",
            )
        )
    for n in ntrs_hits:
        nid = str(n.get("id") or "")
        if not nid or nid in seen_ids:
            continue
        seen_ids.add(nid)
        items.append(
            EvidenceItem(
                source="NTRS",
                id=nid,
                title=str(n.get("title") or nid),
                url=f"https://ntrs.nasa.gov/citations/{nid}",
                description="NASA Technical Reports Server citation for radiation / crew health context.",
            )
        )

    roadmap = EvidenceItem(
        source="HRR",
        id="Medical-701",
        title="Increase inflight medical capabilities / computed decision support (Med10)",
        url="https://humanresearchroadmap.nasa.gov/Gaps/gap.aspx?i=716",
        description="NASA Human Research Roadmap open gap informing autonomous decision support.",
    )
    out = EvidenceOut(items=items, roadmap=roadmap)
    _cache_set(db, cache_key, out.model_dump())
    return out
