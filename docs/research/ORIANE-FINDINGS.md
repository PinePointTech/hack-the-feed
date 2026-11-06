# Oriane findings

Owner: Kris. Every Oriane number we use, with the exact query. All searches ran on Nov 6, 2026 via the Oriane MCP `search_contents` tool, sorted by `viewsCount` desc. "Fields T/C/O" means the same filter on transcript, caption and on-screen text, combined with `or`. Window "since Oct 7" means `publishedAt.after = 2026-10-07` with no upper bound (through Nov 6).

## Topic counts
| Query name | Match | Fields | Window | Videos | Views | Interactions |
|---|---|---|---|---|---|---|
| lymphatic_exact | exact "lymphatic drainage" | T/C/O | since Oct 7 | 1,317 | 49,537,321 | 2,187,479 |
| lymphatic_exact_prev | exact "lymphatic drainage" | T/C/O | Sep 7 to Oct 6 | 1,688 | 95,767,171 | 2,790,010 |
| lymphatic_drainage (fuzzy) | fuzzy "lymphatic drainage" | T/C/O | since Oct 7 | 1,878 | 64,906,122 | 2,842,838 |
| lymphatic_myth_claims | fuzzy "lymphatic toxins", "lymphatic detox", "lymphatic debloat", "lymphatic weight loss", "lymphatic flush" | T/C | since Oct 7 | 364 | 17,910,579 | 946,248 |
| lymphatic_clinician_voices | exact "lymphatic drainage" (T/C/O) AND bio fuzzy physician, doctor, MD, nurse, physical therapist, lymphedema, dermatologist, surgeon | T/C/O plus bio | since Oct 7 | 63 | 1,228,159 | 60,144 |
| mouth_tape_exact | exact "mouth taping", "mouth tape", "tape my mouth", "taping my mouth" | T/C/O | since Oct 7 | 199 | 8,304,973 | 489,088 |
| mouth tape, transcript only | exact same phrases plus "tape your mouth" | T | since Oct 7 | 65 | 2,929,555 | 167,171 |
| mouth_taping (fuzzy) | fuzzy "mouth tape", "mouth taping", "tape your mouth" | T/C/O | since Oct 7 | 892 | 60,437,432 | 3,971,633 |
| garlic_tumor (new) | exact "garlic" (T or C) AND exact "tumor", "tumors" or "cancer" (T or C) | T/C | Oct 7 to Nov 6 | 59 | 5,768,385 | 329,977 |
| sea_moss_exact | exact "sea moss" | T/C/O | since Oct 7 | 659 | 19,432,612 | 1,592,810 |
| sea_moss (fuzzy) | fuzzy "sea moss" | T/C/O | since Oct 7 | 3,130 | 179,850,460 | 11,167,779 |
| cortisol_exact | exact "cortisol face", "cortisol belly", "cortisol detox", "cortisol cocktail" | T/C/O | since Oct 7 | 69 | 4,636,041 | 203,966 |
| cortisol (fuzzy) | fuzzy "cortisol face", "cortisol belly", "cortisol detox", "lower cortisol" | T/C/O | since Oct 7 | 1,232 | 49,022,258 | 4,201,213 |
| tallow_skin_exact | exact "tallow balm", "tallow skincare", "tallow on my face", "beef tallow for skin", "tallow moisturizer" | T/C/O | since Oct 7 | 154 | 2,639,652 | 119,064 |
| beef_tallow (fuzzy) | fuzzy "beef tallow", "tallow skincare", "tallow balm" | T/C/O | since Oct 7 | 1,500 | 70,394,514 | 4,065,556 |
| castor_oil (fuzzy) | fuzzy "castor oil belly button", "castor oil navel", "castor oil pack", "castor oil detox" | T/C/O | since Oct 7 | 239 | 18,146,452 | 927,539 |
| parasite_cleanse (fuzzy) | fuzzy "parasite cleanse", "parasite detox", "parasites cleanse" | T/C/O | since Oct 7 | 325 | 10,125,946 | 493,929 |
| berberine (fuzzy) | fuzzy "berberine", "nature's ozempic" | T/C/O | since Oct 7 | 445 | 11,195,302 | 467,476 |
| sunscreen_myth_phrases | exact "sunscreen is toxic", "sunscreen causes cancer", "sunscreen is poison", "stopped wearing sunscreen", "don't wear sunscreen", "tallow as sunscreen" | T/C/O | since May 1 | 82 | 4,869,446 | 171,519 |

## Derived numbers
- Lymphatic trend: (1,317 minus 1,688) / 1,688 = -22% in video count; views fell from 95.8M to 49.5M.
- Clinician share of the lymphatic topic: 63 / 1,317 = 4.8% of videos; 1,228,159 / 49,537,321 = 2.5% of views. Our manual read of the five biggest clinician-bio videos: promotions, not corrections (beautyshamans, a former cosmetic nurse; dermatologist_adel; lencirsignature; nayakplasticsurgery).
- Fuzzy vs exact: fuzzy "sea moss" returns 4.7 times as many videos as exact. Count with exact phrases.

## Videos we quote (verified with projection full)
| Handle | Platform and id | Oriane id | Views | Followers | Published (UTC) | Exact quote | Start |
|---|---|---|---|---|---|---|---|
| tulumtrainer (Kate Nolte) | Instagram reel DeM2Kywtwcj | cnt_8bf297ba22d2c059c502b32dbf53 | 2,298,948 | 656,165 | 2026-10-07 17:00 | "It's the easiest way to get inflammation out of the body, detox, and wake up." | 7.44 s (chunk 7.44 to 14.48) |
| barlowherbal (Jane Barlow) | Instagram reel DeUEusVxZr7 | cnt_a82665807e1dc2ba6408b2459b72 | 2,144,856 (70,681 shares) | 142,264 | 2026-10-10 12:26 | "Garlic's been proven in medical industries in this country to destroy cancer tumors, period." | 55.72 s (spans two chunks) |
| mari.aranaa | TikTok 7694724543407017247 | cnt_1e7ab58965e07050f870cfe108f8 | 241,700 | 98,694 | 2026-10-09 17:41 | "I feel like it really has helped me with like snatching my jaw because you sleep with your mouth closed and it really helps." | chunk starting 58.54 s; on-screen "3. mouth tape WORKS!!" at 56.23 s |

Notes:
- barlowherbal: the speaker is Dr. Richard Schulze in a 1993 video series, per the caption; the account reposted the clip. It is not about the account owner's own illness, so naming passes. The same account posted it again on Oct 22 (cnt_c12af54040a1fa700b2fa9878f8b, 381,350 views). The transcript also says "You put it on a tumor and it'll burn that tumor and it'll burn the skin around it" and, about chemo and radiation, "I know that would have killed her."
- tulumtrainer's caption is about jump training and promotes a paid program; the detox claim is in the spoken transcript.
- mari.aranaa's bio says "NYU grad", so the adult check passes.
- Other videos from earlier notes (Oriane ids not captured): charlenechew3005, TikTok 7699011335610256658, 1,900,000 views, 19,800 shares, 287,900 followers, published 2026-10-21 06:56 UTC, caption contains "moves waste products like mucus through" and "you get snatched"; jazzpassley_, Instagram DfGQgRDsDdQ, 1,229,210 views, 161,622 followers, #debloat.

## Garlic query, top results (why stance labels matter)
barlowherbal (2,144,856 views, promotes), doctors_kitchen (792,668, a recipe), drlisaballehr (522,991, research on body odor and cancer that says the smells do not mean cancer), barlowherbal repost (381,350), juiceprncess (178,504, a juice recipe).
