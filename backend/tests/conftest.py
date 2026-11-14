import os

import pytest
from fastapi.testclient import TestClient

# Force test mode before app imports resolve settings
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = ""
os.environ["CORS_ORIGINS"] = "http://localhost:5173"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("TESTING", "true")
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")

    from app.config import get_settings
    from app.db import init_db, reset_db_state

    get_settings.cache_clear()
    reset_db_state()

    # Re-import app after settings cleared
    from app.main import create_app

    application = create_app()
    init_db()
    with TestClient(application) as test_client:
        yield test_client

    reset_db_state()
