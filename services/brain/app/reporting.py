"""Build impact and editorial calendar snapshots from measured Oriane data."""

import json
from datetime import datetime

from . import oriane

CANDIDATES = (
    ("Cortisol face and belly", 69, 4_636_041, "Exact match for cortisol face, belly, detox or cocktail."),
    ("Tallow skincare", 154, 2_639_652, "Exact match for the tallow skincare phrases."),
)


def reach(rows: list[dict]) -> dict | None:
    views = [row.get("viewsCount") for row in rows]
    if any(type(value) is not int or value < 0 for value in views):
        return None
    return {"videos": len(rows), "views": sum(views)}


def timestamp(row: dict) -> datetime | None:
    try:
        value = datetime.fromisoformat(row["publishedAt"])
    except (KeyError, TypeError, ValueError):
        return None
    return value if value.tzinfo else None


def build_impact(detail: dict, sample: list[tuple[str, dict]]) -> dict | None:
    promoters = [row for stance, row in sample if stance == "promotes"]
    debunks = [row for stance, row in sample if stance == "debunks"]
    myth_reach = reach(promoters)
    if not sample or myth_reach is None:
        return None

    note = (
        f"Based on the {len(sample)} highest-viewed Oriane topic matches in the saved "
        "stance sample. Reach sums the views of posts labeled promotes or debunks."
    )
    topic_views = detail["topic_views"]
    total = reach([row for _, row in sample])
    if total is not None and topic_views:
        note += f" The sampled posts account for {total['views'] / topic_views:.1%} of topic views."

    impact = {"myth_id": detail["id"], "window": detail["window"], "myth_reach": myth_reach}
    if (response_reach := reach(debunks)) is not None:
        impact["response_reach"] = response_reach
        if myth_reach["views"]:
            impact["response_ratio"] = response_reach["views"] / myth_reach["views"]
            note += " Response ratio divides debunk views by promoter views."
    else:
        note += " Response views are unavailable for part of the sample."
    if not debunks:
        note += " The sample contains zero posts labeled debunks."

    if promoters:
        spike = timestamp(max(promoters, key=lambda row: row["viewsCount"]))
        responses = [timestamp(row) for row in debunks]
        if spike and all(response is not None for response in responses):
            later = [response for response in responses if response > spike]
            if later:
                impact["hours_spike_to_first_response"] = round((min(later) - spike).total_seconds() / 3600, 2)
                note += " Response time is measured from the top promoter to the first later sampled debunk."

    if clinician := detail.get("clinician_share"):
        impact["baseline_clinician"] = {key: clinician[key] for key in ("videos", "views", "note")}
    impact["note"] = note
    return impact


def build_calendar(snapshot: dict) -> dict:
    fixture_path = oriane.DATA_DIR.parent / "contracts" / "fixtures" / "calendar.json"
    fixture = json.loads(fixture_path.read_bytes())
    week = fixture["this_week"][0]["window"]
    entries = []
    for myth in snapshot["myths"]:
        videos, views = myth["topic_video_count"], myth["topic_views"]
        window = myth["window"]
        why = f"Oriane matched {videos:,} videos with {views:,} views from {window['from']} through {window['to']}."
        if (change := myth.get("trend_pct")) is not None:
            why += f" Video count changed {change:+d}% versus the previous window."
        entries.append({
            "topic": myth["title"], "myth_id": myth["id"], "harm_tier": myth["harm_tier"],
            "trend": myth["trend"], "window": week, "basis": "oriane_trend", "why": why,
            "video_count": videos, "views": views,
            "script_available": any((oriane.DATA_DIR / "briefs").glob(f"{myth['id']}.*.json")),
        })
    for item in fixture["this_week"]:
        if "myth_id" not in item:
            entries.append({**item, "why": item["why"] + " Oriane snapshot from October 7 through November 6, 2026."})
    for topic, videos, views, match_note in CANDIDATES:
        entries.append({
            "topic": topic, "trend": "unknown", "window": week, "basis": "oriane_trend",
            "why": (
                f"Oriane matched {videos:,} videos with {views:,} views from October 7 through "
                f"November 6, 2026. {match_note} Claims are awaiting review."
            ),
            "video_count": videos, "views": views, "script_available": False,
        })
    return {"week_of": fixture["week_of"], "this_week": entries, "watchlist": fixture["watchlist"]}
