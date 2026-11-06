# hack-the-feed

Minimal, stateless Python HTTP agent for testing **DockerHub → GMI Cloud Agentbox** deployment. It calls OpenAI directly using your OpenAI API key; GMI supplies the container hosting, not model inference. This is a deployment smoke test, not a tool-using autonomous agent.

## API and configuration

- `GET /` and `GET /healthz`: public liveness checks; no paid model call.
- `POST /agent`: JSON `{"message":"Say hello"}`, protected by `Authorization: Bearer <AGENT_API_TOKEN>`; returns `{"reply":"...","model":"..."}`.
- `GET /docs`: interactive API documentation.

| Runtime variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required OpenAI secret, provided at runtime only. |
| `AGENT_API_TOKEN` | Required separate secret protecting the agent endpoint. |
| `OPENAI_MODEL` | Optional Responses API model; defaults to `gpt-6-luna`. |

The service fails startup if either secret is missing. Input is limited to 8,000 characters and output to 512 tokens. Calls time out after 30 seconds with no automatic retries. Responses are not stored by the Responses API (`store=False`); provider data policies still apply. Upstream errors return sanitized 502/504 responses. Health checks prove the server is running, not that the OpenAI key/model works.

## Run locally in Docker

Docker Desktop must be running. Copy the example, then edit `.env` locally to set your OpenAI key and a random agent token (generate one with `openssl rand -hex 32`). Do not paste secrets into chat, commits, Docker build arguments, or image layers.

```bash
cp .env.example .env
chmod 600 .env
# Edit .env before running the container.
docker build --platform linux/amd64 -t hackthefeed:0.1.0 .
docker run --rm --name hackthefeed-test \
  --env-file .env -p 127.0.0.1:8080:8080 hackthefeed:0.1.0
```

The image uses a non-root user, listens on `0.0.0.0:8080`, and includes a health check. The build context excludes local environment files. `linux/amd64` makes the image usable on x86 cloud hosts even when built on Apple Silicon; confirm the selected GMI instance architecture before deploying.

From a second terminal:

```bash
curl --fail-with-body http://localhost:8080/healthz
# Read the token without putting its value into shell history.
read -r -s AGENT_API_TOKEN
export AGENT_API_TOKEN
curl --fail-with-body http://localhost:8080/agent \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Say hello and confirm this agent can reach OpenAI."}'
unset AGENT_API_TOKEN
```

The authenticated request incurs OpenAI usage charges. Stop the foreground container with Ctrl+C.

## Publish to DockerHub

`hackthefeed` is the repository/image name. Replace `YOUR_DOCKERHUB_NAMESPACE` with your DockerHub user or organization; no namespace has been assumed and no image is published automatically. Create that repository with the intended visibility first. A public image makes its application code publicly available, so use a private repository unless publication is intended.

```bash
export DOCKERHUB_NAMESPACE=YOUR_DOCKERHUB_NAMESPACE
export IMAGE="docker.io/$DOCKERHUB_NAMESPACE/hackthefeed:0.1.0"
docker login docker.io
docker tag hackthefeed:0.1.0 "$IMAGE"
docker push "$IMAGE"
```

Use a fresh version tag for each deployment rather than overwriting `latest`.

## Deploy to GMI Cloud Agentbox

Based on GMI's [registration guide](https://docs.gmicloud.ai/agentbox-marketplace/register-an-agent):

1. Open **Console → Agentbox → Register Template → Host on GMI**. This runs the Docker image; **Connect your agent** is for an already-hosted endpoint.
2. Set **Project Name** to `hackthefeed-test` and **Image URL** to the fully qualified image you pushed above.
3. For a private DockerHub image, enable **Requires sign-in** and provide the DockerHub username and a read-only access token through the console, not this repository.
4. Select a data center and an appropriate **Sandbox SMALL** instance (or the smallest suitable available size). No GPU is needed for this API-calling service.
5. Leave **Start Command** empty: the image supplies its own command. Set **Internal Port** to `8080`; use the HTTPS public mapping (external `443` → internal `8080`). If a health-check path is configurable, use `/healthz`; `/` also returns 200.
6. Add **Custom Variables**: `OPENAI_API_KEY` and `AGENT_API_TOKEN` as **SECRET**, and optionally `OPENAI_MODEL` as **TEXT**. Keep the template private and do not publish it with personal credentials.
7. GMI automatically supplies `GMI_MAAS_API_KEY` for GMI Models. This test intentionally does **not** use it or redirect OpenAI requests to GMI. The application explicitly targets `https://api.openai.com/v1`; ensure outbound HTTPS to OpenAI is allowed.
8. **Register** saves the template; it does not run the service. Once ready, launch a sandbox from the template via **+ Sandbox**. Check logs and the exposed endpoint.
9. Repeat both curl checks above with the sandbox's HTTPS URL instead of `http://localhost:8080`. Health must return 200; an unauthenticated `/agent` request must return 401; an authenticated request must produce a real model reply.
10. Delete the sandbox when finished to stop compute billing. OpenAI usage is billed separately. Registration, sandbox launch, and marketplace listing are separate actions; no marketplace listing is needed for this test.

This is not a production service: there is no per-user authentication, rate limiting, or distributed concurrency control. Keep access restricted, do not share the bearer token, and monitor OpenAI usage during testing.

## Development and tests

Use Python 3.12 and [uv](https://docs.astral.sh/uv/):

```bash
uv venv --python 3.12
uv pip sync --python .venv/bin/python requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -v
```

Tests mock OpenAI, so they require no real API key or paid requests. They cover liveness, authentication, input validation, model invocation, sanitized provider failures, and startup configuration. Docker/cloud smoke checks remain separate.

Dependencies are pinned with hashes. To intentionally refresh them:

```bash
uv pip compile --python-version 3.12 --generate-hashes requirements.in -o requirements.txt
uv pip compile --python-version 3.12 --generate-hashes \
  --constraint requirements.txt requirements-dev.in -o requirements-dev.txt
```
