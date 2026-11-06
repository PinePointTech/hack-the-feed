# Myth catalog

Owner: Kris. Seeds for the radar. Each myth lists the Oriane phrases, the sources we already verified, and the videos we can quote. Never add a source here that you have not fetched yourself.

## Demo myths

### lymphatic-detox (demo path)
- Topic phrase (exact, T/C/O): "lymphatic drainage"
- Claim phrases (fuzzy, T/C): "lymphatic detox", "lymphatic toxins", "lymphatic debloat", "lymphatic weight loss", "lymphatic flush"
- Claim: lymphatic drainage pulls toxins out of the body and causes fat or weight loss.
- Harm tier draft: false. Not described as harmful; sells a false promise.
- Verified sources:
  - UCLA Health, "Lymphatic drainage massage - separating fact from fiction", https://www.uclahealth.org/news/article/lymphatic-drainage-massage-separating-fact-fiction
    - "The problem is there is no substantial scientific evidence supporting these claims."
    - "Lymphatic massage can reduce swelling and give the temporary appearance of slimmer, tighter skin. However, there is no evidence that MLD causes weight loss."
    - "MLD plays a critical role in treating lymphedema"
  - National Geographic, "What lymphatic drainage massage actually does for your body", https://nationalgeographic.com/health/article/lymphatic-drainage-massage-therapy-wellness (quotes Rockson)
    - "it has nothing to do with weight loss."
    - "The claims that lymphatic massage can get rid of toxins are unfounded as well, adds Rockson."
    - "isn't harmful, adds Rockson, but it won't necessarily have the long-term detoxifying effects that some influencers promise."
  - Lead to verify (title only, conclusion not read): "Effects of manual lymphatic drainage on breast cancer-related lymphedema: a systematic review and meta-analysis of randomized controlled trials", World Journal of Surgical Oncology, https://pubmed.ncbi.nlm.nih.gov/23347817/. Fetch the abstract with `efetch` before using it.
- Quotable: tulumtrainer (see `ORIANE-FINDINGS.md`).

### garlic-tumor (harmful example)
- Topic (exact, T or C): "garlic" AND ("tumor" or "tumors" or "cancer")
- Claim: garlic destroys cancer tumors, and a garlic paste put on a tumor can treat it instead of standard care.
- Harm tier draft: harmful. The video tells viewers to put a garlic paste on a breast tumor and frames chemo and radiation as deadly.
- Verified sources: none yet. Kris: search PubMed and allowlisted pages (for example MedlinePlus or the NIH), fetch, and only then add them here.
- Quotable: barlowherbal, written as "from a video posted by @barlowherbal" because the speaker is Dr. Richard Schulze.

### mouth-taping (unproven example)
- Topic (exact, T/C/O): "mouth taping", "mouth tape", "tape my mouth", "taping my mouth"
- Claim: taping your mouth shut at night is a proven fix, including for a sharper jawline.
- Harm tier draft: unproven, with a safety warning.
- Verified source: PLoS One 2025;20(5):e0323643, "Breaking social media fads and uncovering the safety and efficacy of mouth taping...", https://pubmed.ncbi.nlm.nih.gov/40397877/ (10 studies, 213 patients)
  - "there is a potentially serious risk of harm for individuals indiscriminately practicing this trend"
  - "Further studies are required to elucidate any clinical benefit"
  - risk named: "asphyxiation in the presence of nasal obstruction"
- Quotable: mari.aranaa.

## Candidate myths (counts only, claims not reviewed)
| Topic | Oriane count (since Oct 7) | Match |
|---|---|---|
| Sea moss | 659 videos, 19.4M views | exact |
| Castor oil packs, belly button oiling | 239 videos, 18.1M views | fuzzy |
| Berberine as "nature's Ozempic" | 445 videos, 11.2M views | fuzzy |
| Parasite cleanses | 325 videos, 10.1M views | fuzzy |
| Cortisol face, belly, detox, cocktail | 69 videos, 4.6M views | exact |
| Tallow skincare | 154 videos, 2.6M views | exact |
| Sunscreen is toxic and similar phrases | 82 videos, 4.9M views (since May 1) | exact |

## Curated watchlist (no data yet, label as curated)
- Cold and flu remedies, Nov 9 to Nov 15, 2026 (cold and flu season).
- Thanksgiving food and sleep claims, Nov 23 to Nov 29, 2026 (Thanksgiving is Nov 26).

## Rules for adding a myth
1. Pick exact phrases, test the count with `projection: basic`, and record the query in `ORIANE-FINDINGS.md`.
2. Label stance on the top 30 before showing any claim count.
3. Add sources only after fetching them; excerpts must be verbatim.
