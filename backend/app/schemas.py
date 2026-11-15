from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


OverallStatus = Literal["nominal", "caution", "critical"]
DomainName = Literal["radiation", "bone", "cardio", "immune", "behavioral"]


class CheckInCreate(BaseModel):
    heart_rate: float = Field(ge=20, le=250)
    bp_sys: float = Field(ge=40, le=300)
    bp_dia: float = Field(ge=20, le=200)
    spo2: float = Field(ge=50, le=100)
    sleep_hours: float = Field(ge=0, le=24)
    mood: int = Field(ge=1, le=5)
    exercise_minutes: float = Field(ge=0, le=1440)
    symptoms: str = ""


class CheckInOut(CheckInCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class FeCheckInOut(BaseModel):
    id: str
    created_at: str
    heart_rate: int
    bp_sys: int
    bp_dia: int
    spo2: float
    sleep_hours: float
    mood: int
    exercise_minutes: int
    symptoms: str


class DomainScore(BaseModel):
    score: float
    label: str
    action: str | None = None
    history: list[float] | None = None


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


class FeStatusOut(BaseModel):
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
    description: str | None = None


class EvidenceOut(BaseModel):
    items: list[EvidenceItem]
    roadmap: EvidenceItem


class FeEvidenceItem(BaseModel):
    id: str
    source: Literal["OSDR", "NTRS", "HRR", "NLSP"]
    title: str
    description: str
    url: str


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


class FeGuidanceItem(BaseModel):
    rank: int
    title: str
    detail: str
    protocol_id: str


class FeAssessOut(BaseModel):
    guidance: list[FeGuidanceItem]
    protocol_id: str | None = None
    disclaimer: str | None = None


class ProtocolStep(BaseModel):
    step: int
    instruction: str
    requires_sku: str | None = None


class ProtocolOut(BaseModel):
    id: str
    title: str
    steps: list[ProtocolStep]


class FeProtocolStep(BaseModel):
    id: str
    text: str


class FeRequiredItem(BaseModel):
    item_id: str
    quantity: int = Field(ge=1)


class FeProtocolOut(BaseModel):
    id: str
    title: str
    summary: str
    steps: list[FeProtocolStep]
    required_items: list[FeRequiredItem]


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


class FeInventoryUpsert(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str
    quantity: int = Field(ge=0, le=999)
    unit: str = "unit"
    low_threshold: int = Field(default=2, ge=0, le=999)
    expires_on: str | None = None

    @field_validator("expires_on")
    @classmethod
    def _empty_to_none(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return value


class FeInventoryOut(BaseModel):
    id: str
    name: str
    quantity: int
    unit: str
    low_threshold: int
    expires_on: str | None


class PredictionFlag(BaseModel):
    domain: str
    level: Literal["watch", "rising", "high"]
    message: str
    features: dict[str, float]


class PredictionsOut(BaseModel):
    flags: list[PredictionFlag]


class FePrediction(BaseModel):
    id: str
    domain: DomainName
    label: str


class ApproachPillar(BaseModel):
    title: str
    detail: str
    status: Literal["existing", "bottleneck", "improvement"]


class ApproachOut(BaseModel):
    summary: str
    method: str
    nasa_advantages: list[ApproachPillar]
    nasa_bottlenecks: list[ApproachPillar]
    astra_improvements: list[ApproachPillar]


class SimulationStartRequest(BaseModel):
    days: int = Field(default=7, ge=3, le=21)
    scenario: Literal["progressive", "sep_storm", "quiet"] = "sep_storm"


class SimulationDay(BaseModel):
    day: int
    branch: Literal["astra", "baseline"]
    sep_active: bool
    status: StatusOut
    predictions: list[PredictionFlag]
    acted: bool
    note: str
    vitals: dict[str, float]


class SimulationCompare(BaseModel):
    astra_peak_risk: float
    baseline_peak_risk: float
    astra_avg_risk: float
    baseline_avg_risk: float
    astra_interventions: int
    baseline_interventions: int
    risk_reduction_vs_baseline: float
    headline: str


class SimulationState(BaseModel):
    id: str
    scenario: str
    day: int
    days_total: int
    finished: bool
    sep_days: list[int]
    days: list[SimulationDay]
    compare: SimulationCompare | None = None


class ObserveFrame(BaseModel):
    mime_type: str = Field(default="image/jpeg", max_length=64)
    data_base64: str = Field(min_length=8, max_length=8_000_000)


class ObserveScanRequest(BaseModel):
    frames: list[ObserveFrame] = Field(min_length=1, max_length=3)
    mode: Literal["assess", "sleep"] = "assess"


class ObserveDomainAttention(BaseModel):
    radiation: int = Field(ge=0, le=100)
    bone: int = Field(ge=0, le=100)
    cardio: int = Field(ge=0, le=100)
    immune: int = Field(ge=0, le=100)
    behavioral: int = Field(ge=0, le=100)


class ObserveScanOut(BaseModel):
    mode: Literal["assess", "sleep"] = "assess"
    condition: str
    wellness_score: int = Field(ge=0, le=100)
    height_cm: float | None = None
    temperature_c: float | None = None
    temperature_note: str = ""
    sleep_note: str = ""
    observations: list[str]
    domain_attention: ObserveDomainAttention
    disclaimer: str
    model: str


class MissionChatTurn(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(min_length=1, max_length=4000)


class MissionChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[MissionChatTurn] = Field(default_factory=list, max_length=20)
    session_id: str = Field(default="", max_length=100)


class MissionInventoryUpdate(BaseModel):
    sku: str
    quantity: int = Field(ge=0)


class MissionChatOut(BaseModel):
    reply: str
    model: str
    inventory_updates: list[MissionInventoryUpdate] = Field(default_factory=list)
    inventory: list[FeInventoryOut] = Field(default_factory=list)


class SessionRegister(BaseModel):
    device: Literal["phone", "desktop"]
    mission: str = Field(default="", max_length=64)


class SessionStatus(BaseModel):
    session_id: str
    found: bool = False
    phone_connected: bool = False
    desktop_connected: bool = False
    mission: str = ""
    phone_at: str | None = None
    desktop_at: str | None = None


class SessionTurnIn(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(min_length=1, max_length=4000)


class SessionTurnsRequest(BaseModel):
    turns: list[SessionTurnIn] = Field(min_length=1, max_length=20)


class SessionEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    detail: str = Field(default="", max_length=500)


class SessionSyncOut(BaseModel):
    session_id: str
    found: bool = False
    phone_connected: bool = False
    desktop_connected: bool = False
    mission: str = ""
    phone_at: str | None = None
    desktop_at: str | None = None
    revision: int = 0
    frame_revision: int = 0
    frame_live: bool = False
    frame_at: str | None = None
    rtc_streaming: bool = False
    rtc_revision: int = 0
    turns: list[MissionChatTurn] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)


class SessionFrameIn(BaseModel):
    mime_type: str = Field(default="image/jpeg", max_length=40)
    data_base64: str = Field(default="", max_length=450_000)
    live: bool = True


class SessionFrameOut(BaseModel):
    mime_type: str = "image/jpeg"
    data_base64: str
    at: str | None = None
    live: bool = True
    frame_revision: int = 0


class SessionFrameAck(BaseModel):
    ok: bool = True
    frame_revision: int = 0
    live: bool = True


class SessionRtcSignalIn(BaseModel):
    role: Literal["phone", "desktop"]
    kind: Literal["offer", "answer", "ice", "hangup"]
    sdp: str = Field(default="", max_length=200_000)
    candidate: dict | None = None


class SessionRtcStateOut(BaseModel):
    session_id: str
    streaming: bool = False
    has_offer: bool = False
    has_answer: bool = False
    offer_sdp: str | None = None
    answer_sdp: str | None = None
    rtc_revision: int = 0


class SessionRtcIceOut(BaseModel):
    candidates: list[dict] = Field(default_factory=list)
