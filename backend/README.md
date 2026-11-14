# ASTRA-MED AI — Backend

FastAPI service for NASA Space Apps 2026: health indicators, risk evaluation, offline protocols, inventory, and NASA DONKI/OSDR/NTRS evidence.

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

See `FRONTEND_TEAMMATE_PROMPT.md` in the repo root for the contract the React app consumes.
