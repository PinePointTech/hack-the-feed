import os
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import APIError, APITimeoutError, AsyncOpenAI
from pydantic import BaseModel, Field


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    token = os.environ.get("AGENT_API_TOKEN", "").strip()
    if not api_key or not token:
        raise RuntimeError("OPENAI_API_KEY and AGENT_API_TOKEN must be set")
    app.state.token = token
    app.state.model = os.environ.get("OPENAI_MODEL", "gpt-6-luna")
    async with AsyncOpenAI(
        api_key=api_key,
        base_url="https://api.openai.com/v1",
        timeout=30.0,
        max_retries=0,
    ) as client:
        app.state.client = client
        yield


app = FastAPI(title="Hack the Feed test agent", lifespan=lifespan)
bearer = HTTPBearer(auto_error=False)


class AgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class AgentResponse(BaseModel):
    reply: str
    model: str


def authenticate(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), app.state.token.encode()
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


@app.get("/")
@app.get("/healthz")
async def health():
    return {"status": "ok"}


@app.post("/agent", response_model=AgentResponse, dependencies=[Depends(authenticate)])
async def agent(request: AgentRequest):
    if not request.message.strip():
        raise HTTPException(status_code=422, detail="Message must not be blank")
    try:
        response = await app.state.client.responses.create(
            model=app.state.model,
            instructions="You are a concise assistant for testing container deployments.",
            input=request.message,
            max_output_tokens=512,
            store=False,
        )
    except APITimeoutError:
        raise HTTPException(status_code=504, detail="Model request timed out") from None
    except APIError:
        raise HTTPException(status_code=502, detail="Model request failed") from None
    return AgentResponse(reply=response.output_text, model=app.state.model)
