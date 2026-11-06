import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    oriane_key: str = field(repr=False)
    oriane_search_url: str
    gmi_key: str = field(repr=False)
    gmi_base_url: str
    gmi_models: tuple[str, ...]
    jev_key: str = field(repr=False)
    jev_base_url: str
    jev_model: str
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
            oriane_search_url=os.getenv("ORIANE_SEARCH_URL", ""),
            gmi_key=os.getenv("GMI_API_KEY", ""),
            gmi_base_url=os.getenv("GMI_BASE_URL", "https://api.gmi-serving.com/v1").rstrip("/"),
            gmi_models=tuple(
                os.getenv(name, "")
                for name in ("GMI_LLM_MODEL", "GMI_LLM_FAST_MODEL", "GMI_VLM_MODEL")
            ),
            jev_key=os.getenv("JEV_API_KEY", ""),
            jev_base_url=os.getenv("JEV_BASE_URL", "https://inference.do-ai.run").rstrip("/"),
            jev_model=os.getenv("JEV_MODEL", "typesafe-jev-1.13.0"),
            allowed_origins=origins,
        )
