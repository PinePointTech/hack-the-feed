from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, Field

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


Format = Literal["stitch", "duet", "standalone", "no_camera"]
HookStyle = Literal["question", "myth_quote", "stat", "pov", "stitch_reaction"]


class BriefRequest(BaseModel):
    myth_id: str
    format: Format
    refresh: bool = False


class Evidence(BaseModel):
    source_id: str
    excerpt: str


class ClaimCheck(BaseModel):
    id: str
    text: str
    evidence: list[Evidence]
    support: float = Field(ge=0, le=1)
    status: Literal["supported", "weak"]
    engine: Literal["cached"] = "cached"


class Hook(BaseModel):
    id: str
    style: HookStyle
    text: str


class ScriptLine(BaseModel):
    id: str
    text: str
    claim_id: str | None = None
    on_screen: str | None = None
    source_id: str | None = None


class Script(BaseModel):
    format: Format
    duration_s: int
    lines: list[ScriptLine]
    caption: str
    cta: str


class Brief(BaseModel):
    myth_id: str
    verdict: str
    what_is_true: list[str]
    what_is_false: list[str]
    sources: list[Source]
    claims: list[ClaimCheck]
    hooks: list[Hook]
    script: Script
    models: dict[str, str]
    generated_at: datetime


class CheckLine(BaseModel):
    id: str
    text: str


class CheckRequest(BaseModel):
    myth_id: str
    lines: list[CheckLine]


class LineCheck(BaseModel):
    line_id: str
    has_claim: bool
    support: float | None = Field(default=None, ge=0, le=1)
    status: Literal["supported", "weak", "unsupported"] | None = None
    evidence: list[Evidence] | None = None
    engine: Literal["cached"] = "cached"
    note: str | None = None


class CheckResponse(BaseModel):
    results: list[LineCheck]


class QAIssue(BaseModel):
    t_s: int
    found_text: str
    expected_line_id: str | None = None
    problem: Literal["text_not_in_script", "unsupported_claim", "missing_source", "typo"]
    support: float | None = Field(default=None, ge=0, le=1)


class QAReport(BaseModel):
    myth_id: str
    frames_checked: int
    texts_found: int
    issues: list[QAIssue]
    passed: bool = Field(alias="pass")
    models: dict[str, str]
    ran_in: Literal["local", "cached"]
    duration_ms: int


class ApprovalChecklist(BaseModel):
    every_claim_has_source: bool = Field(strict=True)
    quotes_are_exact: bool = Field(strict=True)
    targets_claim_not_person: bool = Field(strict=True)
    no_minors_or_illness_stories: bool = Field(strict=True)
    video_qa_passed: bool = Field(strict=True)
    approved_by: str = Field(min_length=1)
    approved_at: AwareDatetime


class Clinician(BaseModel):
    name: str = Field(min_length=1)
    npi: str | None = None
    verified: bool = Field(strict=True)


class PublishRequest(BaseModel):
    myth_id: str
    brief: Brief
    approval: ApprovalChecklist
    video_url: str | None = None
    clinician: Clinician | None = None


class PublishedDebunk(BaseModel):
    id: str
    myth: dict[str, Any]
    quoted: list[dict[str, Any]]
    verdict: str
    what_is_true: list[str]
    what_is_false: list[str]
    sources: list[Source]
    claims: list[ClaimCheck]
    script: Script
    video_url: str | None = None
    approval: ApprovalChecklist
    certified_by_clinician: bool
    clinician: Clinician | None = None
    published_at: datetime
