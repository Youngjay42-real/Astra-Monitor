"""NASA-style monitoring baseline: what already exists vs open bottlenecks.

ASTRA-MED does not replace flown hardware. It layers autonomous decision support
on top of the same indicator classes NASA already collects.
"""

from app.schemas import ApproachOut, ApproachPillar

NASA_ADVANTAGES = [
    ApproachPillar(
        title="Ultrasound & imaging",
        detail="ISS ultrasound supports organ/injury assessment without return to Earth.",
        status="existing",
    ),
    ApproachPillar(
        title="Exercise countermeasures (ARED)",
        detail="Resistive exercise reduces muscle and bone-density loss in microgravity.",
        status="existing",
    ),
    ApproachPillar(
        title="Biomedical monitoring",
        detail="Physiological measurements and health assessments feed flight surgeons.",
        status="existing",
    ),
    ApproachPillar(
        title="NLSP / HRP Standard Measures",
        detail=(
            "NASA Life Sciences Portal catalogs flight and analog Standard Measures "
            "(cardio, bone, immune, behavioral) plus LSDA/ALSDA study metadata — "
            "public catalog vs restricted PHI via data request."
        ),
        status="existing",
    ),
    ApproachPillar(
        title="Radiation detectors & dosimeters",
        detail="Hardware measures exposure and informs protection decisions.",
        status="existing",
    ),
    ApproachPillar(
        title="Spaceflight telemedicine",
        detail="Earth specialists guide diagnosis and care when communications allow.",
        status="existing",
    ),
    ApproachPillar(
        title="Medical kits",
        detail="Medications and emergency supplies support common inflight conditions.",
        status="existing",
    ),
]

NASA_BOTTLENECKS = [
    ApproachPillar(
        title="Earth-dependent decision loops",
        detail=(
            "Beyond LEO, light-time delay and blackouts break real-time telemedicine. "
            "Crew must act before Earth replies."
        ),
        status="bottleneck",
    ),
    ApproachPillar(
        title="Computed medical decision support (Med10 / Medical-701)",
        detail=(
            "NASA Human Research Roadmap still lists open need for inflight computed "
            "decision support and Earth-independent medical capability."
        ),
        status="bottleneck",
    ),
    ApproachPillar(
        title="Predictive early warning",
        detail=(
            "Monitoring often detects problems after they appear; long missions need "
            "earlier trend prediction across radiation, bone, cardio, immune, and behavior."
        ),
        status="bottleneck",
    ),
    ApproachPillar(
        title="Fragmented act pathway",
        detail=(
            "Indicators, space weather, inventory, and protocols are not always united "
            "into one crew-facing evaluate-and-act workflow."
        ),
        status="bottleneck",
    ),
]

ASTRA_IMPROVEMENTS = [
    ApproachPillar(
        title="Same indicator classes, autonomous layer",
        detail=(
            "Ingest NASA-like vitals, exercise, symptoms, and DONKI radiation context — "
            "then score risk and recommend actions without waiting on Earth."
        ),
        status="improvement",
    ),
    ApproachPillar(
        title="Predictive rising-risk flags",
        detail=(
            "Trend sleep, exercise, vitals, and SEP activity to warn before emergencies."
        ),
        status="improvement",
    ),
    ApproachPillar(
        title="Offline protocols + inventory check",
        detail=(
            "Guided procedures tied to kit stock so crew can act with limited resources."
        ),
        status="improvement",
    ),
    ApproachPillar(
        title="Evidence-linked thresholds",
        detail="Ground recommendations in NLSP Standard Measures, OSDR/ALSDA, NTRS, and HRR Medical-701.",
        status="improvement",
    ),
]


def get_approach() -> ApproachOut:
    return ApproachOut(
        summary=(
            "ASTRA-MED starts from how NASA already monitors astronaut health, maps the "
            "advantages and bottlenecks (especially Earth-dependent care and open "
            "Medical-701/Med10 gaps), then adds an autonomous evaluate–predict–act layer "
            "on top of those same indicator streams — demonstrated in mission simulation."
        ),
        nasa_advantages=NASA_ADVANTAGES,
        nasa_bottlenecks=NASA_BOTTLENECKS,
        astra_improvements=ASTRA_IMPROVEMENTS,
        method=(
            "1) Collect NASA-class indicators (vitals, exercise, symptoms, space weather). "
            "2) Score domains with an explainable risk engine. "
            "3) Predict rising risk from trends. "
            "4) Recommend protocols offline. "
            "5) Simulate baseline (Earth-lag) vs ASTRA-MED (autonomous) on the same scenario."
        ),
    )
