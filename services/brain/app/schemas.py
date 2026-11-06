from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SourceKind = Literal["review", "trial", "guideline", "health_system", "journalism", "other"]


class Source(BaseModel):
    id: str
    title: str
    publisher: str
    url: str
    kind: SourceKind
    published: str | None = None
    pmid: str | None = None
    excerpts: list[str] = Field(min_length=1)
    fetched_at: datetime
