import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from openai import APIConnectionError, APITimeoutError, RateLimitError

from app.main import app


class AgentTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "test-key", "AGENT_API_TOKEN": "test-token", "OPENAI_MODEL": "test-model"},
            clear=True,
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.client = self.enterContext(TestClient(app))
        self.create = AsyncMock(return_value=SimpleNamespace(output_text="Hello from the agent"))
        self.enterContext(patch.object(app.state.client.responses, "create", self.create))
        self.headers = {"Authorization": "Bearer test-token"}

    def test_health_is_public_and_does_not_call_openai(self):
        for path in ("/", "/healthz"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})
        self.create.assert_not_awaited()

    def test_authentication_required(self):
        for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": "Basic test-token"}):
            response = self.client.post("/agent", json={"message": "hello"}, headers=headers)
            self.assertEqual(response.status_code, 401)
        self.create.assert_not_awaited()

    def test_agent_response(self):
        response = self.client.post("/agent", json={"message": "hello"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"reply": "Hello from the agent", "model": "test-model"})
        self.create.assert_awaited_once_with(
            model="test-model",
            instructions="You are a concise assistant for testing container deployments.",
            input="hello",
            max_output_tokens=512,
            store=False,
        )

    def test_invalid_messages(self):
        for payload in ({}, {"message": ""}, {"message": "  "}, {"message": "x" * 8001}, {"message": 123}):
            response = self.client.post("/agent", json=payload, headers=self.headers)
            self.assertEqual(response.status_code, 422)
        self.create.assert_not_awaited()

    def test_upstream_errors_are_sanitized(self):
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        errors = [
            (APITimeoutError(request=request), 504),
            (APIConnectionError(request=request), 502),
            (RateLimitError("private upstream detail", response=httpx.Response(429, request=request), body=None), 502),
        ]
        for error, expected_status in errors:
            with self.subTest(error=type(error).__name__):
                self.create.side_effect = error
                response = self.client.post("/agent", json={"message": "hello"}, headers=self.headers)
                self.assertEqual(response.status_code, expected_status)
                self.assertNotIn("private upstream detail", response.text)
                self.assertNotIn("test-key", response.text)


class StartupTests(unittest.TestCase):
    def test_missing_credentials_fail_startup(self):
        for environment in ({}, {"OPENAI_API_KEY": "test-key"}, {"AGENT_API_TOKEN": "test-token"}):
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True):
                with self.assertRaisesRegex(RuntimeError, "must be set"):
                    with TestClient(app):
                        pass


if __name__ == "__main__":
    unittest.main()
