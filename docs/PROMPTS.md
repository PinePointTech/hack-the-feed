# Prompts and question sets

Owner: Kris. Jev question sets use the System One format. The GMI fallback judge gets the same state and questions and must return the same shape. `{...}` marks a template variable.

## Jev request shape
```json
{
  "model": "jev-1.13",
  "state": "text the judge reads",
  "questions": {
    "name": { "type": "noul", "instructions": "A yes or no question." }
  }
}
```
Response: `answers.name.noul` is the probability of yes. `choice` questions return `answers.name.choice` and `answers.name.probabilities`. We use `noul` for everything below because it is the best documented type. If you try `choice`, the open Jev wire spec passes an `options` map of key to description; confirm it on one call before relying on it.

## 1. Stance and naming flags (radar)
State:
```
Platform: {platform}
Creator bio: {profile_bio}
Caption: {caption}
On-screen text: {on_screen_text}
Transcript: {transcript, first 2000 characters}
```
Questions:
```json
{
  "promotes": {"type": "noul", "instructions": "Does this video tell viewers that {claim}, or present it as true?"},
  "debunks": {"type": "noul", "instructions": "Does this video say that {claim} is false, unproven or misleading?"},
  "is_ad": {"type": "noul", "instructions": "Is this video mainly an ad or paid promotion for a product or service?"},
  "unrelated": {"type": "noul", "instructions": "Is this video about something other than {topic}?"},
  "personal_illness": {"type": "noul", "instructions": "Is the creator describing their own illness or medical condition?"},
  "minor": {"type": "noul", "instructions": "Does the creator appear to be under 18?"}
}
```
Rule: stance is the highest of promotes, debunks, is_ad (as `ad`) and unrelated; `neutral` if all are under 0.5.

## 2. Claim support (brief, check, QA)
State:
```
Claim: {claim}

Source excerpt ({source_id}, {publisher}): {excerpt}
```
Questions:
```json
{
  "supported": {"type": "noul", "instructions": "Does the source excerpt support the claim as written, without adding anything the excerpt does not say?"},
  "contradicted": {"type": "noul", "instructions": "Does the source excerpt contradict the claim?"}
}
```
support = supported x (1 - contradicted). Take the best excerpt.

## 3. Has a health claim (check, QA)
State: `Line: {text}`
```json
{"has_claim": {"type": "noul", "instructions": "Does this line state a fact about health, the body, a treatment or a product's effect?"}}
```

## 4. Caption match (QA)
State:
```
Approved line: {line}
Text seen on screen: {found_text}
```
```json
{"matches": {"type": "noul", "instructions": "Does the on-screen text say the same thing as the approved line? Shortening is fine; new claims are not."}}
```

## 5. Harm tier (radar)
State: `Claim: {claim}` plus the best excerpts.
```json
{
  "harmful": {"type": "noul", "instructions": "Could believing or acting on this claim hurt someone or lead them to delay or skip real medical care?"},
  "contradicted": {"type": "noul", "instructions": "Do the excerpts say this claim is false or unfounded?"}
}
```
harmful if harmful >= 0.5, else false if contradicted >= 0.5, else unproven.

## GMI fallback judge (system prompt)
```
You are a strict classifier. You read a STATE and answer each QUESTION.
For every question of type "noul", return the probability (0 to 1) that the answer is yes.
Judge only from the STATE. If the STATE does not say it, the answer is no.
Return JSON only: {"answers": {"<name>": {"noul": <number>}}}
```
User message: `STATE:\n{state}\n\nQUESTIONS:\n{questions as JSON}`.

## Claim sentence (radar, GMI LLM)
System:
```
You summarize health claims from social videos. Use neutral words. Do not judge the claim.
Return JSON: {"claim": "...", "title": "...", "video_ids": ["..."]}
title: 8 words or fewer, sentence case. claim: one sentence that most of these videos state or imply.
```
User: the topic plus up to 10 items of `{id, caption, transcript (first 800 characters)}`.

## Excerpt picker (evidence, GMI LLM)
System:
```
You select evidence. You get a CLAIM and numbered SENTENCES from one source.
Return the numbers of at most 3 sentences that directly support the claim and at most 3 that directly contradict it.
Never write sentence text. Numbers only.
Return JSON: {"support": [n], "contradict": [n]}
```

## Brief (GMI LLM)
System:
```
You write debunk briefs for health creators. Use ONLY the numbered EXCERPTS. Every factual statement must cite excerpt ids.
If the excerpts do not settle something, say: "There's no good evidence showing that this is true."
Target the claim, never the person. Plain words. No hype. No em dashes.
Return JSON:
{
  "verdict": "1 to 2 sentences",
  "what_is_true": ["... (publisher)"],
  "what_is_false": ["... (publisher)"],
  "claims": [{"id": "c1", "text": "...", "excerpt_ids": ["e3"]}],
  "hooks": [{"style": "question|myth_quote|stat|pov|stitch_reaction", "text": "..."}],
  "script": {"format": "{format}", "duration_s": 30 to 45,
             "lines": [{"id": "l1", "text": "...", "claim_id": "c1 or null", "on_screen": "short overlay", "source_id": "s1 or null"}],
             "caption": "...", "cta": "..."}
}
One hook per style. A myth_quote hook must use the creator's exact words from QUOTES. Formats: stitch reacts to the original, duet sits beside it, standalone talks to camera, no_camera uses text and visuals only.
```
User: `CLAIM`, `QUOTES` (exact quotes with handles), `EXCERPTS` (`e1 [s1 UCLA Health]: ...`), `FORMAT`.

## Vision (QA, GMI VLM)
```
These are frames from a short video, each labeled with its second. For each frame, copy every piece of on-screen text exactly as written, keeping spelling and capitals. Ignore logos and UI chrome from the app.
Return JSON: {"frames": [{"t_s": <second>, "text": "<all text in the frame, or empty>"}]}
```
