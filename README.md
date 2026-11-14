# Astra Monitor / ASTRA-MED

Space-health exploration software with an interactive 3D Earth homepage and an astronaut-facing crew-health dashboard. The existing FastAPI backend is in `backend/`; the React application is in `frontend/`.

## Run the frontend

Use Node.js 20.19+ or 22.12+ (see `frontend/package.json`).

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173/` for the animated Earth homepage or `http://localhost:5173/dashboard.html` for the workspace.

The frontend defaults to explicitly labeled simulated data. Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` to the FastAPI service URL to use the backend. The frontend does not connect directly to the database. See the [frontend README](frontend/README.md) and [backend README](backend/README.md).

## Render configuration

The root [`render.yaml`](render.yaml) configures the frontend as a Render static site connected to your existing backend. Set `VITE_API_BASE_URL` to the backend's public HTTPS origin in the frontend service's Render environment. Mock mode is disabled, and the build requires this URL. See the [frontend deployment instructions](frontend/README.md#deploy-the-frontend-on-render). The existing [backend Blueprint](backend/render.yaml) configures the API separately.

## Contributor

Frontend contribution: [10KASH / @10kash](https://github.com/10kash).

This is an independent exploration prototype using simulated crew data, not a clinical or operational mission medical system. NASA imagery credits are included in `frontend/public/textures/CREDITS.md`.
