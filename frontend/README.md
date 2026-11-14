# ASTRA-MED frontend

React, TypeScript, and Vite with a Three.js Earth homepage and a separate crew-health workspace. Uses self-hosted fonts, locally served textures, and the existing backend API contract.

## Local development

```bash
npm ci
npm run dev
```

Requires Node.js `^20.19.0 || >=22.12.0`. Open `http://localhost:5173/` or `http://localhost:5173/dashboard.html`.

## Data configuration

- `VITE_USE_MOCK=true` is the default. Simulated check-ins and inventory are retained in this browser's local storage.
- `VITE_USE_MOCK=false` enables the FastAPI client without a silent demo fallback.
- `VITE_API_BASE_URL` defaults to `http://localhost:8000`. Set it to your backend URL at build time when hosting the frontend.

Only simulated crew data is intended for this prototype. Frontend environment variables are public build inputs; never put secrets in them. Keep local `.env` files out of Git.

## Verification and build

```bash
npm test
npm run lint
npm run build
npm run preview
```

The build includes both `index.html` and `dashboard.html`. For browser tests, install the Playwright browser with `npx playwright install chromium`, then run `npm run test:e2e`. To use an existing Chrome installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. `npm run test:e2e -- --project=homepage --headed --workers=1 --timeout=90000` runs the globe checks visibly; the longer capture allowance supports software-rendered test environments.

The globe supports drag, keyboard rotation, zoom, reset, pause/resume, reduced-motion preferences, and an image fallback when WebGL is unavailable. Mission scores and guidance in demo mode are illustrative. See [imagery credits](public/textures/CREDITS.md) and the [design review](docs/design/homepage-review.md).

Frontend contributor: [@10kash](https://github.com/10kash).

## Deploy the frontend on Render

Create a Render Blueprint from this repository's `main` branch using the root [`render.yaml`](../render.yaml). It defines the `astra-med-frontend` static site, uses Node.js 22, requires the backend URL before running `npm ci --include=dev && npm run build` from `frontend/`, and publishes `frontend/dist/`.

Both `/` and `/dashboard.html` are built as real HTML pages. No catch-all SPA rewrite is required. The existing API Blueprint remains separate at [`backend/render.yaml`](../backend/render.yaml).

The frontend Blueprint disables mock mode and uses the existing API. In the **frontend static site's** Render Environment settings, configure:

| Variable | Value |
| --- | --- |
| `VITE_USE_MOCK` | `false` |
| `VITE_API_BASE_URL` | Your existing backend's public HTTPS origin, without `/api` or `/docs` |

The Blueprint prompts for `VITE_API_BASE_URL` during initial creation. For an already-created frontend service, add the variable manually in Render Environment: `sync: false` does not prompt again on later Blueprint syncs. The build fails clearly if the variable is missing, instead of publishing an API build that falls back to localhost.

On the existing backend, include the frontend's exact public origin in the comma-separated `CORS_ORIGINS` setting and redeploy that backend configuration if needed. Then choose **Save, rebuild, and deploy** for the frontend. Vite compiles these settings into the static assets, so deploying an existing build does not apply a new API URL. No new backend or database is created by the frontend Blueprint.
