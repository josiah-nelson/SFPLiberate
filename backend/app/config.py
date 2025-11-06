"""Application configuration with environment variable support."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore extra env vars from Docker
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

    # ESPHome Bluetooth Proxy
    esphome_proxy_mode: bool = False
    esphome_discovery_timeout: int = 10
    esphome_connection_timeout: int = 30
    esphome_scan_duration: int = 10
    # Manual proxy configuration (for Docker where mDNS doesn't work)
    esphome_proxy_host: str | None = None
    esphome_proxy_port: int = 6053
    esphome_proxy_name: str | None = None
    esphome_proxy_password: str = ""  # ESPHome API password (empty = no auth)
    # Timing configuration
    esphome_sse_interval: int = 1  # SSE device stream update interval (seconds)
    esphome_device_expiry: int = 30  # Device expiry timeout (seconds)
    esphome_cache_window: float = 2.0  # Advertisement deduplication window (seconds)
    esphome_discovery_loop_interval: int = 5  # Discovery loop interval (seconds)
    esphome_cleanup_loop_interval: int = 10  # Cleanup loop interval (seconds)

    # Public mode (hide proxy UI and advanced options by default)
    public_mode: bool = False

    # Optional default SFP profile via env (self-hosted convenience)
    sfp_service_uuid: str | None = None
    sfp_write_char_uuid: str | None = None
    sfp_notify_char_uuid: str | None = None

    # Path to bind-mounted env file for persistence (self-hosted)
    ble_env_path: str | None = "/app/.env"

    # Home Assistant Add-On Mode
    ha_addon_mode: bool = False
    ha_api_url: str = "http://supervisor/core/api"
    ha_ws_url: str = "ws://supervisor/core/websocket"
    supervisor_token: str | None = None
    device_name_patterns: list[str] = ["SFP", "Wizard"]
    auto_discover: bool = True
    connection_timeout: int = 30
    device_expiry_seconds: int = 300


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
