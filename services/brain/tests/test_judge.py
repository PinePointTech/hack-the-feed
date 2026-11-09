"""Judge request shape and answer validation. The real Judge runs over a mock transport, so no network."""

import asyncio
import json

import httpx
import pytest

from app import judge
from app.config import Settings

SETTINGS = Settings(oriane_key="", oriane_search_url="", openai_key="k", openai_model="m", allowed_origins=[])
QUESTIONS = {"q": {"type": "noul", "instructions": "Yes?"}}
OK = {"choices": [{"message": {"content": json.dumps({"answers": {"q": {"noul": 0.5}}})}}]}


def ask(handler) -> tuple[dict, list[dict]]:
    sent = []

    def record(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return handler(len(sent))

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(record)) as client:
            return await judge.Judge(settings=SETTINGS).ask("state", QUESTIONS, client=client)

    return asyncio.run(go())[0], sent


def test_the_request_asks_for_temperature_zero():
    answers, sent = ask(lambda n: httpx.Response(200, json=OK))
    assert answers == {"q": {"noul": 0.5}} and [p["temperature"] for p in sent] == [0]


def test_a_model_that_refuses_temperature_is_asked_again_without_it():
    def handler(n):
        if n == 1:
            return httpx.Response(400, json={"error": {"message": "Unsupported value: 'temperature' does not support 0"}})
        return httpx.Response(200, json=OK)

    answers, sent = ask(handler)
    assert answers == {"q": {"noul": 0.5}}
    assert ["temperature" in p for p in sent] == [True, False]


def test_another_bad_request_still_fails_at_once():
    with pytest.raises(httpx.HTTPStatusError):
        ask(lambda n: httpx.Response(400, json={"error": {"message": "bad model"}}))


def test_probabilities_rounded_to_two_decimals_over_many_options_still_validate():
    options = {f"s{i}": "x" for i in range(13)}
    question = {"c": {"type": "choice", "instructions": "?", "options": options}}

    def reply(total_extra):
        scores = {name: 0.01 for name in options}
        scores["s0"] = round(1 - 0.12 + total_extra, 2)  # 12 others at 0.01
        return json.dumps({"answers": {"c": {"choice": "s0", "probabilities": scores}}})

    assert judge.validate_answers(reply(0.0), question)["c"]["choice"] == "s0"
    assert judge.validate_answers(reply(-0.05), question)["c"]["choice"] == "s0"  # sums to 0.95, within 13 * 0.005
    with pytest.raises(ValueError):
        judge.validate_answers(reply(-0.2), question)  # sums to 0.8


def test_two_options_keep_the_tight_tolerance():
    question = {"c": {"type": "choice", "instructions": "?", "options": {"a": "x", "b": "y"}}}
    with pytest.raises(ValueError):
        judge.validate_answers(json.dumps({"answers": {"c": {"choice": "a", "probabilities": {"a": 0.9, "b": 0.05}}}}), question)
