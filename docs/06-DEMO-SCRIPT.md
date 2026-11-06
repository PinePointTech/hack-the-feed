# Demo script (2 minutes 30 seconds)

Owner: Vi. This path is the scope. If a feature is not on it, it waits.

Setup before 5:20: demo laptop on power, brain running, caches warm, browser at 110% zoom, tabs open in this order: slide 1, `/desk`, `/desk/myth/lymphatic-detox`, studio, the exported MP4, `/r/lymphatic-detox` on the Vercel URL, Amplitude (User Lookup or the "MyBuster demo" dashboard), `/desk/impact/lymphatic-detox`. Phone ready to scan the QR yourself if judges don't.

| Time | Screen | Who | Say (short, plain) | Click |
|---|---|---|---|---|
| 0:00 | Slide 1 | Vi | "Half of U.S. adults under 50 get health advice from influencers or podcasters. In the last 30 days, 1,317 videos talked about lymphatic drainage and got 49.5 million views. Accounts with a clinician in their bio posted 63 of them, and their five biggest were promotions, not corrections. MyBuster finds the myth, gets the receipts and makes the debunk." | |
| 0:15 | `/desk` | Kris | "Oriane searched transcripts, captions and on-screen text. Jev, a small judge model, labels every video: promotes, debunks, ad or unrelated. That matters: our garlic and cancer search matched 59 videos and plenty were recipes. This one is harmful: it tells people to put garlic paste on a breast tumor, 2.1 million views." | Point at the harm chips |
| 0:40 | Myth page | Vi | "Exact words, timestamp, link. 'It's the easiest way to get inflammation out of the body, detox, and wake up.' Seven seconds in, 2.3 million views. We go after the claim, not the person." | Open lymphatic-detox |
| 1:00 | Studio | Vi | "The brief is built only from sources we fetched: UCLA Health and National Geographic. Each claim has a support score." Pick a hook. Then type: "Lymphatic drainage burns fat." | Edit line 3 |
| 1:15 | Studio | Kris | "Jev flags it right away: no source says this. The closest source says there is no evidence it causes weight loss." Undo the edit, it turns green. | Undo, tick checklist, Approve |
| 1:35 | MP4 | Vi | "Recorded and edited in Compound: cuts, captions, zooms, posted from the same app. Then GMI vision read every frame's on-screen text and checked it against the approved script." | Play 10 s, show the QA report |
| 1:55 | Receipts and QR | Vi | "Scan this. It's the receipts page. Tell us: did this change your mind?" | Show the QR slide |
| 2:05 | Amplitude | Vi | "Votes land in Amplitude as they come in. That's how a creator knows if a debunk works, not just if it got views." | Switch to Amplitude |
| 2:15 | Impact | Kris | "Our north star is response reach over myth reach. Creators pay for the desk, and next week's myths are already on a public calendar." | Open impact, then stop |

## Fallbacks
| If this fails | Do this |
|---|---|
| Brain down | Pages keep working on fixtures; say "this is the cached run" |
| Live `/check` slow or down | The demo line has a cached result (`contracts/fixtures/check.json`); say "cached" if the badge shows |
| Video won't play | Show 3 screenshots of the edit and the QA report |
| QR or Vercel down | Open receipts on localhost, vote from the laptop, show the Amplitude screenshot from rehearsal |
| Amplitude slow | Charts can lag a few minutes; show User Lookup for your own device, or the rehearsal screenshot |
| Over time | Skip the impact page. End on receipts and Amplitude |

## Rehearsal checklist
1. Run the whole path twice with a timer. Cut words, not steps.
2. Record a backup screen video of a full clean run.
3. Clear your own test votes from the story (use a fresh device for the live vote).
4. Every number you say is in `research/RESEARCH.md` or `research/ORIANE-FINDINGS.md`.
