"""Validate an approved brief and save the public receipts."""

import json
from datetime import datetime, timezone
from urllib.parse import urlsplit

from . import evidence, oriane, radar
from .schemas import PublishRequest, PublishedDebunk, Source

APPROVAL_FLAGS = (
    "every_claim_has_source",
    "quotes_are_exact",
    "targets_claim_not_person",
    "no_minors_or_illness_stories",
    "video_qa_passed",
)


def read_published(myth_id: str) -> PublishedDebunk:
    path = oriane.DATA_DIR / "published" / f"{myth_id}.json"
    return PublishedDebunk.model_validate_json(path.read_bytes())


def verify_sources(request: PublishRequest) -> list[Source]:
    path = evidence.DATA_DIR / f"{request.myth_id}.json"
    try:
        cached = [Source.model_validate(item) for item in json.loads(path.read_bytes())]
    except FileNotFoundError:
        cached = []
    canonical = {source.url: source for source in cached}
    sources = {}
    for source in request.brief.sources:
        original = canonical.get(source.url)
        if original is None or source.id in sources:
            raise ValueError("Every source must appear in the verified evidence cache.")
        approved_excerpts = {evidence.normalize(text): text for text in original.excerpts}
        excerpts = []
        for text in source.excerpts:
            verified = approved_excerpts.get(evidence.normalize(text))
            if not verified or not evidence.is_verbatim(text, verified):
                raise ValueError("A source excerpt could not be verified.")
            excerpts.append(verified)
        sources[source.id] = original.model_copy(update={"id": source.id, "excerpts": excerpts})

    claims = {}
    for claim in request.brief.claims:
        if claim.id in claims or claim.support < 0.5 or not claim.evidence:
            raise ValueError("Every claim needs verified evidence and a passing support score.")
        for citation in claim.evidence:
            source = sources.get(citation.source_id)
            if source is None or not any(
                evidence.normalize(citation.excerpt) == evidence.normalize(text)
                and evidence.is_verbatim(citation.excerpt, text)
                for text in source.excerpts
            ):
                raise ValueError("A claim cites an unverified source excerpt.")
        claims[claim.id] = claim

    for line in request.brief.script.lines:
        if line.claim_id is None and line.source_id is None:
            continue
        claim = claims.get(line.claim_id)
        if claim is None or line.source_id not in {citation.source_id for citation in claim.evidence}:
            raise ValueError("Every cited script line must link to a claim and one of its verified sources.")
    return list(sources.values())


def validate_video_url(video_url: str | None) -> None:
    if video_url is None:
        return
    url = urlsplit(video_url)
    local = video_url.startswith("/") and not url.netloc and not video_url.startswith("//")
    remote = url.scheme == "https" and url.hostname and not url.username and not url.password
    if not (local or remote) or "\\" in video_url or any(ord(char) < 32 for char in video_url):
        raise ValueError("Video URL must be an absolute HTTPS URL or a site-relative path.")


def save(request: PublishRequest) -> PublishedDebunk:
    if not request.approval.approved_by.strip() or not all(
        getattr(request.approval, key) for key in APPROVAL_FLAGS
    ):
        raise ValueError("Complete every approval checklist item before publishing.")
    if request.brief.myth_id != request.myth_id:
        raise ValueError("The brief must belong to the myth being published.")
    validate_video_url(request.video_url)
    sources = verify_sources(request)

    myth = next(item.copy() for item in radar.read_radar()["myths"] if item["id"] == request.myth_id)
    detail = radar.read_myth(request.myth_id)
    quoted = [
        video for video in detail["videos"] + detail["counter_voices"] if video["nameable"] is True
    ]
    if "top_video" in myth and myth["top_video"]["nameable"] is not True:
        del myth["top_video"]

    brief = request.brief
    receipt = PublishedDebunk(
        id=request.myth_id, myth=myth, quoted=quoted, verdict=brief.verdict,
        what_is_true=brief.what_is_true, what_is_false=brief.what_is_false,
        sources=sources, claims=brief.claims, script=brief.script, video_url=request.video_url,
        approval=request.approval, clinician=request.clinician,
        certified_by_clinician=bool(request.clinician and request.clinician.verified),
        published_at=datetime.now(timezone.utc),
    )
    try:
        prior = read_published(request.myth_id)
    except (FileNotFoundError, ValueError):
        pass
    else:
        if prior.model_dump(exclude={"published_at"}) == receipt.model_dump(exclude={"published_at"}):
            return prior
    path = oriane.DATA_DIR / "published" / f"{request.myth_id}.json"
    oriane.write_json(path, receipt.model_dump(mode="json", exclude_none=True))
    return receipt
