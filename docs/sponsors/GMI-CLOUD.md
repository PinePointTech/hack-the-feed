# GMI Cloud

Owner: Kris. GPU cloud with serverless model endpoints (OpenAI-compatible), dedicated endpoints and sandboxes. Credits are handed out at check-in. Console: https://console.gmicloud.ai. Docs: https://docs.gmicloud.ai (index for agents: `docs.gmicloud.ai/llms.txt`).

## How we use it
| Job | Model or product |
|---|---|
| Claim sentence, clustering, brief drafting, excerpt picking, fallback judge | Serverless LLM (`GMI_LLM_MODEL`) |
| Reading on-screen text in video frames (QA) | Serverless vision model (`GMI_VLM_MODEL`) |
| Batch radar or QA job (stretch) | GMI sandbox |

## Serverless inference
- Base URL `https://api.gmi-serving.com/v1`, header `Authorization: Bearer $GMI_API_KEY`.
- `POST /chat/completions` (OpenAI format, supports `response_format: {"type": "json_object"}`), `GET /models`.
- Model ids seen in our research (confirm with `/models` before you rely on one):
  - `deepseek-ai/DeepSeek-V3.2` (drafting)
  - `Qwen/Qwen3-Next-80B-A3B-Instruct` (fast text)
  - `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8` (vision)
  - `nvidia/NVIDIA-Nemotron-3-Nano-Omni` (images, video and audio input)
  - NVIDIA Nemotron 3.5 Lightning and Nemotron 3.5 Super VL were announced on GMI; look up their ids in `/models`. ([Super VL on GMI](https://www.gmicloud.ai/en/blog/nvidia-nemotron-35-super-vl-on-gmi-cloud-agents-that-can-see), [model list](https://docs.gmicloud.ai/model-quickstarts/text/overview))
- Also listed: video generation (wan2.6-t2v, kling, veo-3.1, seedance) and TTS (minimax-tts-speech-2.8, inworld-tts-2, Chatterbox). Only for a no-camera format stretch. No speech-to-text model was listed, so transcripts come from Oriane.

```python
from openai import OpenAI
gmi = OpenAI(base_url="https://api.gmi-serving.com/v1", api_key=os.environ["GMI_API_KEY"])

# text with JSON output
r = gmi.chat.completions.create(model=os.environ["GMI_LLM_MODEL"], temperature=0.2,
    response_format={"type": "json_object"},
    messages=[{"role": "system", "content": "Return JSON."}, {"role": "user", "content": "..."}])

# vision: one frame as a base64 data URL (test one frame before batching)
b64 = base64.b64encode(open("f_001.jpg", "rb").read()).decode()
r = gmi.chat.completions.create(model=os.environ["GMI_VLM_MODEL"], temperature=0,
    response_format={"type": "json_object"},
    messages=[{"role": "user", "content": [
        {"type": "text", "text": "Copy all on-screen text exactly. Return JSON {\"text\": \"...\"}"},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}])
```

## Sandbox (stretch)
- `uv add gmi-sandbox-sdk` (version 1.2.0 when we checked). Env: `GMI_SANDBOX_API_KEY`, `GMI_SANDBOX_IDC_NAME` (for example `gmi-sandbox-us`).
- `from sandbox_sdk import SandboxClient`. Known calls: `sandbox.files.upload(...)`, `sandbox.commands.run(cmd, cwd=..., envs=..., wait=True, wait_timeout_seconds=25)`, `sandbox.files.download(...)`. stdout is capped at 1 MiB, so write results to files.
- How to create, pause and delete a sandbox: `docs.gmicloud.ai/agentbox-api/sandbox-sdk/usage.md` and `sdk-reference.md`.
- Agentbox SDK (agents API) also exists: `gmi-agentbox-sdk`, base `https://api.gmi-serving.com/v1/agents`. Not needed today.

## Demo line
"Our drafting, clustering and video checks run on GMI Cloud serverless models, and the batch job can run in a GMI sandbox."
