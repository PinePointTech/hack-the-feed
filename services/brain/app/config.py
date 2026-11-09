import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    oriane_key: str = field(repr=False)
    oriane_search_url: str
    openai_key: str = field(repr=False)
    openai_model: str
    allowed_origins: list[str]
    openai_base_url: str = "https://api.openai.com/v1"
    gmi_key: str = field(default="", repr=False)
    gmi_base_url: str = "https://api.gmi-serving.com/v1"
    poll_interval_minutes: int = 15
    oriane_max_searches_per_hour: int = 20
    label_min_views: int = 10000
    label_max_per_hour: int = 200
    review_token: str = field(default="", repr=False)

    @property
    def chat_model(self) -> str:
        """OPENAI_MODEL as reported in briefs and QA reports, naming GMI when it served the call."""
        on_gmi = self.openai_model and self.openai_base_url == self.gmi_base_url
        return gmi_label(self.openai_model) if on_gmi else self.openai_model

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
            # `or` so an empty OPENAI_BASE_URL= line in .env still means OpenAI
            openai_base_url=(os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/"),
            gmi_key=os.getenv("GMI_API_KEY", ""),
            gmi_base_url=(os.getenv("GMI_BASE_URL") or "https://api.gmi-serving.com/v1").rstrip("/"),
            poll_interval_minutes=int(os.getenv("POLL_INTERVAL_MINUTES") or 15),
            oriane_max_searches_per_hour=int(os.getenv("ORIANE_MAX_SEARCHES_PER_HOUR") or 20),
            label_min_views=int(os.getenv("LABEL_MIN_VIEWS") or 10000),
            label_max_per_hour=int(os.getenv("LABEL_MAX_PER_HOUR") or 200),
            review_token=os.getenv("REVIEW_TOKEN", ""),
        )


def gmi_label(model: str) -> str:
    return f"{model} on GMI Cloud"
