"""Lightweight rising-risk flags from check-in history (explainable features)."""

from __future__ import annotations

from app.models import CheckIn
from app.schemas import PredictionFlag, PredictionsOut


def predict_flags(checkins: list[CheckIn], radiation_score: float) -> PredictionsOut:
    flags: list[PredictionFlag] = []
    if not checkins:
        return PredictionsOut(flags=[])

    latest = checkins[0]
    prior = checkins[1:] if len(checkins) > 1 else []

    # Sleep debt trend
    sleep = latest.sleep_hours
    avg_prior_sleep = (
        sum(c.sleep_hours for c in prior[:5]) / min(5, len(prior)) if prior else sleep
    )
    if sleep < 6 and sleep <= avg_prior_sleep:
        flags.append(
            PredictionFlag(
                domain="behavioral",
                level="rising" if sleep < 5.5 else "watch",
                message="Sleep hours trending low — behavioral recovery risk rising",
                features={"sleep_hours": sleep, "avg_prior_sleep": round(avg_prior_sleep, 2)},
            )
        )

    # Exercise gap
    if latest.exercise_minutes < 30:
        flags.append(
            PredictionFlag(
                domain="bone",
                level="rising" if latest.exercise_minutes < 15 else "watch",
                message="Resistive exercise below microgravity countermeasure target",
                features={"exercise_minutes": latest.exercise_minutes, "target_minutes": 60.0},
            )
        )

    # Cardio drift
    if latest.heart_rate > 95 or latest.spo2 < 95:
        flags.append(
            PredictionFlag(
                domain="cardio",
                level="high" if latest.spo2 < 94 or latest.heart_rate > 110 else "rising",
                message="Vitals outside preferred exploration band",
                features={"heart_rate": latest.heart_rate, "spo2": latest.spo2},
            )
        )

    if radiation_score >= 55:
        flags.append(
            PredictionFlag(
                domain="radiation",
                level="high" if radiation_score >= 70 else "rising",
                message="Space-weather driven radiation risk elevated",
                features={"radiation_score": radiation_score},
            )
        )

    return PredictionsOut(flags=flags)
