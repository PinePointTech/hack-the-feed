# Risks and fallbacks

Owner: both. If something breaks, look here first.

| Risk | Chance | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Oriane REST base URL or key unclear | Medium | Radar can't refresh | Ask at the kickoff or in the Oriane dashboard. Fallbacks: the Firecrawl Alexandria route (`sponsors/ORIANE.md`), or the committed snapshots, which are real Oriane data | Kris |
| Oriane credits run out | Medium | No new pulls | `basic` projection for counts, `full` only with limit 5 or less, cache every response in `data/cache/` | Kris |
| Jev access or latency | Medium | No judge scores | GMI LLM judge with the same question format and JSON output; label `engine: gmi_judge` | Kris |
| GMI model IDs differ from our notes | Medium | 404 on calls | `GET /v1/models` at setup, put real IDs in `.env` | Kris |
| LLM invents a source or quote | Medium | Trust is gone | LLM picks sentence indices, never text; excerpt substring check after normalizing quotes and whitespace; "No good source found" state | Kris |
| Brief takes too long live | High | Dead air in the demo | Cache per myth and format, warm before 5:20, demo the live `/check` instead of a cold brief | Kris |
| Naming a creator unfairly | Low | Ethics and legal | Exact quotes, timestamps, links, "from a video posted by", thresholds, no minors, no illness stories, quote cards instead of re-uploads | both |
| Compound needs a Mac with Apple Silicon and macOS 15, trial needs a card | Medium | No edited video | Install and start the trial before 3:45. Backup: plain recording with captions burned in by ffmpeg | Vi |
| Video QA too slow | Medium | Skipped step | 1 fps, 40 frames max, batch frames, cache the report, show "cached" if needed | Kris |
| Venue Wi-Fi | Medium | APIs time out | Demo laptop runs web and brain locally, caches warm, phone hotspot as backup, backup screen recording | Vi |
| Vercel build fails | Medium | No public receipts page | Deploy a skeleton by 3:45; receipts are static JSON; fallback to localhost plus a tunnel | Vi |
| Amplitude events delayed or blocked | Medium | Weak ending | Clean browser profile, User Lookup view, screenshots from rehearsal | Vi |
| Merge conflicts | Low | Lost time | Folder ownership, small commits, `git pull --rebase`, no root package.json | both |
| Scope creep | High | Nothing finished | Cut lines in `05-TIMELINE.md`, feature freeze at 5:00 | Vi |
| PMC article pages blocked by a CAPTCHA | High | Missing source text | Use E-utilities `efetch` for abstracts, not PMC HTML | Kris |
| Fuzzy Oriane matches are noisy ("sea moss" matched "Mossimo") | High | Wrong counts | Exact phrases for counts, fuzzy only for discovery, stance labels before any claim count is shown | Kris |
