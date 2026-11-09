// MyBuster API contracts v1
// Shared by apps/web (Vi) and services/brain (Kris). Frozen at 3:00 PM PT, Nov 6, 2026.
// After the freeze: only add OPTIONAL fields, announce in team chat first, Kris commits the change.
// The brain mirrors these in services/brain/app/schemas.py (pydantic v2). JSON keys are snake_case on both sides.
// A fixture for every response lives in contracts/fixtures/.

// ---------- enums ----------
export type HarmTier = "harmful" | "false" | "unproven";
// harmful: could hurt someone or delay real care. false: good evidence says it is wrong. unproven: no good evidence it works.
export type Trend = "rising" | "steady" | "cooling" | "unknown";
export type Platform = "tiktok" | "instagram" | "youtube";
export type Stance = "promotes" | "debunks" | "neutral" | "ad" | "unrelated";
export type QuoteSource = "transcript" | "caption" | "on_screen_text";
export type Format = "stitch" | "duet" | "standalone" | "no_camera";
export type HookStyle = "question" | "myth_quote" | "stat" | "pov" | "stitch_reaction";
export type SupportStatus = "supported" | "weak" | "unsupported"; // support >= 0.8 | 0.5 to 0.8 | < 0.5
export type Engine = "jev" | "gmi_judge" | "cached";
export type DataSource = "oriane_live" | "oriane_snapshot";

export interface DateWindow {
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
}

// ---------- radar ----------
export interface VideoRef {
  oriane_id: string;
  platform: Platform;
  url: string;
  handle: string; // no leading @
  display_name?: string;
  followers?: number;
  views: number;
  shares?: number;
  interactions?: number;
  published_at: string; // ISO datetime
  thumbnail_url?: string;
  quote: string; // exact words from the post, never paraphrased
  quote_source: QuoteSource;
  quote_start_s?: number; // seconds into the video, when quote_source = "transcript"
  stance: Stance;
  stance_confidence?: number; // 0..1
  nameable: boolean; // naming policy passed: 100k+ views or 50k+ followers, not a minor, not their own illness
}

export interface MythSummary {
  id: string; // slug, e.g. "lymphatic-detox"
  title: string; // short, sentence case
  topic: string; // the Oriane phrase, e.g. "lymphatic drainage"
  claim: string; // the claim in one neutral sentence
  harm_tier: HarmTier;
  harm_reason: string;
  trend: Trend;
  trend_pct?: number; // change in topic video count vs the previous window, e.g. -22
  window: DateWindow;
  topic_video_count: number;
  topic_views: number;
  prev_window?: DateWindow;
  prev_topic_video_count?: number;
  prev_topic_views?: number;
  claim_video_count?: number; // videos inside the topic that match the claim keywords
  claim_views?: number;
  claim_interactions?: number;
  top_video?: VideoRef;
  match_note: string; // how we matched, shown in the UI
  data_source: DataSource;
  snapshot_at: string; // ISO datetime
}

export interface Radar {
  generated_at: string;
  window: DateWindow;
  myths: MythSummary[];
}

export interface MythDetail extends MythSummary {
  videos: VideoRef[]; // promoters, highest views first
  counter_voices: VideoRef[]; // stance = "debunks"
  stance_counts: Partial<Record<Stance, number>>;
  stance_sample_size?: number;
  clinician_share?: {
    videos: number;
    views: number;
    video_pct: number;
    view_pct: number;
    note: string;
  };
}

// ---------- evidence and brief ----------
export interface Source {
  id: string; // "s1"
  title: string;
  publisher: string;
  url: string;
  kind: "review" | "trial" | "guideline" | "health_system" | "journalism" | "other";
  published?: string;
  pmid?: string;
  excerpts: string[]; // each one an exact substring of the fetched page or abstract
  fetched_at: string;
}

export interface Evidence {
  source_id: string;
  excerpt: string; // one of that source's excerpts, verbatim
}

export interface ClaimCheck {
  id: string; // "c1"
  text: string;
  evidence: Evidence[];
  support: number; // 0..1 from the judge
  status: SupportStatus;
  engine: Engine;
}

export interface Hook {
  id: string;
  style: HookStyle;
  text: string;
}

export interface ScriptLine {
  id: string; // "l1"
  text: string;
  claim_id?: string; // set when the line states a health fact
  on_screen?: string; // overlay text for this line
  source_id?: string; // source to cite on screen
}

export interface Script {
  format: Format;
  duration_s: number;
  lines: ScriptLine[];
  caption: string;
  cta: string;
}

export interface Brief {
  myth_id: string;
  verdict: string;
  what_is_true: string[];
  what_is_false: string[];
  sources: Source[];
  claims: ClaimCheck[];
  hooks: Hook[];
  script: Script;
  models: { drafter: string; judge: string };
  generated_at: string;
}

export interface BriefRequest {
  myth_id: string;
  format: Format;
  refresh?: boolean;
}

// ---------- live check ----------
export interface CheckRequest {
  myth_id: string;
  lines: { id: string; text: string }[];
}

export interface LineCheck {
  line_id: string;
  has_claim: boolean;
  support?: number; // only when has_claim
  status?: SupportStatus; // only when has_claim
  evidence?: Evidence[];
  engine: Engine;
  note?: string; // e.g. "No source says this"
}

export interface CheckResponse {
  results: LineCheck[];
}

// ---------- video QA ----------
// POST /qa is multipart/form-data with fields: myth_id, approved_lines (JSON string of ScriptLine[]), file (mp4)
export interface QAIssue {
  t_s: number;
  found_text: string;
  expected_line_id?: string;
  problem: "text_not_in_script" | "unsupported_claim" | "missing_source" | "typo";
  support?: number;
}

export interface QAReport {
  myth_id: string;
  frames_checked: number;
  texts_found: number;
  issues: QAIssue[];
  pass: boolean;
  models: { vision: string; judge: string };
  ran_in: "local" | "gmi_sandbox" | "cached";
  duration_ms?: number;
}

// ---------- publish ----------
export interface ApprovalChecklist {
  every_claim_has_source: boolean;
  quotes_are_exact: boolean;
  targets_claim_not_person: boolean;
  no_minors_or_illness_stories: boolean;
  video_qa_passed: boolean;
  approved_by: string;
  approved_at: string;
}

export interface Clinician {
  name: string;
  npi?: string;
  verified: boolean;
}

export interface PublishRequest {
  myth_id: string;
  brief: Brief; // final, with the edited script
  approval: ApprovalChecklist;
  video_url?: string;
  clinician?: Clinician;
}

export interface PublishedDebunk {
  id: string; // same as myth_id
  myth: MythSummary;
  quoted: VideoRef[]; // nameable videos only
  verdict: string;
  what_is_true: string[];
  what_is_false: string[];
  sources: Source[];
  claims: ClaimCheck[];
  script: Script;
  video_url?: string;
  approval: ApprovalChecklist;
  certified_by_clinician: boolean; // the only label we show, and only when a clinician verified it
  clinician?: Clinician;
  published_at: string;
}

// ---------- impact and calendar ----------
export interface Impact {
  myth_id: string;
  generated_at?: string; // ISO datetime the numbers were pulled; when the brain computed it
  window: DateWindow;
  myth_reach: { videos: number; views: number }; // stance = promotes
  response_reach?: { videos: number; views: number }; // stance = debunks
  response_ratio?: number; // response views / myth views (the north star)
  baseline_clinician?: { videos: number; views: number; note: string };
  hours_spike_to_first_response?: number;
  our_debunk?: {
    views?: number;
    votes_yes?: number;
    votes_total?: number;
    source: "amplitude" | "compound" | "manual";
  };
  note: string;
}

export interface CalendarItem {
  topic: string;
  myth_id?: string;
  harm_tier?: HarmTier;
  trend?: Trend;
  window: string; // "Nov 9 to Nov 15, 2026"
  basis: "oriane_trend" | "curated";
  why: string;
  video_count?: number;
  views?: number;
  script_available: boolean;
}

export interface Calendar {
  generated_at?: string; // ISO datetime the calendar was pulled; when the brain computed it
  week_of: string; // ISO date of the Monday
  this_week: CalendarItem[];
  watchlist: CalendarItem[];
}

// ---------- live feed ----------
// GET  /feed?since=<ISO8601>&limit=<1..100, default 50> -> Feed (posts within 72 h of data_through first, newest first; then views gained per hour; then views; unrelated last)
// POST /poll -> PollResult (runs only if POLL_INTERVAL_MINUTES, default 15, passed since the last poll start)
export interface Feed {
  generated_at: string; // ISO 8601
  last_poll_at: string | null;
  next_poll_at: string | null;
  data_through?: string | null; // ISO 8601, newest published_at stored: how far Oriane's search runs
  posts: {
    oriane_id: string;
    platform: Platform;
    url: string | null;
    handle: string | null;
    display_name: string | null;
    thumbnail_url: string | null;
    views: number | null;
    published_at: string | null;
    fetched_at: string;
    snippet: string; // exact words from the Oriane text
    snippet_source: "transcript" | "caption" | "on_screen" | null;
    matched_query: string;
    label: null | { // null until the labeler (T2) runs
      health_claim: boolean;
      myth_id: string | null;
      stance: "promotes" | "debunks" | "ad" | "unrelated";
      confidence: number; // 0 to 1
      model: string;
    };
  }[];
}

export interface PollResult {
  ran: boolean;
  last_poll_at: string | null;
  next_poll_at: string | null;
  new_posts: number;
}

// The labeler (T2) fills Feed post labels after each poll. A label's myth_id is a built-in myth, a
// confirmed myth or a candidate. Candidates never confirm themselves.
// GET  /myths/candidates      -> MythCandidates (most posts first)
// POST /myths/{id}/confirm    -> ConfirmedMyth (404 myth_not_found for an unknown ID; confirming twice is a no-op)
export interface MythCandidates {
  candidates: {
    id: string; // slug of the watchlist phrase that matched
    title: string; // that watchlist phrase
    claim: string; // exact sentence from the first post that raised it
    status: "candidate";
    source_oriane_id: string | null;
    created_at: string;
    confirmed_at: null;
    post_count: number; // labeled posts pointing at this candidate
  }[];
}

export interface ConfirmedMyth {
  id: string;
  title: string;
  claim: string;
  status: "confirmed";
  source_oriane_id: string | null;
  created_at: string;
  confirmed_at: string;
}

// ---------- misc ----------
export interface Health {
  ok: boolean;
  oriane: boolean;
  gmi: boolean;
  jev: boolean;
  version: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

// ---------- endpoints (brain, default http://localhost:8000) ----------
// GET  /health                      -> Health
// GET  /radar?refresh=0|1           -> Radar
// GET  /myths/{id}                  -> MythDetail
// POST /brief    BriefRequest       -> Brief            (cached per myth + format; a cold run can take about 45 s)
// POST /check    CheckRequest       -> CheckResponse    (target under 3 s)
// POST /qa       multipart          -> QAReport
// POST /publish  PublishRequest     -> PublishedDebunk  (also writes data/published/{id}.json)
// GET  /published/{id}              -> PublishedDebunk
// GET  /impact/{id}                 -> Impact
// GET  /calendar                    -> Calendar
// GET  /npi/{number}                -> Clinician        (stretch)
// Errors: any non-2xx response carries an ApiError body.
