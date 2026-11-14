from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


OverallStatus = Literal["nominal", "caution", "critical"]


class CheckInCreate(BaseModel):
    heart_rate: float = Field(ge=30, le=220)
    bp_sys: float = Field(ge=60, le=250)
    bp_dia: float = Field(ge=30, le=150)
    spo2: float = Field(ge=70, le=100)
    sleep_hours: float = Field(ge=0, le=24)
    mood: int = Field(ge=1, le=5)
    exercise_minutes: float = Field(ge=0, le=300)
    symptoms: str = ""


class CheckInOut(CheckInCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DomainScore(BaseModel):
    score: float
    label: str


class ActionItem(BaseModel):
    priority: int
    text: str


class StatusOut(BaseModel):
    overall: OverallStatus
    score: float
    domains: dict[str, DomainScore]
    actions: list[ActionItem]
    crew_name: str
    mission_day: int


class RadiationEvent(BaseModel):
    sepID: str
    eventTime: str
    instruments: list[str]
    link: str


class EvidenceItem(BaseModel):
    source: str
    id: str
    title: str
    url: str


class EvidenceOut(BaseModel):
    items: list[EvidenceItem]
    roadmap: EvidenceItem


class AssessRequest(BaseModel):
    symptoms: list[str]
    severity: Literal["mild", "moderate", "severe"] = "moderate"
    notes: str = ""


class GuidanceItem(BaseModel):
    rank: int
    title: str
    rationale: str


class AssessOut(BaseModel):
    guidance: list[GuidanceItem]
    protocol_id: str
    disclaimer: str


class ProtocolStep(BaseModel):
    step: int
    instruction: str
    requires_sku: str | None = None


class ProtocolOut(BaseModel):
    id: str
    title: str
    steps: list[ProtocolStep]


class InventoryUpsert(BaseModel):
    sku: str
    name: str
    quantity: int = Field(ge=0)
    unit: str = "unit"
    expires_on: date | None = None
    notes: str = ""


class InventoryOut(InventoryUpsert):
    id: int
    low_stock: bool = False
    expired: bool = False

    model_config = {"from_attributes": True}


class PredictionFlag(BaseModel):
    domain: str
    level: Literal["watch", "rising", "high"]
    message: str
    features: dict[str, float]


class PredictionsOut(BaseModel):
    flags: list[PredictionFlag]
