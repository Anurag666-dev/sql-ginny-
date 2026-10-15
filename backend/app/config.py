import os
from typing import List, Union
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "SQL Ginny"
    ENV: str = "development"
    DEBUG: bool = True
    
    # OpenRouter
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")

    # PostgreSQL Admin
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5433))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "sql_ginny_db")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres_password_123")

    # PostgreSQL Restricted User (Requirement 5)
    POSTGRES_APP_USER: str = os.getenv("POSTGRES_APP_USER", "ginny_app_user")
    POSTGRES_APP_PASSWORD: str = os.getenv("POSTGRES_APP_PASSWORD", "ginny_secure_pass_456")

    # MongoDB
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/sql_ginny_mongo")
    MONGO_DB: str = os.getenv("MONGO_DB", "sql_ginny_mongo")

    # Redis (10-minute cache TTL)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_RESULT_TTL_SECONDS: int = 600 # 10 minutes

    # Memgraph (Neo4j Bolt compatible)
    MEMGRAPH_HOST: str = os.getenv("MEMGRAPH_HOST", "localhost")
    MEMGRAPH_PORT: int = int(os.getenv("MEMGRAPH_PORT", 7687))
    MEMGRAPH_USER: str = os.getenv("MEMGRAPH_USER", "")
    MEMGRAPH_PASSWORD: str = os.getenv("MEMGRAPH_PASSWORD", "")

    # JWT Authentication
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "sql_ginny_super_secret_jwt_key_998877665544332211")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

    # CORS
    BACKEND_CORS_ORIGINS: Union[List[str], str] = "http://localhost:5173,http://localhost:5174,http://localhost:3080,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:3080"

    @property
    def cors_origins_list(self) -> List[str]:
        if isinstance(self.BACKEND_CORS_ORIGINS, list):
            return self.BACKEND_CORS_ORIGINS
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
