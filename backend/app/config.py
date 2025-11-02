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

    # BLE Proxy
    ble_proxy_enabled: bool = False
    ble_proxy_default_timeout: int = 5
    ble_proxy_adapter: str | None = None

    # Public mode (hide proxy UI and advanced options by default)
    public_mode: bool = False

    # Optional default SFP profile via env (self-hosted convenience)
    sfp_service_uuid: str | None = None
    sfp_write_char_uuid: str | None = None
    sfp_notify_char_uuid: str | None = None

    # Path to bind-mounted env file for persistence (self-hosted)
    ble_env_path: str | None = "/app/.env"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
