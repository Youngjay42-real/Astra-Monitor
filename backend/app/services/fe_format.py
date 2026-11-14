"""Serialize backend domain objects into the frontend Zod contract."""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.models import CheckIn, InventoryItem
from app.schemas import (
    AssessOut,
    AssessRequest,
    DomainScore,
    EvidenceItem,
    EvidenceOut,
    FeAssessOut,
    FeCheckInOut,
    FeEvidenceItem,
    FeGuidanceItem,
    FeInventoryOut,
    FeInventoryUpsert,
    FePrediction,
    FeProtocolOut,
    FeProtocolStep,
    FeRequiredItem,
    FeStatusOut,
    PredictionFlag,
    PredictionsOut,
    ProtocolOut,
    RadiationEvent,
    StatusOut,
)
from app.services import protocols as protocol_service
from app.services.risk_engine import compute_status


def _iso_z(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def normalize_event_time(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if text.endswith("Z") and len(text) == 17:
        # 2026-09-05T15:45Z → add seconds
        return text[:-1] + ":00Z"
    if text.endswith("Z"):
        return text
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return _iso_z(dt)
    except ValueError:
        return text if "T" in text else f"{text}T00:00:00Z"


def format_checkin(row: CheckIn) -> FeCheckInOut:
    return FeCheckInOut(
        id=str(row.id),
        created_at=_iso_z(row.created_at),
        heart_rate=int(round(row.heart_rate)),
        bp_sys=int(round(row.bp_sys)),
        bp_dia=int(round(row.bp_dia)),
        spo2=float(row.spo2),
        sleep_hours=float(row.sleep_hours),
        mood=int(row.mood),
        exercise_minutes=int(round(row.exercise_minutes)),
        symptoms=row.symptoms or "",
    )


def format_status(status: StatusOut, checkins: list[CheckIn] | None = None) -> FeStatusOut:
    history: list[float] = []
    if checkins:
        # oldest → newest sparkline proxy from successive overall-ish cardio scores
        for c in reversed(checkins[-7:]):
            history.append(float(min(100, max(0, abs(c.heart_rate - 70) + (100 - c.spo2) * 2))))

    domains: dict[str, DomainScore] = {}
    for key, domain in status.domains.items():
        action = next(
            (a.text for a in status.actions if key in a.text.lower() or key[:4] in a.text.lower()),
            status.actions[0].text if status.actions else "Continue monitoring",
        )
        # Prefer domain-specific action snippets
        defaults = {
            "radiation": "Review radiation / SEP shelter protocol",
            "bone": "Complete resistive exercise countermeasure",
            "cardio": "Recheck vitals and open cardio watch if needed",
            "immune": "Log symptoms and review medical inventory",
            "behavioral": "Protect sleep block and behavioral recovery",
        }
        domains[key] = DomainScore(
            score=domain.score,
            label=domain.label,
            action=defaults.get(key, action),
            history=history or [domain.score, domain.score],
        )
    return FeStatusOut(
        overall=status.overall,
        score=status.score,
        domains=domains,
        actions=status.actions,
        crew_name=status.crew_name,
        mission_day=status.mission_day,
    )


def format_events(events: list[RadiationEvent]) -> list[RadiationEvent]:
    return [
        RadiationEvent(
            sepID=e.sepID,
            eventTime=normalize_event_time(e.eventTime),
            instruments=e.instruments,
            link=e.link or "https://ccmc.gsfc.nasa.gov/DONKI/",
        )
        for e in events
    ]


_ALLOWED_EVIDENCE_SOURCES = frozenset({"OSDR", "NTRS", "HRR", "NLSP"})


def format_evidence(bundle: EvidenceOut) -> list[FeEvidenceItem]:
    items: list[FeEvidenceItem] = []
    for item in bundle.items:
        source = item.source if item.source in _ALLOWED_EVIDENCE_SOURCES else "OSDR"
        description = item.description or f"{item.source} reference used to ground ASTRA-MED indicators."
        items.append(
            FeEvidenceItem(
                id=item.id,
                source=source,  # type: ignore[arg-type]
                title=item.title,
                description=description,
                url=item.url,
            )
        )
    items.append(
        FeEvidenceItem(
            id=bundle.roadmap.id,
            source="HRR",
            title=bundle.roadmap.title,
            description=bundle.roadmap.description
            or "NASA Human Research Roadmap open gap informing autonomous decision support.",
            url=bundle.roadmap.url,
        )
    )
    return items


def format_assess(raw: AssessOut) -> FeAssessOut:
    guidance = [
        FeGuidanceItem(
            rank=g.rank,
            title=g.title,
            detail=g.rationale,
            protocol_id=raw.protocol_id,
        )
        for g in raw.guidance
    ]
    return FeAssessOut(guidance=guidance, protocol_id=raw.protocol_id, disclaimer=raw.disclaimer)


def format_protocol(proto: ProtocolOut) -> FeProtocolOut:
    steps = [
        FeProtocolStep(id=f"step-{s.step}", text=s.instruction)
        for s in proto.steps
    ]
    required: list[FeRequiredItem] = []
    for s in proto.steps:
        if s.requires_sku:
            required.append(FeRequiredItem(item_id=s.requires_sku, quantity=1))
    # de-dupe skus
    seen: set[str] = set()
    unique_required: list[FeRequiredItem] = []
    for item in required:
        if item.item_id in seen:
            continue
        seen.add(item.item_id)
        unique_required.append(item)
    return FeProtocolOut(
        id=proto.id,
        title=proto.title,
        summary=(
            "Exploration decision-support checklist for deep-space crews. "
            "Not a clinical diagnosis; follow mission-approved procedures."
        ),
        steps=steps,
        required_items=unique_required,
    )


PROTOCOL_ALIASES = {
    "crew-check-in": "general-supportive",
    "radiation": "radiation-shelter",
}


def resolve_protocol(protocol_id: str) -> ProtocolOut | None:
    real_id = PROTOCOL_ALIASES.get(protocol_id, protocol_id)
    return protocol_service.get_protocol(real_id)


def format_inventory(row: InventoryItem) -> FeInventoryOut:
    low_threshold = 2
    return FeInventoryOut(
        id=row.sku,
        name=row.name,
        quantity=row.quantity,
        unit=row.unit,
        low_threshold=low_threshold,
        expires_on=row.expires_on.isoformat() if row.expires_on else None,
    )


def inventory_from_fe(body: FeInventoryUpsert) -> dict:
    expires: date | None = None
    if body.expires_on:
        expires = date.fromisoformat(body.expires_on)
    return {
        "sku": body.id,
        "name": body.name,
        "quantity": body.quantity,
        "unit": body.unit,
        "expires_on": expires,
        "notes": f"low_threshold={body.low_threshold}",
    }


def format_predictions(raw: PredictionsOut) -> list[FePrediction]:
    out: list[FePrediction] = []
    for i, flag in enumerate(raw.flags):
        out.append(
            FePrediction(
                id=f"{flag.domain}-{flag.level}-{i}",
                domain=flag.domain,  # type: ignore[arg-type]
                label=flag.message,
            )
        )
    return out
