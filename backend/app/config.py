"""Application configuration with environment variable support."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "sqlite+aiosqlite:////app/data/sfp_library.db"
    database_echo: bool = False

    # API
    api_v1_prefix: str = "/api/v1"
    project_name: str = "SFPLiberate API"
    version: str = "1.0.0"

    # CORS
    cors_origins: list[str] = ["*"]

    # Submissions
    submissions_dir: str = "/app/data/submissions"

    # Logging
    log_level: str = "INFO"
    log_json: bool = True

    # Features
    enable_community_import: bool = False
    community_index_url: str = ""


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
