from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ASTRA-MED AI"
    database_url: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    testing: bool = False
    nasa_cache_ttl_seconds: int = 900
    crew_name: str = "Sim Crew A"
    mission_day: int = 42

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

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
