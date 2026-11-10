"""Video QA frame reading picks GMI when its key is set and OpenAI otherwise. Stubbed transport, no network."""

import asyncio
import io
import json

import httpx
from fastapi import UploadFile

from app import qa
from app.config import Settings

LINE = qa.ScriptLine(id="l1", text="Lymph needs no detox", on_screen="Lymph needs no detox")


def settings(**extra) -> Settings:
    return Settings(
        oriane_key="", oriane_search_url="", openai_key="ok", openai_model="gpt-x", allowed_origins=[],
        openai_base_url="https://openai.test/v1", gmi_base_url="https://gmi.test/v1", **extra,
    )


def vqa(**extra) -> qa.VideoQA:
    return qa.VideoQA(settings(**extra), checker=None)


def frames(tmp_path, count=2):
    paths = []
    for index in range(count):
        path = tmp_path / f"f{index}.jpg"
        path.write_bytes(b"jpeg")
        paths.append((index, path))
    return paths


def read(video: qa.VideoQA, tmp_path):
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append((str(request.url), request.headers["authorization"], json.loads(request.content)))
        text = json.dumps({"frames": [{"t_s": 0, "text": " Lymph needs no detox "}, {"t_s": 1, "text": ""}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await video.read_frames(client, frames(tmp_path))

    return asyncio.run(go()), sent


def test_gmi_reads_the_frames_when_its_key_is_set(tmp_path):
    texts, sent = read(vqa(gmi_key="gk"), tmp_path)
    url, auth, body = sent[0]
    assert texts == ["Lymph needs no detox", ""]
    assert (url, auth) == ("https://gmi.test/v1/chat/completions", "Bearer gk")
    assert body["model"] == "google/gemini-3.5-flash-lite"


def test_openai_reads_the_frames_when_there_is_no_gmi_key(tmp_path):
    texts, sent = read(vqa(), tmp_path)
    url, auth, body = sent[0]
    assert texts == ["Lymph needs no detox", ""]
    assert (url, auth, body["model"]) == ("https://openai.test/v1/chat/completions", "Bearer ok", "gpt-x")
    images = [part for part in body["messages"][1]["content"] if part["type"] == "image_url"]
    assert len(images) == 2 and images[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def report(video: qa.VideoQA, tmp_path, monkeypatch):
    async def inspect(client, myth_id, lines, observations):
        return [], True

    monkeypatch.setattr(qa.oriane, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(qa, "load_excerpts", lambda myth_id: {})
    monkeypatch.setattr(qa, "sample_frames", lambda path: _frames(tmp_path))
    monkeypatch.setattr(video, "inspect", inspect)
    monkeypatch.setattr(video, "read_frames", lambda client, group: _texts(group))

    async def go():
        return await video.run(None, "lymphatic-detox", [LINE], UploadFile(io.BytesIO(b"mp4"), filename="a.mp4"))

    return asyncio.run(go())[0]


async def _frames(tmp_path):
    return [path for _, path in frames(tmp_path)]


async def _texts(group):
    return ["Lymph needs no detox" for _ in group]


def test_the_report_names_the_engine_that_read_the_frames(tmp_path, monkeypatch):
    assert report(vqa(gmi_key="gk"), tmp_path, monkeypatch).models["vision"] == "google/gemini-3.5-flash-lite on GMI Cloud"
    assert report(vqa(), tmp_path, monkeypatch).models["vision"] == "gpt-x"


def test_qa_still_needs_one_vision_engine(tmp_path, monkeypatch):
    import pytest

    video = qa.VideoQA(Settings(oriane_key="", oriane_search_url="", openai_key="", openai_model="", allowed_origins=[]), None)
    with pytest.raises(RuntimeError):
        report(video, tmp_path, monkeypatch)
