import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    oriane_key: str = field(repr=False)
    oriane_search_url: str
    openai_key: str = field(repr=False)
    openai_model: str
    allowed_origins: list[str]

    @classmethod
    def from_env(cls) -> "Settings":
        origins = ["http://localhost:3000"]
        origins.extend(
            origin.strip().rstrip("/")
            for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
            if origin.strip()
        )
        return cls(
            oriane_key=os.getenv("ORIANE_API_KEY", ""),
            oriane_search_url=os.getenv("ORIANE_SEARCH_URL", "https://connect.oriane.xyz/rest/contents/search"),
            openai_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("OPENAI_MODEL", ""),
            allowed_origins=origins,
        )
