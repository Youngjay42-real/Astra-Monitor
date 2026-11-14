"""Explainable multi-domain risk scoring for ASTRA-MED."""

from __future__ import annotations

from dataclasses import dataclass

from app.models import CheckIn
from app.schemas import ActionItem, DomainScore, OverallStatus, StatusOut


@dataclass
class DomainResult:
    score: float
    label: str


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def score_cardio(checkin: CheckIn | None) -> DomainResult:
    if checkin is None:
        return DomainResult(50.0, "No vitals yet")
    score = 20.0
    if checkin.heart_rate > 100 or checkin.heart_rate < 50:
        score += 35
    elif checkin.heart_rate > 90 or checkin.heart_rate < 55:
        score += 18
    if checkin.bp_sys >= 140 or checkin.bp_dia >= 90:
        score += 30
    elif checkin.bp_sys >= 130 or checkin.bp_dia >= 85:
        score += 15
    if checkin.spo2 < 94:
        score += 35
    elif checkin.spo2 < 96:
        score += 15
    label = "Nominal"
    if score >= 70:
        label = "Cardio caution — review vitals"
    elif score >= 40:
        label = "Mild cardio deviation"
    return DomainResult(_clamp(score), label)


def score_bone(checkin: CheckIn | None) -> DomainResult:
    if checkin is None:
        return DomainResult(45.0, "No exercise log yet")
    # Target ~60+ min resistive load / day for long-duration analogs
    minutes = checkin.exercise_minutes
    if minutes >= 60:
        score, label = 15.0, "Exercise target met"
    elif minutes >= 30:
        score, label = 35.0, "Partial countermeasure load"
    elif minutes >= 15:
        score, label = 55.0, "Exercise below target"
    else:
        score, label = 75.0, "Bone-loss countermeasure gap"
    return DomainResult(_clamp(score), label)


def score_behavioral(checkin: CheckIn | None) -> DomainResult:
    if checkin is None:
        return DomainResult(40.0, "No behavioral check-in")
    score = 10.0
    if checkin.sleep_hours < 5:
        score += 40
    elif checkin.sleep_hours < 6.5:
        score += 22
    if checkin.mood <= 2:
        score += 35
    elif checkin.mood == 3:
        score += 15
    label = "Nominal"
    if score >= 65:
        label = "Behavioral strain — prioritize recovery"
    elif score >= 40:
        label = "Sleep debt / mood watch"
    return DomainResult(_clamp(score), label)


def score_immune(checkin: CheckIn | None) -> DomainResult:
    if checkin is None:
        return DomainResult(30.0, "No symptom report")
    text = (checkin.symptoms or "").lower()
    flags = [
        "fever",
        "sore throat",
        "cough",
        "congestion",
        "nausea",
        "vomit",
        "diarrhea",
        "rash",
        "infection",
    ]
    hits = sum(1 for f in flags if f in text)
    score = 15.0 + hits * 18.0
    if "fatigue" in text or "tired" in text:
        score += 10
    label = "Nominal"
    if hits >= 2:
        label = "Multiple symptom flags"
    elif hits == 1:
        label = "Mild symptom flags"
    elif score >= 25:
        label = "Fatigue noted"
    return DomainResult(_clamp(score), label)


def score_radiation(sep_count_7d: int, recent_high_energy: bool) -> DomainResult:
    score = 10.0 + sep_count_7d * 12.0
    if recent_high_energy:
        score += 25
    label = "Quiet space weather"
    if score >= 70:
        label = "Elevated SEP activity"
    elif score >= 40:
        label = "Active particle environment"
    return DomainResult(_clamp(score), label)


def build_actions(domains: dict[str, DomainResult], sep_active: bool) -> list[ActionItem]:
    actions: list[ActionItem] = []
    if sep_active or domains["radiation"].score >= 60:
        actions.append(
            ActionItem(priority=1, text="Shelter / delay EVA during SEP window")
        )
    if domains["bone"].score >= 50:
        actions.append(
            ActionItem(priority=2, text="Complete 20+ min resistive exercise (ARED-class load)")
        )
    if domains["behavioral"].score >= 50:
        actions.append(
            ActionItem(priority=3, text="Protect sleep block; run behavioral check-in protocol")
        )
    if domains["cardio"].score >= 55:
        actions.append(
            ActionItem(priority=4, text="Recheck HR/BP/SpO2; open cardio watch protocol")
        )
    if domains["immune"].score >= 45:
        actions.append(
            ActionItem(priority=5, text="Log symptoms and review medical inventory for supportive care")
        )
    if not actions:
        actions.append(ActionItem(priority=1, text="Maintain nominal countermeasures and next check-in"))
    # Keep top 5, re-number by order
    actions = actions[:5]
    for i, a in enumerate(actions, start=1):
        a.priority = i
    return actions


def overall_from_domains(domains: dict[str, DomainResult]) -> tuple[OverallStatus, float]:
    weights = {
        "radiation": 0.25,
        "cardio": 0.25,
        "bone": 0.15,
        "immune": 0.15,
        "behavioral": 0.20,
    }
    score = sum(domains[k].score * w for k, w in weights.items())
    if score >= 70 or any(d.score >= 85 for d in domains.values()):
        return "critical", round(score, 1)
    if score >= 45 or any(d.score >= 60 for d in domains.values()):
        return "caution", round(score, 1)
    return "nominal", round(score, 1)


def compute_status(
    checkin: CheckIn | None,
    *,
    sep_count_7d: int,
    recent_high_energy: bool,
    crew_name: str,
    mission_day: int,
) -> StatusOut:
    domains = {
        "radiation": score_radiation(sep_count_7d, recent_high_energy),
        "bone": score_bone(checkin),
        "cardio": score_cardio(checkin),
        "immune": score_immune(checkin),
        "behavioral": score_behavioral(checkin),
    }
    overall, score = overall_from_domains(domains)
    sep_active = domains["radiation"].score >= 60
    actions = build_actions(domains, sep_active)
    return StatusOut(
        overall=overall,
        score=score,
        domains={k: DomainScore(score=v.score, label=v.label) for k, v in domains.items()},
        actions=actions,
        crew_name=crew_name,
        mission_day=mission_day,
    )
