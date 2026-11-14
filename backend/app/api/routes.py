from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import CheckIn, InventoryItem
from app.schemas import (
    ApproachOut,
    AssessRequest,
    CheckInCreate,
    FeAssessOut,
    FeCheckInOut,
    FeEvidenceItem,
    FeInventoryOut,
    FeInventoryUpsert,
    FePrediction,
    FeProtocolOut,
    FeStatusOut,
    RadiationEvent,
    SimulationStartRequest,
    SimulationState,
)
from app.services import fe_format, nasa, nasa_baseline, predictor, protocols, simulation
from app.services.risk_engine import compute_status

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astra-med"}


@router.get("/status", response_model=FeStatusOut)
def status(db: Session = Depends(get_db)) -> FeStatusOut:
    settings = get_settings()
    latest = db.query(CheckIn).order_by(CheckIn.created_at.desc()).first()
    recent = db.query(CheckIn).order_by(CheckIn.created_at.desc()).limit(7).all()
    events = nasa.fetch_sep_events(db)
    count, high = nasa.sep_stats(events)
    raw = compute_status(
        latest,
        sep_count_7d=min(count, 14),
        recent_high_energy=high,
        crew_name=settings.crew_name,
        mission_day=settings.mission_day,
    )
    return fe_format.format_status(raw, recent)


@router.get("/checkins", response_model=list[FeCheckInOut])
def list_checkins(db: Session = Depends(get_db)) -> list[FeCheckInOut]:
    rows = db.query(CheckIn).order_by(CheckIn.created_at.desc()).limit(100).all()
    return [fe_format.format_checkin(r) for r in rows]


@router.post("/checkins", response_model=FeCheckInOut, status_code=201)
def create_checkin(body: CheckInCreate, db: Session = Depends(get_db)) -> FeCheckInOut:
    row = CheckIn(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return fe_format.format_checkin(row)


@router.get("/radiation/events", response_model=list[RadiationEvent])
def radiation_events(db: Session = Depends(get_db)) -> list[RadiationEvent]:
    return fe_format.format_events(nasa.fetch_sep_events(db))


@router.get("/evidence", response_model=list[FeEvidenceItem])
def evidence(db: Session = Depends(get_db)) -> list[FeEvidenceItem]:
    return fe_format.format_evidence(nasa.fetch_evidence(db))


@router.post("/assess", response_model=FeAssessOut)
def assess(body: AssessRequest) -> FeAssessOut:
    raw = protocols.assess_symptoms(body)
    # Prefer frontend-friendly protocol aliases when applicable
    alias = {
        "general-supportive": "crew-check-in",
        "radiation-shelter": "radiation",
        "symptom-headache": "crew-check-in",
        "cardio-watch": "crew-check-in",
        "behavioral-recovery": "crew-check-in",
    }.get(raw.protocol_id, raw.protocol_id)
    raw.protocol_id = alias
    return fe_format.format_assess(raw)


@router.get("/protocols/{protocol_id}", response_model=FeProtocolOut)
def get_protocol(protocol_id: str) -> FeProtocolOut:
    proto = fe_format.resolve_protocol(protocol_id)
    if not proto:
        raise HTTPException(status_code=404, detail="Protocol not found")
    formatted = fe_format.format_protocol(proto)
    # Keep the requested id so the UI checklist key stays stable
    formatted.id = protocol_id
    return formatted


@router.get("/inventory", response_model=list[FeInventoryOut])
def list_inventory(db: Session = Depends(get_db)) -> list[FeInventoryOut]:
    rows = db.query(InventoryItem).order_by(InventoryItem.sku.asc()).all()
    return [fe_format.format_inventory(r) for r in rows]


@router.post("/inventory", response_model=FeInventoryOut)
def upsert_inventory(body: FeInventoryUpsert, db: Session = Depends(get_db)) -> FeInventoryOut:
    payload = fe_format.inventory_from_fe(body)
    row = db.query(InventoryItem).filter(InventoryItem.sku == payload["sku"]).one_or_none()
    if row:
        row.name = payload["name"]
        row.quantity = payload["quantity"]
        row.unit = payload["unit"]
        row.expires_on = payload["expires_on"]
        row.notes = payload["notes"]
    else:
        row = InventoryItem(**payload)
        db.add(row)
    db.commit()
    db.refresh(row)
    return fe_format.format_inventory(row)


@router.get("/predictions", response_model=list[FePrediction])
def predictions(db: Session = Depends(get_db)) -> list[FePrediction]:
    settings = get_settings()
    checkins = db.query(CheckIn).order_by(CheckIn.created_at.desc()).limit(14).all()
    events = nasa.fetch_sep_events(db)
    count, high = nasa.sep_stats(events)
    status = compute_status(
        checkins[0] if checkins else None,
        sep_count_7d=min(count, 14),
        recent_high_energy=high,
        crew_name=settings.crew_name,
        mission_day=settings.mission_day,
    )
    raw = predictor.predict_flags(checkins, status.domains["radiation"].score)
    return fe_format.format_predictions(raw)


@router.get("/approach", response_model=ApproachOut)
def approach() -> ApproachOut:
    return nasa_baseline.get_approach()


@router.post("/simulation/start", response_model=SimulationState)
def simulation_start(body: SimulationStartRequest) -> SimulationState:
    return simulation.start_simulation(body)


@router.post("/simulation/{sim_id}/step", response_model=SimulationState)
def simulation_step(sim_id: str) -> SimulationState:
    try:
        return simulation.step_simulation(sim_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.post("/simulation/{sim_id}/run", response_model=SimulationState)
def simulation_run(sim_id: str) -> SimulationState:
    try:
        return simulation.run_full(sim_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.get("/simulation/{sim_id}", response_model=SimulationState)
def simulation_get(sim_id: str) -> SimulationState:
    try:
        return simulation.get_state(sim_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
