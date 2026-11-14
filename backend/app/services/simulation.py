"""Mission simulation: NASA baseline (Earth-lag) vs ASTRA-MED autonomous path."""

from __future__ import annotations

import copy
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.models import CheckIn
from app.schemas import (
    SimulationCompare,
    SimulationDay,
    SimulationStartRequest,
    SimulationState,
    StatusOut,
)
from app.services.predictor import predict_flags
from app.services.risk_engine import compute_status


@dataclass
class _CrewState:
    heart_rate: float = 72.0
    bp_sys: float = 118.0
    bp_dia: float = 76.0
    spo2: float = 98.0
    sleep_hours: float = 7.0
    mood: int = 4
    exercise_minutes: float = 55.0
    symptoms: str = ""


@dataclass
class _SimRun:
    id: str
    scenario: str
    days_total: int
    day: int = 0
    crew: _CrewState = field(default_factory=_CrewState)
    history: list[CheckIn] = field(default_factory=list)
    days: list[SimulationDay] = field(default_factory=list)
    sep_days: set[int] = field(default_factory=set)
    astra_actions_taken: int = 0
    baseline_actions_taken: int = 0
    astra_risk_integral: float = 0.0
    baseline_risk_integral: float = 0.0
    astra_peak: float = 0.0
    baseline_peak: float = 0.0
    baseline_pending_day: int | None = None
    finished: bool = False


_RUNS: dict[str, _SimRun] = {}

# Earth light-time / scheduling lag (Mars-class demo): actions apply N days later
BASELINE_COMMS_LAG_DAYS = 2


def _scenario_sep_days(scenario: str, days_total: int) -> set[int]:
    if scenario == "quiet":
        return set()
    if scenario == "sep_storm":
        # Particle event mid-mission
        mid = max(2, days_total // 2)
        return {mid, mid + 1}
    # default: progressive stress + late SEP
    return {max(3, days_total - 2)}


def _apply_physiology(crew: _CrewState, day: int, sep_active: bool, astra_intervened: bool) -> None:
    # Microgravity-like drift without countermeasures
    if crew.exercise_minutes < 40:
        crew.bp_sys += 0.4
        crew.spo2 = max(92.0, crew.spo2 - 0.15)
    if crew.sleep_hours < 6:
        crew.mood = max(1, crew.mood - (1 if day % 2 == 0 else 0))
        crew.heart_rate += 1.2
    if sep_active:
        crew.symptoms = "headache fatigue radiation exposure concern"
        crew.heart_rate += 3.0
        crew.sleep_hours = max(3.5, crew.sleep_hours - 0.8)
        crew.mood = max(1, crew.mood - 1)
    else:
        if "radiation" in crew.symptoms:
            crew.symptoms = "mild residual fatigue"

    if astra_intervened:
        # Autonomous countermeasures kick in same day
        crew.exercise_minutes = max(crew.exercise_minutes, 50.0)
        crew.sleep_hours = min(8.0, crew.sleep_hours + 1.0)
        crew.mood = min(5, crew.mood + 1)
        crew.heart_rate = max(68.0, crew.heart_rate - 2.5)
        if sep_active:
            crew.symptoms = "sheltered; monitored post-SEP"
        else:
            crew.symptoms = ""


def _baseline_decay(crew: _CrewState, sep_active: bool, waiting: bool) -> None:
    """While waiting on Earth, risk drifts worse."""
    if waiting:
        crew.exercise_minutes = max(5.0, crew.exercise_minutes - 8.0)
        crew.sleep_hours = max(3.0, crew.sleep_hours - 0.5)
        if sep_active:
            crew.heart_rate += 2.0
            crew.spo2 = max(91.0, crew.spo2 - 0.4)


def _to_checkin(crew: _CrewState, day: int) -> CheckIn:
    return CheckIn(
        id=day,
        created_at=datetime.utcnow(),
        heart_rate=round(crew.heart_rate, 1),
        bp_sys=round(crew.bp_sys, 1),
        bp_dia=round(crew.bp_dia, 1),
        spo2=round(crew.spo2, 1),
        sleep_hours=round(crew.sleep_hours, 1),
        mood=int(crew.mood),
        exercise_minutes=round(crew.exercise_minutes, 1),
        symptoms=crew.symptoms,
    )


def _status_for(crew: _CrewState, day: int, sep_active: bool, history: list[CheckIn]) -> StatusOut:
    checkin = _to_checkin(crew, day)
    return compute_status(
        checkin,
        sep_count_7d=3 if sep_active else 0,
        recent_high_energy=sep_active,
        crew_name="Sim Crew A",
        mission_day=day,
    )


def start_simulation(req: SimulationStartRequest) -> SimulationState:
    sim_id = uuid.uuid4().hex[:12]
    run = _SimRun(
        id=sim_id,
        scenario=req.scenario,
        days_total=req.days,
        sep_days=_scenario_sep_days(req.scenario, req.days),
    )
    # Progressive underload unless intervened
    run.crew.exercise_minutes = 25.0
    run.crew.sleep_hours = 5.5
    _RUNS[sim_id] = run
    return get_state(sim_id)


def _branch_step(
    *,
    label: str,
    crew: _CrewState,
    day: int,
    sep_active: bool,
    history: list[CheckIn],
    autonomous: bool,
    pending_earth_day: int | None,
) -> tuple[SimulationDay, _CrewState, int | None, bool, float]:
    """Advance one day for a branch. Returns day row, new crew, new pending, acted, risk score."""
    crew = copy.deepcopy(crew)
    waiting = pending_earth_day is not None and day < pending_earth_day
    earth_arrives = pending_earth_day is not None and day >= pending_earth_day

    if not autonomous:
        _baseline_decay(crew, sep_active, waiting=waiting or pending_earth_day is None)

    status = _status_for(crew, day, sep_active, history)
    flags = predict_flags(
        [_to_checkin(crew, day)] + history,
        status.domains["radiation"].score,
    )
    needs_action = status.overall in ("caution", "critical") or any(
        f.level in ("rising", "high") for f in flags.flags
    )

    acted = False
    note = "Nominal monitoring day."

    if autonomous:
        if needs_action:
            _apply_physiology(crew, day, sep_active, astra_intervened=True)
            acted = True
            note = "ASTRA-MED predicted risk and applied protocol same day (Earth-independent)."
            status = _status_for(crew, day, sep_active, history)
        else:
            _apply_physiology(crew, day, sep_active, astra_intervened=False)
            note = "ASTRA-MED monitoring; no intervention required."
        pending_earth_day = None
    else:
        # NASA-like baseline: sense now, act after comms lag
        if earth_arrives:
            _apply_physiology(crew, day, sep_active, astra_intervened=True)
            acted = True
            note = f"Earth telemedicine guidance arrived (lag {BASELINE_COMMS_LAG_DAYS}d); late intervention."
            pending_earth_day = None
            status = _status_for(crew, day, sep_active, history)
        elif needs_action and pending_earth_day is None:
            pending_earth_day = day + BASELINE_COMMS_LAG_DAYS
            note = (
                f"Baseline detected concern; awaiting Earth consult "
                f"(ETA mission day {pending_earth_day})."
            )
            _baseline_decay(crew, sep_active, waiting=True)
            status = _status_for(crew, day, sep_active, history)
        else:
            if waiting:
                note = f"Baseline waiting on Earth (ETA day {pending_earth_day})."
            _apply_physiology(crew, day, sep_active, astra_intervened=False)

    day_row = SimulationDay(
        day=day,
        branch=label,  # type: ignore[arg-type]
        sep_active=sep_active,
        status=status,
        predictions=flags.flags,
        acted=acted,
        note=note,
        vitals={
            "heart_rate": crew.heart_rate,
            "spo2": crew.spo2,
            "sleep_hours": crew.sleep_hours,
            "exercise_minutes": crew.exercise_minutes,
            "mood": float(crew.mood),
        },
    )
    return day_row, crew, pending_earth_day, acted, status.score


def step_simulation(sim_id: str) -> SimulationState:
    run = _RUNS.get(sim_id)
    if not run:
        raise KeyError("simulation not found")
    if run.finished:
        return get_state(sim_id)

    run.day += 1
    day = run.day
    sep_active = day in run.sep_days

    # Dual branch: keep two crew copies evolving from shared initial — stored as
    # last astra/baseline crews in run via parallel histories encoded in days list.
    astra_crew = copy.deepcopy(run.crew)
    baseline_crew = copy.deepcopy(getattr(run, "_baseline_crew", run.crew))

    # Reconstruct crews from last day snapshots if available
    last_astra = next((d for d in reversed(run.days) if d.branch == "astra"), None)
    last_base = next((d for d in reversed(run.days) if d.branch == "baseline"), None)
    if last_astra:
        astra_crew = _CrewState(
            heart_rate=last_astra.vitals["heart_rate"],
            bp_sys=run.crew.bp_sys,
            bp_dia=run.crew.bp_dia,
            spo2=last_astra.vitals["spo2"],
            sleep_hours=last_astra.vitals["sleep_hours"],
            mood=int(last_astra.vitals["mood"]),
            exercise_minutes=last_astra.vitals["exercise_minutes"],
            symptoms="sheltered; monitored post-SEP" if last_astra.sep_active else "",
        )
    if last_base:
        baseline_crew = _CrewState(
            heart_rate=last_base.vitals["heart_rate"],
            bp_sys=run.crew.bp_sys,
            bp_dia=run.crew.bp_dia,
            spo2=last_base.vitals["spo2"],
            sleep_hours=last_base.vitals["sleep_hours"],
            mood=int(last_base.vitals["mood"]),
            exercise_minutes=last_base.vitals["exercise_minutes"],
            symptoms=last_base.note if last_base.sep_active else "",
        )

    astra_hist = [
        _to_checkin(
            _CrewState(
                heart_rate=d.vitals["heart_rate"],
                spo2=d.vitals["spo2"],
                sleep_hours=d.vitals["sleep_hours"],
                mood=int(d.vitals["mood"]),
                exercise_minutes=d.vitals["exercise_minutes"],
            ),
            d.day,
        )
        for d in run.days
        if d.branch == "astra"
    ]
    base_hist = [
        _to_checkin(
            _CrewState(
                heart_rate=d.vitals["heart_rate"],
                spo2=d.vitals["spo2"],
                sleep_hours=d.vitals["sleep_hours"],
                mood=int(d.vitals["mood"]),
                exercise_minutes=d.vitals["exercise_minutes"],
            ),
            d.day,
        )
        for d in run.days
        if d.branch == "baseline"
    ]

    a_day, astra_crew, _, a_acted, a_score = _branch_step(
        label="astra",
        crew=astra_crew,
        day=day,
        sep_active=sep_active,
        history=astra_hist,
        autonomous=True,
        pending_earth_day=None,
    )
    b_day, baseline_crew, run.baseline_pending_day, b_acted, b_score = _branch_step(
        label="baseline",
        crew=baseline_crew,
        day=day,
        sep_active=sep_active,
        history=base_hist,
        autonomous=False,
        pending_earth_day=run.baseline_pending_day,
    )

    run.days.extend([a_day, b_day])
    run.astra_risk_integral += a_score
    run.baseline_risk_integral += b_score
    run.astra_peak = max(run.astra_peak, a_score)
    run.baseline_peak = max(run.baseline_peak, b_score)
    if a_acted:
        run.astra_actions_taken += 1
    if b_acted:
        run.baseline_actions_taken += 1
    run._baseline_crew = baseline_crew  # type: ignore[attr-defined]
    run.crew = astra_crew

    if day >= run.days_total:
        run.finished = True

    return get_state(sim_id)


def run_full(sim_id: str) -> SimulationState:
    state = get_state(sim_id)
    while not state.finished:
        state = step_simulation(sim_id)
    return state


def get_state(sim_id: str) -> SimulationState:
    run = _RUNS.get(sim_id)
    if not run:
        raise KeyError("simulation not found")

    compare = None
    if run.finished and run.day > 0:
        lag_penalty = run.baseline_peak - run.astra_peak
        compare = SimulationCompare(
            astra_peak_risk=round(run.astra_peak, 1),
            baseline_peak_risk=round(run.baseline_peak, 1),
            astra_avg_risk=round(run.astra_risk_integral / run.day, 1),
            baseline_avg_risk=round(run.baseline_risk_integral / run.day, 1),
            astra_interventions=run.astra_actions_taken,
            baseline_interventions=run.baseline_actions_taken,
            risk_reduction_vs_baseline=round(max(0.0, lag_penalty), 1),
            headline=(
                "ASTRA-MED acted earlier and held peak risk lower than Earth-lag baseline"
                if run.astra_peak <= run.baseline_peak
                else "Simulation complete — review day notes for branch behavior"
            ),
        )

    return SimulationState(
        id=run.id,
        scenario=run.scenario,
        day=run.day,
        days_total=run.days_total,
        finished=run.finished,
        sep_days=sorted(run.sep_days),
        days=run.days,
        compare=compare,
    )
