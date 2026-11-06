# Jev (TypeSafe System One)

Owner: Kris. Jev is a judge model: you give it a state (text) and questions, and it returns probabilities instead of prose. Text only (image input exists in a 1.14 preview behind a header). Docs: https://docs.typesafe.ai and https://docs.typesafe.ai/models.

## Why we use it
- Cheap and calibrated: $0.042 per million input tokens, output is free.
- OpenRouter tested it against an LLM judge on 88 labelled faithfulness checks: 95.5% accuracy for Jev vs 94.3% for the LLM, at $0.021 vs $0.114 per 1,000 judgments, about 5x cheaper ([OpenRouter](https://openrouter.ai/blog/tutorials/jev-vs-llm-as-a-judge/), [Beam write-up](https://beam.ai/agentic-insights/llm-as-a-judge-jev)).
- Weak spots: long text that needs claim-by-claim reasoning, and it gives no explanation. Keep inputs short (one claim and one excerpt per call) and write the human-readable note ourselves.

## Routes
| Route | Endpoint | Model |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1/systemone` | `jev-1.13` |
| TypeSafe direct | `https://api.typesafe.ai/v1/systemone` | `jev-1.13` |
| DigitalOcean | `https://inference.do-ai.run/v1/systemone` | `typesafe-jev-1.13.0` ([docs](https://docs.digitalocean.com/products/inference/how-to/use-system-one-api/)) |

Set `JEV_BASE_URL` to the part before `/v1/systemone`, plus `JEV_API_KEY` and `JEV_MODEL`.

## Request and response
```bash
curl -s -X POST "$JEV_BASE_URL/v1/systemone" \
  -H "Authorization: Bearer $JEV_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "jev-1.13",
       "state": "Claim: Lymphatic drainage burns fat.\n\nSource excerpt (s1, UCLA Health): However, there is no evidence that MLD causes weight loss.",
       "questions": {
         "supported": {"type": "noul", "instructions": "Does the source excerpt support the claim as written?"},
         "contradicted": {"type": "noul", "instructions": "Does the source excerpt contradict the claim?"}}}'
```
Response: `{"model": "...", "answers": {"supported": {"type": "noul", "noul": 0.03}, "contradicted": {"type": "noul", "noul": 0.9}}}` (values here are illustrative). `choice` questions return `choice` and `probabilities`.

## Cascade
Run Jev on every check. Send only the uncertain middle band (for example support between 0.35 and 0.65) to the GMI LLM judge if you have time. Label every result with `engine`.

## Fallbacks
1. No key or errors: GMI LLM judge with the same questions (prompt in `../PROMPTS.md`), `engine: "gmi_judge"`.
2. Open Jev-style models you can serve yourself:
   - OpenJev from alanhuangyoo, `pip install openjev-ai`, model `alanhuangya/OpenJev-4B` ([releases](https://github.com/alanhuangyoo/OpenJev/releases))
   - OpenJev by AlexWortega, MIT, an entailment, contradiction or neutral cross-encoder on Qwen3.5 ([write-up](https://ai-tldr.dev/releases/sam-witteveen-open-jev-sep20/))
   - MiniCPM5-2B-Jev ([Hugging Face](https://huggingface.co/ytbai/MiniCPM5-2B-Jev))
   - CVLTAI s1-jev-cvltist, a LoRA on Qwen3.5-4B that serves the Jev wire format ([Hugging Face](https://huggingface.co/CVLTAI/s1-jev-cvltist))

Our question sets: `../PROMPTS.md`.
