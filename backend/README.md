# ASTRA-MED AI — Backend

FastAPI service for NASA Space Apps 2026: astronaut health monitoring that **starts from how NASA already monitors crews**, maps **advantages and bottlenecks**, then **improves with autonomous predict-and-act** — proven in a **mission simulation** (Earth-lag baseline vs ASTRA-MED).

## How we achieve it

1. **Reuse NASA-class indicators** — vitals, exercise, symptoms, DONKI space weather, and NLSP/HRP Standard Measures domains (same families as flown / analog monitoring).
2. **Name the gaps** — Earth-dependent telemedicine lag; open HRR Medical-701 / Med10 decision support; restricted LSDA PHI (request-only).
3. **Improve with ASTRA-MED** — explainable risk scores, rising-risk prediction, offline protocols + inventory.
4. **Simulate** — `POST /api/simulation/start` → `run` compares autonomous intervention vs waiting on Earth.

## Stack

- FastAPI + SQLAlchemy
- **Neon Postgres** via `DATABASE_URL` (production / Render)
- Hosted on **Render** Web Service

## Local run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set Neon DATABASE_URL
uvicorn app.main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

## Tests

Without Neon, tests use in-memory SQLite (`TESTING=true`):

```bash
cd backend
source .venv/bin/activate
pytest -v
```

With Neon, set `DATABASE_URL` and run the same suite (omit empty override).

## API

Public JSON matches the React Zod schemas in `frontend/src/api/schemas.ts` via `app/services/fe_format.py` (string ids, ISO-Z timestamps, flat evidence/predictions arrays, protocol aliases like `crew-check-in`).

Extra endpoints for the product story (not required by the current UI): `GET /api/approach`, `GET /api/nlsp` (NASA Life Sciences Portal catalog — Standard Measures, open bedrest, ALSDA, honest access notes), `POST /api/simulation/*`.

Evidence (`GET /api/evidence`) includes **NLSP** portal / Standard Measures / LSDA citations plus OSDR, NTRS, and HRR Medical-701.
