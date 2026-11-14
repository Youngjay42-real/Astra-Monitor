# ASTRA-MED — Frontend Prompt: AI Medical Officer Extension

**SCOPE: This prompt builds ONLY the React frontend (`frontend/`).**  
Do **not** rebuild the app. Do **not** replace the FastAPI backend. Do **not** add login/registration.  
Backend endpoints for Medical Officer features are owned by the backend teammate — extend `frontend/src/api/client.ts` + `schemas.ts` to consume them.

Paste everything below into Cursor with the **Astra-Monitor** repo open.

---

## Role

You are the **frontend engineer** extending **ASTRA-MED (Astra Monitor)** for NASA Space Apps 2026.

Add an **AI Medical Officer** experience on top of the existing homepage + dashboard. Inspect first, then make surgical changes.

## 0. Mandatory: inspect before coding

1. Read `frontend/README.md`, `README.md`, `render.yaml`.
2. Map existing entry points:
   - `/` → `src/App.tsx` + `EarthGlobe.tsx` (3D Earth homepage)
   - `/dashboard.html` → `src/Dashboard.tsx` (crew health workspace)
3. Map API layer: `src/api/client.ts`, `src/api/schemas.ts`, `src/api/mock.ts`, `src/hooks/useResource.ts`.
4. Map design system: `src/styles/tokens.css`, `src/styles/app.css`, `src/App.css`, `src/home.css`.
5. List what already works: status, check-in, monitors, space weather, decision support, inventory, evidence, link-state header/hero.
6. Only then implement Medical Officer UI against the contracts below.

**Do not** rewrite working components with mocks.  
**Do not** change `VITE_USE_MOCK` production default.  
**Do not** invent successful NASA database connections.

---

## 1. How the frontend is already wired (preserve this)

### Production rule: always use the backend API

```ts
// src/api/client.ts — DO NOT reverse these rules
isMock = (VITE_USE_MOCK === 'true')   // tests only; production = false
VITE_API_BASE_URL = HTTPS origin of FastAPI, NO trailing slash, NO /api suffix
// Correct:  https://astra-monitor.onrender.com
// Wrong:    https://astra-monitor.onrender.com/api
```

- Local dev: if `VITE_API_BASE_URL` unset → `http://localhost:8000`
- Production build with empty base → same-origin (`window.location.origin`)
- All requests go through `request()` + Zod `safeParse` — keep that pattern for new endpoints
- Offline / unreachable API: show honest UI (see existing `Hero` connection panel + `apiBaseUrl`). **No silent demo fallback** in production

### Render

| Service | Env |
|--------|-----|
| Frontend static | `VITE_USE_MOCK=false`, `VITE_API_BASE_URL=https://astra-monitor.onrender.com` |
| Backend API | Must allow browser CORS (`*` or exact frontend origin). Health check: `/api/health` |

After env changes: **Clear build cache & deploy** frontend (Vite bakes env at build time).

### Existing API client pattern (extend, don’t replace)

```ts
// Add new methods beside existing ones in api object:
export const api = {
  status: ...,
  checkins: ...,
  // NEW Medical Officer methods here using request(path, zodSchema, options)
}
```

Schemas live in `src/api/schemas.ts` (Zod). Every new response shape needs a schema.  
`useResource(loader)` for GET loads with loading/error/retry.

### Existing design tokens (keep)

```css
--void: #07121b;
--mint: #b5e8d0;    /* nominal */
--amber: #e8b974;   /* caution */
--critical: #f49891;
--heading: 'Space Grotesk';
--mono: 'IBM Plex Mono';
--text / --muted / --line / --surface
```

Preserve Earth globe, dark navy UI, mint/amber status language, accessibility / reduced-motion.

---

## 2. Absolute product rules

### No login / registration

Do **not** implement login, signup, passwords, OAuth screens, or auth walls.

### NASA ID (not login)

On dashboard load (or first Medical Officer open), show a **NASA ID connection** panel:

1. Astronaut enters NASA identification number.
2. Validate format client-side (document the regex; e.g. `NASA-[A-Z0-9]{4,12}` or backend-provided rules).
3. `POST` identity to backend → receive provisioned crew profile (demo profiles allowed).
4. Store session crew context in memory / `sessionStorage` (not a password login).
5. Activate AI Medical Officer with that profile.

Label demo profiles clearly: **Demonstration profile — not a live NASA medical record.**

Absence of login ≠ unrestricted PHI. Only show records the backend returns for that provisioned ID.

### Medical honesty

- Never present AI output as a confirmed diagnosis.
- Distinguish: sensor vs manual vs simulated vs AI interpretation.
- Medication: guidance only; check inventory; no independent prescribing.
- Offline: if no local LLM, use **rules-based offline assistance** and label it clearly.
- Do not claim cloud AI works offline.
- Do not claim queued alerts were “delivered” — say **queued for sync**.

---

## 3. What to build (frontend only)

### A. Persistent entry point

Add to dashboard header/nav (and optionally homepage CTA):

- **AI Medical Officer** → opens Medical Officer workspace (route section or `/dashboard.html#medical-officer`).

Do not remove Overview / Check-in / Protocols / Inventory.

### B. AI Medical Officer workspace (new section/components)

Feel like an onboard medical professional, **not** a generic chatbot.

Must support UI for:

| Capability | UI |
|------------|----|
| Conversational assistance | Thread + composer; structured replies (summary, questions, actions) |
| Health summary | Pull from existing `api.status`, check-ins, predictions |
| Symptom assessment | Extend/reuse `DecisionSupport` patterns; multi-turn follow-ups |
| Recommendations | Protocol links → existing protocol checklist |
| Emergency assistance | Dedicated emergency panel, always reachable |
| Medical history | Timeline from backend + local session notes |
| Medication assistance | Read existing inventory; show stock/expiry/warnings |
| Alerts | Severity: critical / high / moderate / info; acknowledge + escalate UI |
| Offline mode | Banner: Connected / Deep-space (offline); queue indicator |

Suggested files (adapt names to repo style):

```
frontend/src/components/medical/
  MedicalOfficer.tsx          # shell / layout
  NasaIdConnect.tsx           # ID entry (not login)
  OfficerChat.tsx             # conversation UI
  HealthSummaryCard.tsx       # uses existing status/domains
  AlertCenter.tsx
  EmergencyAssist.tsx
  SurgicalAssist.tsx          # checklist + Three.js viz optional
  OfflineSyncBanner.tsx
frontend/src/api/medicalSchemas.ts
frontend/src/lib/offlineQueue.ts
```

Wire into `Dashboard.tsx` as a new section; keep existing sections intact.

### C. Continuous monitoring UI

Extend monitors / hero to surface anomaly events from backend:

- Show measurement source badges: `sensor | manual | simulated | AI interpretation`
- Urgency + plain-language explanation + next steps
- Link into Alert Center

Reuse sparklines / domain rows where possible.

### D. Emergency module

Always accessible (header button + Medical Officer).

Flows for: severe bleeding, burns, fractures, head injury, respiratory, cardiovascular, dehydration, allergic reaction, EVA-related, loss of consciousness.

UI: select scenario → approved protocol steps → checklist → record actions locally → queue report for sync.

**Never invent procedures** — only render protocol content from API / shipped offline protocol JSON.

### E. Surgical assistance (phase later if time)

- Checklists, instrument list, risk callouts
- Optional Three.js anatomical viz (reuse Three patterns from `EarthGlobe.tsx`; keep lightweight)
- Label educational vs operational guidance

### F. Mission medical monitoring view (optional tab)

Read-only-style overview for flight surgeon / monitoring team:

- Crew overview, alerts, trends, inventory, sync status  
- No public fake NASA SSO

### G. Offline-first (frontend)

`src/lib/offlineQueue.ts`:

- Detect `navigator.onLine` + failed API fetches
- Queue: alerts, assessments, emergency logs
- Persist queue in `localStorage` / IndexedDB
- On reconnect: flush via backend sync endpoints; show sync progress
- Deep-space mode: rules-based officer replies from local protocol pack if chat API fails

Connection indicator must match reality (reuse header `linkState` live/offline/loading).

---

## 4. API contracts to consume (coordinate with backend)

Existing (already in `client.ts`) — keep using:

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET | `/api/status` |
| GET/POST | `/api/checkins` |
| GET | `/api/radiation/events` |
| GET | `/api/evidence` |
| POST | `/api/assess` |
| GET | `/api/protocols/{id}` |
| GET/POST | `/api/inventory` |
| GET | `/api/predictions` |
| GET | `/api/approach` |
| POST/GET | `/api/simulation/...` |

**New endpoints** (backend will add — define Zod schemas to match; if 404, show “awaiting backend” not fake success):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/crew/identify` | Body `{ nasa_id }` → profile + demo flag |
| GET | `/api/crew/me` | Current provisioned profile |
| GET | `/api/medical/records` | History for provisioned ID |
| POST | `/api/medical/officer/chat` | Conversational turn |
| POST | `/api/medical/anomalies` | Evaluate readings → anomalies |
| GET/POST | `/api/medical/alerts` | List / create; PATCH acknowledge |
| POST | `/api/medical/assessments` | Multi-turn symptom assessment |
| GET | `/api/medical/protocols/emergency` | Emergency protocol catalog |
| POST | `/api/medical/emergency/events` | Log emergency session |
| GET | `/api/medical/surgical/guides` | Surgical checklists |
| POST | `/api/sync/queue` | Flush offline queue |
| GET | `/api/sync/status` | Pending / last sync |

Until backend ships a route: gate the UI behind a clear “Backend endpoint pending” state; optional local demo fixtures **must** be labeled Demonstration.

### Example identify response (Zod this)

```json
{
  "nasa_id": "NASA-DEMO-001",
  "display_name": "Demo Astronaut A",
  "mission_role": "Commander",
  "demo": true,
  "allergies": ["penicillin"],
  "medications": [],
  "baseline": { "heart_rate": 68, "spo2": 98 }
}
```

### Example chat turn

```json
{
  "reply": "I will help assess your symptoms...",
  "follow_up_questions": ["When did the headache start?"],
  "urgency": "moderate",
  "protocol_ids": ["crew-check-in"],
  "disclaimer": "Exploration decision support, not a clinical diagnosis."
}
```

---

## 5. UI / UX constraints

- Preserve ASTRA-MED identity — extend, don’t redesign.
- Medical Officer: professional, calm, mission-ops — **not** bubble-chat clown UI.
- Keep mint / amber / critical semantics.
- Keyboard accessible; `prefers-reduced-motion`.
- Mobile: Medical Officer usable on narrow screens.
- Disclaimers near every AI recommendation.

---

## 6. Testing

Run:

```bash
cd frontend
npm ci
npm test
npm run build
```

Add Vitest coverage for:

- NASA ID format validation
- Offline queue enqueue / dequeue
- New Zod schemas
- Medical Officer render with demo profile

Do not break:

- Homepage globe
- Dashboard check-in / monitors / inventory / evidence
- Playwright homepage/dashboard specs (update selectors only if you intentionally change copy)

Live API: `VITE_USE_MOCK=false` + backend on `:8000` or Render URL.

---

## 7. Implementation order (frontend)

1. Inspect + short architecture note in PR description  
2. NASA ID connect panel (no login) + session crew context  
3. Medical Officer shell + nav entry + chat UI against `/api/medical/officer/chat` (or labeled demo)  
4. Alerts center + wire predictions/status anomalies  
5. Emergency assistance UI + protocol rendering  
6. Offline queue + sync banner  
7. Medication checks via existing inventory  
8. Surgical module (if time)  
9. Mission monitoring view (if time)  
10. Tests + `npm run build`

---

## 8. Done when

- [ ] No login/register anywhere  
- [ ] NASA ID connect works with demo profiles labeled  
- [ ] Medical Officer reachable from dashboard  
- [ ] Uses real `api` client (`VITE_USE_MOCK=false` in prod)  
- [ ] Existing dashboard features still work  
- [ ] Offline banner + queue honest about sync state  
- [ ] Emergency UI works without Earth (local protocols)  
- [ ] `npm test` and `npm run build` pass  
- [ ] Disclaimers visible on AI guidance  

## Out of scope for this prompt

- FastAPI / Neon / DONKI / risk engine implementation  
- Real NASA medical database access  
- Autonomous surgery / robotic control  
- Replacing Three.js Earth homepage  

---

**FINAL: Inspect first. Extend Dashboard and api/client. Preserve what works. Always call the backend API in production. No login — NASA ID provisioning only.**
