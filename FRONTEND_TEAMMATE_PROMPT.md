# ASTRA-MED — Frontend Teammate Prompt

**SCOPE: This prompt creates ONLY the React frontend (`frontend/`).**  
Do not build the Python FastAPI backend, database, NASA API clients, or risk/protocol engines. Those are owned by the backend teammate. Consume the API contract below; until the API is live, mock the same shapes locally.

Paste everything below this line into Cursor (or your AI coding tool) as the project instruction.

---

## Role

You are the **frontend engineer** for **ASTRA-MED AI** (NASA Space Apps 2026 — *Create Health Monitoring Software for Astronauts on Space Missions*).

Build the **astronaut-facing React dashboard** that gathers health indicators and lets crew **evaluate and act** on their status. The backend (FastAPI) is built by another teammate; you only own UI, client state, and API calls.

## Product framing (for copy and UX)

- Target NASA open gap **Medical-701 / Med10**: inflight computed medical decision support when Earth contact is delayed.
- Do **not** pretend to replace ultrasound, ARED hardware, dosimeters, telemedicine, or medical kits — those already exist. ASTRA-MED is the **software layer** on top.
- Simulated crew data only (no real PHI). Show a short disclaimer where medical guidance appears: guidance for exploration decision support, not a clinical diagnosis.

## What you create

Scaffold and implement:

```
frontend/          # Vite + React + TypeScript
  src/
    api/           # fetch wrappers matching the contract below
    components/
    styles/
    App.tsx
```

### Screens / sections (in order)

1. **Hero / status plane** — Brand **ASTRA-MED** as the hero signal. One status line: Nominal | Caution | Critical. One CTA group: “Log check-in” and “Open protocols”. Full-bleed atmospheric background. No card grid, stats strip, or badges overlaid on the hero.
2. **Check-in form** — HR, BP (sys/dia), SpO₂, sleep hours, mood (1–5), exercise minutes, free-text symptoms. POST to API; show success and refresh status.
3. **Domain monitors** — Radiation | Bone | Cardio | Immune | Behavioral. Each: score, short sparkline (SVG ok), one recommended action. Interaction containers only — not decorative card clutter.
4. **Space weather** — List recent SEP events from `GET /api/radiation/events` with time + link.
5. **Act / decision support** — Form for symptom assessment → show ranked guidance + protocol steps from API. Protocol checklist UI (step complete toggles can be local state).
6. **Medical inventory** — List kit items; allow simple adjust qty; flag if a protocol needs an item that is low/expired.
7. **Evidence** — OSDR / NTRS / HRR citations from `GET /api/evidence`.
8. **Footer** — SI disclosure line + “not a substitute for flight surgeon care” disclaimer.

### Design rules

- Expressive fonts (not Inter / Roboto / Arial / system defaults).
- CSS variables; mission-ops look: deep void blue, amber caution, mint nominal. Avoid purple-on-white, cream+terracotta, and generic dark-glow AI aesthetics.
- At least 2–3 intentional motions (status transition, check-in save, protocol step).
- Works on desktop and mobile.
- English UI copy (Space Apps requirement).

### Tech

- Vite + React + TypeScript
- Plain CSS (or CSS modules) with design tokens
- `VITE_API_BASE_URL` defaulting to `http://localhost:8000` locally; on **Render** set it to the public FastAPI Web Service URL at **build time**
- Hosting: frontend deploys as a **Render Static Site** (Vite build). Backend (other teammate) is a **Render Web Service**; database is **Neon Postgres** (frontend never connects to Neon directly)
- No backend / DB code in this folder

## API contract (consume; do not implement)

Base URL: `http://localhost:8000`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Overall status + domain scores + top actions |
| GET | `/api/checkins` | Check-in history |
| POST | `/api/checkins` | Create check-in |
| GET | `/api/radiation/events` | Cached DONKI SEP events |
| GET | `/api/evidence` | OSDR + NTRS + roadmap citations |
| POST | `/api/assess` | Symptom assessment → guidance + protocol |
| GET | `/api/protocols/{id}` | Protocol steps |
| GET | `/api/inventory` | Medical kit |
| POST | `/api/inventory` | Upsert inventory item |
| GET | `/api/predictions` | Rising-risk flags |

### Example shapes (match these fields)

**GET `/api/status`**
```json
{
  "overall": "caution",
  "score": 62,
  "domains": {
    "radiation": { "score": 78, "label": "Elevated SEP activity" },
    "bone": { "score": 40, "label": "Exercise below target" },
    "cardio": { "score": 35, "label": "Nominal" },
    "immune": { "score": 45, "label": "Mild symptom flags" },
    "behavioral": { "score": 55, "label": "Sleep debt" }
  },
  "actions": [
    { "priority": 1, "text": "Shelter / delay EVA during SEP window" },
    { "priority": 2, "text": "Complete 20 min resistive exercise" }
  ],
  "crew_name": "Sim Crew A",
  "mission_day": 42
}
```

**POST `/api/checkins` body**
```json
{
  "heart_rate": 72,
  "bp_sys": 118,
  "bp_dia": 76,
  "spo2": 98,
  "sleep_hours": 5.5,
  "mood": 3,
  "exercise_minutes": 15,
  "symptoms": "mild headache"
}
```

**POST `/api/assess` body**
```json
{ "symptoms": ["headache", "fatigue"], "severity": "moderate", "notes": "" }
```

**GET `/api/radiation/events` item**
```json
{
  "sepID": "2026-09-05T15:45:00-SEP-001",
  "eventTime": "2026-09-05T15:45Z",
  "instruments": ["GOES-P: SEISS >100 MeV"],
  "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/48551/-1"
}
```

Until the backend is up: keep a `src/api/mock.ts` behind a `VITE_USE_MOCK=true` flag that returns the same shapes.

## Done when

- [ ] `frontend/` runs with `npm install && npm run dev`
- [ ] All sections above render and call (or mock) the contract
- [ ] Hero reads as one branded composition
- [ ] Mobile layout usable
- [ ] README section in `frontend/README.md`: how to run + env vars
- [ ] No FastAPI / Python / DB code in this prompt’s output

## Out of scope for this prompt

Backend, Neon Postgres, Render API service config, DONKI/OSDR/NTRS fetching, risk engine, sklearn, Space Apps submission form text (team owner / backend owns).
