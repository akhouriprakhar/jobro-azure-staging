from pathlib import Path
from pydantic_settings import BaseSettings



class Settings(BaseSettings):
    APP_ENV: str = "development"
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT_NAME: str = ""
    AZURE_OPENAI_API_VERSION: str = "2024-06-01-preview"
    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_ENDPOINT: str = ""
    AZURE_SPEECH_REGION: str = ""
    AZURE_VOICELIVE_ENDPOINT: str = ""
    AZURE_VOICELIVE_KEY: str = ""
    AZURE_VOICELIVE_DEPLOYMENT_NAME: str = ""
    SHAREPOINT_TENANT_ID: str = ""
    SHAREPOINT_CLIENT_ID: str = ""
    SHAREPOINT_CLIENT_SECRET: str = ""
    SHAREPOINT_SITE_ID: str = ""
    SHAREPOINT_DRIVE_ID: str = ""
    JWT_SECRET_KEY: str = "super-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    API_VERSION: str = "v1"

    # Standard OpenAI Configuration
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_NAME: str = "gpt-4o"
    OPENAI_API_BASE: str = "https://api.openai.com/v1"

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    class Config:
        env_file = Path(__file__).resolve().parents[2] / "../../shared/configs/.env"
        env_file_encoding = "utf-8"


settings = Settings()
