# Pitch

Owner: Vi. Demo is 2:30 (script in `06-DEMO-SCRIPT.md`). These slides frame it. Every number here has a source in `research/RESEARCH.md` or `research/ORIANE-FINDINGS.md`.

## Event facts (from the Luma page)
- Hack the Feed, Nov 6, 2026, Amplitude HQ, San Francisco. Demos 5:30 PM, winners 6:15 PM.
- Prizes: 1st, $3,000 package ($1,000 cash and $2,000 in credits); 2nd, $1,500 ($500 cash and $1,000 in credits); 3rd, $750 ($250 cash and $500 in credits); a wildcard award for the most unexpected idea; and the Compound Viral Award, an extra $1,000 for the video with the most views within 24 hours.
- Jury includes Jean Lee (founder, investor, YouTube creator with 120K+ subscribers, ex-WhatsApp engineer), Sumit Gupta (AI and tech creator, data engineer at Superhuman) and Amney Mounir (senior product growth analyst at Meta). Expect questions on creators, data and growth.

## Slides (5)
1. **The problem.** "Half of U.S. adults under 50 get health advice from influencers or podcasters." Then our Oriane numbers: 1,317 lymphatic drainage videos, 49.5M views in 30 days; clinician-bio accounts got 2.5% of those views and their five biggest posts were promotions.
2. **Live demo.** Title and the receipts QR only. Switch to the browser.
3. **How it works.** Oriane (find) → Jev (label and check) → GMI Cloud (cluster, draft, see) → Compound.mov (edit and post) → Amplitude (measure). One line each. Note: no source, no claim.
4. **Impact.** North star: response reach over myth reach. Guardrails: exact quotes, target the claim, names only above 100k views or 50k followers, never minors or illness stories, humans approve.
5. **Business and next.** Who pays, debunk bounties, the public myth calendar, what we'd build next.

Use plain arrows or numbers on the slide; keep it readable from the back of the room.

## Business model (proposal, not decided)
- **Desk subscription.** Creators and their social media managers pay per account per month. Price to test; for reference, Compound Pro is $20 per month.
- **Debunk bounties.** Public health groups, hospitals and nonprofits fund debunks of specific myths and pay per 1,000 verified views. Clipping campaigns pay a median of about $1 per 1,000 views across 50 campaigns, so the market already prices views this way. Never take bounty money from a brand that sells into the myth.
- **Public calendar as the top of the funnel.** Free for everyone. Creators who reuse an approved script land on the desk.
- **Distribution.** WHO's Fides network connects health creators; a partner like that is a natural channel.

## Likely judge questions
| Question | Answer |
|---|---|
| What if the AI is wrong? | No source, no claim. Excerpts are verbatim, Jev scores every line, a human approves with a checklist, and when evidence is thin the script says "There's no good evidence showing that this is true." |
| Isn't naming creators risky? | We quote exact public words with a link and timestamp, target the claim, and only name big posts. Never minors, never someone's own illness story. We don't re-upload their footage. |
| Why would creators pay? | A myth wave moves in days. The desk turns a trending myth into a sourced, approved script and video in one sitting, and the receipts page backs the creator up when people push back in the comments. |
| How is this different from fact-checking sites? | Fact-checkers publish articles. MyBuster helps creators answer in the same format, on the same platforms, with the evidence attached. |
| Why Jev and not just an LLM judge? | It returns calibrated probabilities and costs far less. OpenRouter measured 95.5% vs 94.3% for an LLM judge on 88 faithfulness checks, at about one fifth of the cost. We fall back to a GMI LLM judge if it's down. |
| Does it scale? | Oriane covers TikTok, Instagram and YouTube. Each myth is a batch job that can run in a GMI sandbox. Jev input costs $0.042 per million tokens and output is free. |
| What did Amplitude tell you? | Show the funnel and the vote split from the live demo. Don't claim more than the chart shows. |

## Compound Viral Award
If the debunk is good, post it through Compound as soon as it passes QA, ideally before 4:45 PM, and put the receipts link in bio. Confirm with the organizers how the 24 hours are counted.
