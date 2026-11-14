import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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

    origins = settings.cors_origin_list
    # Hackathon/default: open CORS so a separate Render static site can call the API.
    allow_all = not origins or origins == ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )
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

        # Public textures / favicon from Vite public/
        for name in ("favicon.svg", "icons.svg", "earth-horizon.webp"):
            file_path = dist / name
            if file_path.exists():

                def _make_file_route(path: Path):
                    def _serve() -> FileResponse:
                        return FileResponse(path)

                    return _serve

                app.add_api_route(f"/{name}", _make_file_route(file_path), methods=["GET"])

        textures = dist / "textures"
        if textures.is_dir():
            app.mount("/textures", StaticFiles(directory=textures), name="textures")
    else:

        @app.get("/")
        def root() -> dict[str, str]:
            return {
                "name": settings.app_name,
                "docs": "/docs",
                "health": "/api/health",
            }

    return app


app = create_app()
