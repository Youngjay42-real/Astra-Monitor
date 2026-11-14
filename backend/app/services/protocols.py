"""Offline medical decision-support protocols (guidance, not diagnosis)."""

from app.schemas import AssessOut, AssessRequest, GuidanceItem, ProtocolOut, ProtocolStep

DISCLAIMER = (
    "ASTRA-MED provides exploration decision-support guidance only. "
    "It is not a clinical diagnosis and does not replace a flight surgeon."
)

PROTOCOLS: dict[str, ProtocolOut] = {
    "radiation-shelter": ProtocolOut(
        id="radiation-shelter",
        title="SEP / radiation shelter response",
        steps=[
            ProtocolStep(step=1, instruction="Move crew to highest-shielding habitat zone"),
            ProtocolStep(step=2, instruction="Delay EVA and non-essential high-radiation tasks"),
            ProtocolStep(step=3, instruction="Confirm dosimeter readings and log exposure window"),
            ProtocolStep(
                step=4,
                instruction="Recheck vitals after event peak; update ASTRA-MED check-in",
            ),
        ],
    ),
    "symptom-headache": ProtocolOut(
        id="symptom-headache",
        title="Headache / fatigue assessment support",
        steps=[
            ProtocolStep(step=1, instruction="Confirm SpO2, HR, BP and hydration status"),
            ProtocolStep(step=2, instruction="Rest in low-stimulus area; limit caffeine"),
            ProtocolStep(
                step=3,
                instruction="If inventory allows, prepare analgesic per kit protocol",
                requires_sku="ANALGESIC",
            ),
            ProtocolStep(
                step=4,
                instruction="Reassess in 30–60 minutes; escalate if neurological red flags",
            ),
        ],
    ),
    "cardio-watch": ProtocolOut(
        id="cardio-watch",
        title="Cardiovascular watch",
        steps=[
            ProtocolStep(step=1, instruction="Repeat vitals after 5 minutes seated rest"),
            ProtocolStep(step=2, instruction="Note orthostatic symptoms on standing"),
            ProtocolStep(
                step=3,
                instruction="Reduce intense exercise until cleared by trend review",
            ),
            ProtocolStep(
                step=4,
                instruction="Open Earth consult if critical and comms available",
            ),
        ],
    ),
    "behavioral-recovery": ProtocolOut(
        id="behavioral-recovery",
        title="Sleep and behavioral recovery",
        steps=[
            ProtocolStep(step=1, instruction="Protect a continuous sleep opportunity block"),
            ProtocolStep(
                step=2,
                instruction="Reduce non-critical workload for one crew cycle",
            ),
            ProtocolStep(step=3, instruction="Complete private mood/sleep check-in"),
            ProtocolStep(
                step=4,
                instruction="Use behavioral support checklist; escalate if crisis indicators",
            ),
        ],
    ),
    "general-supportive": ProtocolOut(
        id="general-supportive",
        title="General supportive care",
        steps=[
            ProtocolStep(
                step=1,
                instruction="Log symptoms, onset, and severity in ASTRA-MED",
            ),
            ProtocolStep(
                step=2,
                instruction="Check medical inventory for relevant supportive items",
            ),
            ProtocolStep(
                step=3,
                instruction="Monitor vitals every 2–4 hours while symptomatic",
            ),
            ProtocolStep(
                step=4,
                instruction="Escalate via protocol tree if severity increases",
            ),
        ],
    ),
}


def get_protocol(protocol_id: str) -> ProtocolOut | None:
    return PROTOCOLS.get(protocol_id)


def assess_symptoms(req: AssessRequest) -> AssessOut:
    joined = " ".join(s.lower() for s in req.symptoms) + " " + req.notes.lower()
    guidance: list[GuidanceItem] = []
    protocol_id = "general-supportive"

    if any(k in joined for k in ("radiation", "sep", "particle", "eva")):
        guidance.append(
            GuidanceItem(
                rank=1,
                title="Radiation / SEP context",
                rationale="Symptoms coincide with radiation keywords; prioritize shelter protocol.",
            )
        )
        protocol_id = "radiation-shelter"
    if any(k in joined for k in ("headache", "migraine", "fatigue", "tired")):
        guidance.append(
            GuidanceItem(
                rank=len(guidance) + 1,
                title="Headache / fatigue pathway",
                rationale="Common inflight complaint; run supportive assessment and vitals.",
            )
        )
        if protocol_id == "general-supportive":
            protocol_id = "symptom-headache"
    if any(k in joined for k in ("chest", "palpitation", "dizzy", "orthostatic")):
        guidance.append(
            GuidanceItem(
                rank=len(guidance) + 1,
                title="Cardiovascular watch",
                rationale="Cardio-related terms warrant repeated vitals and activity modification.",
            )
        )
        protocol_id = "cardio-watch"
    if any(k in joined for k in ("sleep", "anxiety", "stress", "mood", "isolation")):
        guidance.append(
            GuidanceItem(
                rank=len(guidance) + 1,
                title="Behavioral recovery",
                rationale="Sleep/mood stress indicators map to behavioral recovery protocol.",
            )
        )
        if protocol_id == "general-supportive":
            protocol_id = "behavioral-recovery"

    if req.severity == "severe":
        guidance.insert(
            0,
            GuidanceItem(
                rank=1,
                title="Severe severity flag",
                rationale="Crew marked severe — escalate early and preserve Earth consult option.",
            ),
        )
        for i, g in enumerate(guidance, start=1):
            g.rank = i

    if not guidance:
        guidance.append(
            GuidanceItem(
                rank=1,
                title="General monitoring",
                rationale="No specific pathway matched; use supportive care and trend tracking.",
            )
        )

    return AssessOut(guidance=guidance[:5], protocol_id=protocol_id, disclaimer=DISCLAIMER)
