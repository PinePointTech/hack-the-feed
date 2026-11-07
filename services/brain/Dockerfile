# Build from the repo root so the image keeps the repo layout the code expects
# (services/brain/app -> ../../../data and ../../../contracts):
#   docker build -f services/brain/Dockerfile -t mybuster-brain .
#   docker run --env-file services/brain/.env -p 8000:8000 -v "$PWD/data:/app/data" mybuster-brain
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
WORKDIR /app/services/brain
COPY services/brain/pyproject.toml services/brain/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/brain/app ./app
# radar.py seeds refreshes from the shared fixture
COPY contracts/fixtures /app/contracts/fixtures

RUN useradd --create-home --uid 1000 brain && mkdir -p /app/data && chown brain /app/data
USER brain
ENV PATH="/app/services/brain/.venv/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
