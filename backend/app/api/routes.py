from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import CheckIn, InventoryItem
from app.schemas import (
    AssessOut,
    AssessRequest,
    CheckInCreate,
    CheckInOut,
    EvidenceOut,
    InventoryOut,
    InventoryUpsert,
    PredictionsOut,
    ProtocolOut,
    RadiationEvent,
    StatusOut,
)
from app.services import nasa, predictor, protocols
from app.services.risk_engine import compute_status

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astra-med"}


@router.get("/status", response_model=StatusOut)
def status(db: Session = Depends(get_db)) -> StatusOut:
    settings = get_settings()
    latest = db.query(CheckIn).order_by(CheckIn.created_at.desc()).first()
    events = nasa.fetch_sep_events(db)
    count, high = nasa.sep_stats(events)
    return compute_status(
        latest,
        sep_count_7d=min(count, 14),
        recent_high_energy=high,
        crew_name=settings.crew_name,
        mission_day=settings.mission_day,
    )


@router.get("/checkins", response_model=list[CheckInOut])
def list_checkins(db: Session = Depends(get_db)) -> list[CheckIn]:
    return db.query(CheckIn).order_by(CheckIn.created_at.desc()).limit(100).all()


@router.post("/checkins", response_model=CheckInOut, status_code=201)
def create_checkin(body: CheckInCreate, db: Session = Depends(get_db)) -> CheckIn:
    row = CheckIn(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/radiation/events", response_model=list[RadiationEvent])
def radiation_events(db: Session = Depends(get_db)) -> list[RadiationEvent]:
    return nasa.fetch_sep_events(db)


@router.get("/evidence", response_model=EvidenceOut)
def evidence(db: Session = Depends(get_db)) -> EvidenceOut:
    return nasa.fetch_evidence(db)


@router.post("/assess", response_model=AssessOut)
def assess(body: AssessRequest) -> AssessOut:
    return protocols.assess_symptoms(body)


@router.get("/protocols/{protocol_id}", response_model=ProtocolOut)
def get_protocol(protocol_id: str) -> ProtocolOut:
    proto = protocols.get_protocol(protocol_id)
    if not proto:
        raise HTTPException(status_code=404, detail="Protocol not found")
    return proto


@router.get("/inventory", response_model=list[InventoryOut])
def list_inventory(db: Session = Depends(get_db)) -> list[InventoryOut]:
    rows = db.query(InventoryItem).order_by(InventoryItem.sku.asc()).all()
    today = date.today()
    out: list[InventoryOut] = []
    for r in rows:
        expired = bool(r.expires_on and r.expires_on < today)
        out.append(
            InventoryOut(
                id=r.id,
                sku=r.sku,
                name=r.name,
                quantity=r.quantity,
                unit=r.unit,
                expires_on=r.expires_on,
                notes=r.notes,
                low_stock=r.quantity <= 2,
                expired=expired,
            )
        )
    return out


@router.post("/inventory", response_model=InventoryOut)
def upsert_inventory(body: InventoryUpsert, db: Session = Depends(get_db)) -> InventoryOut:
    row = db.query(InventoryItem).filter(InventoryItem.sku == body.sku).one_or_none()
    if row:
        row.name = body.name
        row.quantity = body.quantity
        row.unit = body.unit
        row.expires_on = body.expires_on
        row.notes = body.notes
    else:
        row = InventoryItem(**body.model_dump())
        db.add(row)
    db.commit()
    db.refresh(row)
    today = date.today()
    return InventoryOut(
        id=row.id,
        sku=row.sku,
        name=row.name,
        quantity=row.quantity,
        unit=row.unit,
        expires_on=row.expires_on,
        notes=row.notes,
        low_stock=row.quantity <= 2,
        expired=bool(row.expires_on and row.expires_on < today),
    )


@router.get("/predictions", response_model=PredictionsOut)
def predictions(db: Session = Depends(get_db)) -> PredictionsOut:
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
    return predictor.predict_flags(checkins, status.domains["radiation"].score)
