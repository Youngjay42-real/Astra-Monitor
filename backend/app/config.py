from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ASTRA-MED AI"
    database_url: str = ""
    # "*" = allow any browser origin (needed when frontend is a separate Render URL).
    cors_origins: str = "*"
    testing: bool = False
    nasa_cache_ttl_seconds: int = 900
    # Open NASA APIs (DONKI SEP / space weather) — https://api.nasa.gov
    nasa_api_key: str = ""
    crew_name: str = "Sim Crew A"
    mission_day: int = 42
    # xAI Grok (observe + mission chat). Key from https://console.x.ai
    xai_api_key: str = ""
    grok_model: str = "grok-4.7"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def resolved_nasa_api_key(self) -> str:
        """Prefer the registered key; DEMO_KEY only as a last-resort explore fallback."""
        key = (self.nasa_api_key or "").strip()
        return key or "DEMO_KEY"

    def resolved_database_url(self) -> str:
        """Neon/Postgres in production; in-memory SQLite only when testing=True."""
        if self.testing and not self.database_url:
            return "sqlite+pysqlite:///:memory:"
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL is required. Set it to your Neon Postgres connection string "
                "(e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require)."
            )
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://") :]
        elif url.startswith("postgresql://") and "+psycopg" not in url:
            url = "postgresql+psycopg://" + url[len("postgresql://") :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
