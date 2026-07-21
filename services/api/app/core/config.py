from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://hackathon:changeme@localhost:5432/hackathon"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # OPA
    opa_url: str = "http://localhost:8181"

    # JWT
    jwt_secret_key: str = "dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # App
    first_admin_email: str = "admin@example.com"
    first_admin_password: str = "changeme"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    google_oauth_client_id: str = ""
    # Accepted for deployment compatibility only. Desktop PKCE never uses it.
    google_oauth_client_secret: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
