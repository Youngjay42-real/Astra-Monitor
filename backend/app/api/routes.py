import base64
from datetime import date

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
    MissionChatOut,
    MissionChatRequest,
    ObserveScanOut,
    ObserveScanRequest,
    SessionEventRequest,
    SessionRegister,
    SessionStatus,
    SessionSyncOut,
    SessionTurnsRequest,
    RadiationEvent,
    SimulationStartRequest,
    SimulationState,
)
from app.services import (
    fe_format,
    grok_mission_chat,
    grok_observe,
    nasa,
    nasa_baseline,
    nlsp,
    predictor,
    protocols,
    session_hub,
    simulation,
)
from app.services.risk_engine import compute_status

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astra-med"}


@router.post("/session/{session_id}/register", response_model=SessionStatus)
def session_register(session_id: str, body: SessionRegister) -> SessionStatus:
    try:
        data = session_hub.register(session_id, body.device, body.mission)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionStatus.model_validate(data)


@router.get("/session/{session_id}", response_model=SessionStatus)
def session_status(session_id: str) -> SessionStatus:
    return SessionStatus.model_validate(session_hub.snapshot(session_id))


@router.get("/session/{session_id}/sync", response_model=SessionSyncOut)
def session_sync(session_id: str) -> SessionSyncOut:
    return SessionSyncOut.model_validate(session_hub.sync_payload(session_id))


@router.post("/session/{session_id}/turns", response_model=SessionSyncOut)
def session_append_turns(session_id: str, body: SessionTurnsRequest) -> SessionSyncOut:
    try:
        data = session_hub.append_turns(
            session_id,
            [{"role": t.role, "content": t.content} for t in body.turns],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionSyncOut.model_validate(data)


@router.post("/session/{session_id}/events", response_model=SessionSyncOut)
def session_append_event(session_id: str, body: SessionEventRequest) -> SessionSyncOut:
    try:
        data = session_hub.append_event(session_id, body.title, body.detail)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionSyncOut.model_validate(data)


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


@router.get("/nlsp")
def nlsp_catalog(db: Session = Depends(get_db)) -> dict:
    """NASA Life Sciences Portal catalog: Standard Measures, open bedrest, ALSDA, access notes."""
    return nlsp.get_nlsp_catalog(db)


@router.post("/observe/scan", response_model=ObserveScanOut)
def observe_scan(body: ObserveScanRequest) -> ObserveScanOut:
    frames: list[tuple[bytes, str]] = []
    for frame in body.frames:
        try:
            raw = base64.b64decode(frame.data_base64, validate=False)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid frame encoding.") from exc
        if len(raw) < 32:
            raise HTTPException(status_code=400, detail="Frame too small.")
        frames.append((raw, frame.mime_type or "image/jpeg"))
    try:
        result = grok_observe.analyze_frames(frames, mode=body.mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ObserveScanOut.model_validate(result)


def _inventory_payload(rows: list[InventoryItem]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        low = row.quantity <= 2
        expired = bool(row.expires_on and row.expires_on < date.today())
        out.append(
            {
                "sku": row.sku,
                "name": row.name,
                "quantity": row.quantity,
                "unit": row.unit,
                "expires_on": row.expires_on.isoformat() if row.expires_on else None,
                "notes": row.notes,
                "low_stock": low,
                "expired": expired,
            }
        )
    return out


@router.post("/mission-chat", response_model=MissionChatOut)
def mission_chat(body: MissionChatRequest, db: Session = Depends(get_db)) -> MissionChatOut:
    rows = db.query(InventoryItem).order_by(InventoryItem.sku.asc()).all()
    history = [
        {"role": "assistant" if turn.role == "assistant" else "user", "content": turn.content}
        for turn in body.history
    ]
    sid = (body.session_id or "").strip()
    if sid:
        try:
            session_hub.append_turns(sid, [{"role": "user", "content": body.message}])
        except ValueError:
            sid = ""
    try:
        result = grok_mission_chat.mission_chat(body.message, history, _inventory_payload(rows))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for upd in result.get("inventory_updates") or []:
        sku = str(upd.get("sku", "")).strip().upper()
        qty = int(upd.get("quantity", 0))
        row = db.query(InventoryItem).filter(InventoryItem.sku == sku).one_or_none()
        if row and qty >= 0:
            row.quantity = qty
    db.commit()
    rows = db.query(InventoryItem).order_by(InventoryItem.sku.asc()).all()
    updates = result.get("inventory_updates") or []
    reply = str(result["reply"])
    if sid:
        try:
            session_hub.append_turns(sid, [{"role": "assistant", "content": reply}])
            session_hub.append_event(sid, "Message", body.message[:80])
        except ValueError:
            pass
    return MissionChatOut(
        reply=reply,
        model=result["model"],
        inventory_updates=updates,
        inventory=[fe_format.format_inventory(r) for r in rows],
    )


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
