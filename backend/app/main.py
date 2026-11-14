import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import router
from app.config import get_settings
from app.db import get_session_factory, init_db
from app.seed import seed_inventory


def _frontend_dist() -> Path | None:
    candidates = [
        Path(os.getenv("FRONTEND_DIST", "")),
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
        Path(__file__).resolve().parents[1] / "frontend_dist",
    ]
    for path in candidates:
        if path.is_dir() and (path / "index.html").exists():
            return path
    return None


class OpenCORSMiddleware(BaseHTTPMiddleware):
    """Always allow browser frontends — ignores leftover CORS_ORIGINS env values."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": request.headers.get(
                        "access-control-request-headers", "*"
                    ),
                    "Access-Control-Max-Age": "600",
                },
            )
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        seed_inventory(db)
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(OpenCORSMiddleware)
    app.include_router(router)

    @app.get("/api")
    def api_root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "docs": "/docs",
            "health": "/api/health",
        }

    dist = _frontend_dist()
    if dist is not None:
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        def home_page() -> FileResponse:
            return FileResponse(dist / "index.html")

        @app.get("/dashboard.html")
        def dashboard_page() -> FileResponse:
            return FileResponse(dist / "dashboard.html")

        for static_name in ("favicon.svg", "icons.svg", "earth-horizon.webp"):
            file_path = dist / static_name
            if file_path.exists():

                def _serve(path: Path = file_path) -> FileResponse:
                    return FileResponse(path)

                app.add_api_route(f"/{static_name}", _serve, methods=["GET"])

        textures = dist / "textures"
        if textures.is_dir():
            app.mount("/textures", StaticFiles(directory=textures), name="textures")
    else:

        @app.get("/")
        def root() -> JSONResponse:
            return JSONResponse(
                {
                    "name": settings.app_name,
                    "docs": "/docs",
                    "health": "/api/health",
                }
            )

    return app


app = create_app()
