# JobDiscovery System Context (for Cursor / New LLM)

## 1) Goal
Build a system that runs **as autonomously as possible** to:

1) **Discover new job postings daily** across the internet that match my target roles (Strategy & Operations, BizOps, Head of Business Ops/Strategy, Strategic Finance, GM, Chief of Staff, etc.) across ATS domains.  
2) Store them in a structured tracker (Google Sheet initially; may migrate to DB later).  
3) **Enrich** each role with job description text + key fields.  
4) Compute a **fit score** and rank results so I can quickly review and apply.  
5) On demand, generate **draft responses** to free text application questions.

Constraints:
- Prefer a **free/cheap MVP** first.
- Don’t rely on brittle scraping of Google SERPs.
- Avoid dead ends like Google Custom Search JSON API gating.

---

## 2) Summary of What We Tried and Learned

### 2.1 Google Custom Search JSON API (failed / dead end)
Attempted to use Google Programmable Search Engine + Custom Search JSON API to run `site:jobs.lever.co ...` queries via API.

- Created PSE and got `cx`.
- Enabled Custom Search API, created keys, linked billing.
- Still got persistent 403 `PERMISSION_DENIED`: “This project does not have access to Custom Search JSON API.”
- Conclusion: for new accounts, JSON API access appears gated/unreliable. Abandoned.

### 2.2 Google Alerts (technically possible, operationally unreliable)
- Set up Google Alerts for:
  - `site:jobs.lever.co`
  - `site:jobs.ashbyhq.com`
  - `site:boards.greenhouse.io`
- Alerts did not deliver reliably/quickly; “as-it-happens” was not a live feed.
- We proved we can ingest email content and parse URLs using Apps Script + GmailApp, but relying on Alerts as the main discovery source is too slow / uncertain.

### 2.3 Brave Search API (successful for discovery)
Brave Search API “Search” endpoint used as the discovery engine.

- Created a Brave API key (called “subscription token”) and stored it in Apps Script Script Properties.
- Successfully ran a smoke test query via Apps Script using:
  - `https://api.search.brave.com/res/v1/web/search?q=...&count=...&offset=...`
  - Header: `X-Subscription-Token: <token>`
- Brave returns JSON results including URLs/titles/snippets.
- This is the correct replacement for Google Search API for our use case.

**Important Brave constraints discovered:**
- Web Search `count` must be **<= 20**
- Web Search `offset` must be **0–9** (page number, not a start index)
- Violating these yields HTTP 422 VALIDATION errors: “Unable to validate request parameter(s).”

---

## 3) Current MVP Architecture (implemented in Google Apps Script)

### 3.1 Google Sheet tabs
- `Roles`: main data table
- `Logs`: append-only logs for each run

Roles columns evolved over time; minimum working schema (should standardize):

- `canonical_url`
- `company`
- `job_title`
- `source` (brave_search, google_alert, test_email, manual_test)
- `discovered_date`
- `status` (New, Enriched, Dead, FetchError)
- `query` (the search query used)
- `ats` (lever/ashby/greenhouse)

Enrichment columns added:
- `jd_text`
- `location_raw`
- `work_mode_hint`
- `fetched_at`
- `http_status`
- `failure_reason`

Scoring columns added:
- `fit_score`
- `fit_notes`
- `dealbreaker_flag`
- `location_us_ok`
- `comp_ok`
- `work_mode_final`
- `rank_key`

### 3.2 Pipeline steps (“Gates”)
We worked in gates (prove each step works before scaling):

**Gate 0:** Apps Script writes to Sheets (passed).

**Gate 1:** Gmail → URL extraction → sheet (passed).
- Discovered issues:
  - `URL` class in Apps Script caused failures; replaced URL parsing with string-based canonicalization.
  - Need to extract URLs from both `href=` and raw text.
  - Signature links get ingested unless domain-filtered.

**Gate 1B:** Brave Search API call from Apps Script returns results (passed).

**Gate 2:** Fetch a Lever job page and extract job description text (passed).
- Logger truncated output; full text was present (`textLen` confirmed).

**Gate 3A:** Discovery: Brave → write URLs into Roles (passed).
- Dedupe by `canonical_url`.
- Filtered URLs to canonical Lever pattern: `https://jobs.lever.co/<company>/<uuid>` to avoid junk.
- High volume ingestion works; discovered that many search results are stale.

**Gate 3B:** Enrichment: For `status=New` rows, fetch job pages and extract `jd_text` (passed).
- Reality: many URLs are stale/closed → HTTP 404 (common, expected).
- Improved logic:
  - Mark 404 as `Dead` and do not retry.
  - Only mark `Enriched` when http=200 and text looks real (min length threshold, avoid “Not found” pages, avoid demo boards like Democorp).
- Enrichment throughput: ~25 per run takes ~1 minute.

**Gate 4:** Scoring (v0 heuristic) (passed).
- Title-based scoring + seniority adjustments added.
- Discovered scoring false negatives for US location detection and compensation extraction.
- Scoring is okay for MVP but needs tuning and separation between “soft penalties” and “dealbreaker” logic.

---

## 4) What Broke Recently (verified and fixed)
When attempting to “scale sources” (add Ashby + Greenhouse) we introduced a generic search function that:
- used `count=50` and `offset=page * count` (invalid for Brave),
- causing HTTP 422 validation errors.

Also, multiple implementations of `gate3A_braveSearchToRoles_lever()` ended up in the same file, so later definitions overrode earlier working ones.

**Verified root cause:** Brave Web Search allows `count` 1–20 and `offset` as page index 0–9 only. The generic used `count=50` and `offset=page*count`, causing HTTP 422. The second `gate3A_braveSearchToRoles_lever()` in the file overrode the first, so the broken generic was the one run. Additional fixes: `getColumnValues_()` range (wrong column end; now uses `lastRow, colIndex`), `rolesHasUrl_()` and data reads (were using `lastRow - 1`, now `lastRow`). **Fixes applied in Cursor:** `braveSearchToRoles_generic_()` now caps count at 20, uses offset=page (0..9), pages capped at 10; callers pass count:20, pages:7 or 5. First Lever implementation renamed to `gate3A_braveSearchToRoles_lever_standalone()`. Pipeline restored; copy JobDiscovery.ts to Apps Script to run.

---

## 5) Desired Next State
A daily scheduled run that:

1) Runs Brave searches across multiple sites + keywords:
   - `jobs.lever.co`
   - `jobs.ashbyhq.com`
   - `boards.greenhouse.io`
   - (LinkedIn is hard to automate; may be excluded or handled separately)
2) Writes discovered URLs into Roles with dedupe.
3) Enriches new rows by fetching job pages and extracting JD text + location/work-mode hints.
4) Computes fit score and ranks.
5) Produces a “Shortlist” view for quick review/application.

System should be robust against:
- stale search results (404)
- demo boards
- inconsistent job page formats
- missing fields like comp/posted date.

**Later consideration:** Whether to use or surface older search results (e.g. beyond “recently posted”) to get a more comprehensive view of currently available jobs, rather than only the most recently indexed/posted ones. Tradeoffs: freshness vs. coverage; may require different Brave params or a separate “backfill” pass.

---

## 6) Implementation Guidance for Cursor Migration
Migrating out of Apps Script to Cursor so:
- AI can see entire codebase in IDE,
- version control via GitHub,
- easy revert when things break.

### Recommended repo structure (proposed)
- `src/search/brave.ts` (or `.py`) — Brave Search client
- `src/discovery/queries.ts` — query definitions by ATS + keyword set
- `src/storage/sheets.ts` or `src/storage/sqlite.ts` — storage layer
- `src/enrich/fetch.ts` — fetch job pages with retries/backoff
- `src/enrich/parsers/lever.ts`, `greenhouse.ts`, `ashby.ts` — parsers
- `src/score/score_v0.ts` — heuristic scoring
- `src/run/daily.ts` — orchestrator
- `src/run/scheduler.ts` — scheduling (GitHub Actions cron or local cron)

### Minimal MVP path in Cursor
1) Recreate Brave search call (working) with constraints:
   - `count <= 20`
   - `offset in [0..9]`
2) Implement `discover()` for Lever only first; write to local SQLite or to Google Sheet via API.
3) Implement `enrich()` for discovered URLs; mark 404 as Dead; store `jd_text`.
4) Implement scoring v0 and rank.
5) Add Ashby + Greenhouse discovery functions and later their enrichment/parsers.
6) Add scheduled execution (GitHub Actions Cron recommended):
   - daily run
   - outputs: updated sheet/db and optionally an emailed summary.

---

## 7) Known Heuristics / Rules We Want

### Hard preferences / constraints
- US-only roles (postings often omit clean location fields, so treat location as UNKNOWN unless explicit).
- Seniority not below Senior Manager (but “Lead” can be senior depending on company).

### Comp preference
- If salary range is listed, prefer >= $180k base (soft penalty or dealbreaker depending on preference; but do not penalize unknown).

### Work mode
- Any is okay, remote/hybrid preferred; optional penalty for explicit “5 days in office”.

### Dealbreakers (high confidence only)
- Explicit non-US location requirement.
- Others TBD (clearances, etc.).

---

## 8) Specific Bugs / Lessons to Preserve
- Apps Script `new URL()` was unreliable; string canonicalization worked better.
- Parsing URLs from email requires extracting both raw URLs and `<a href=...>`.
- Search index results contain stale job URLs; 404 rates can be ~40–60%.
- Treat 404 as Dead and stop retrying.
- Brave paging is strict: offset is page number 0..9, count <= 20.
- **FetchError TEXT_TOO_SHORT:** We couldn’t get enough JD text (e.g. Ashby API mismatch, JS-rendered page, thin page). We treat as retryable: use `gate3B_resetTextTooShortToNew()` then re-run Gate 3B; we do not auto-retry.
- **Which rows came from which run:** `fetched_at` = when we last attempted this row (set for every row we process, success or fail). Rows touched in the same run share the same `fetched_at`. `enriched_at` = when we successfully enriched (only set for Enriched rows). Sort by `fetched_at` descending to see recent runs; filter by `failure_reason` to isolate TEXT_TOO_SHORT, etc.

---

## 9) Current State of the Sheet / Progress
At peak working state (Lever-only):
- Ingested ~70 Lever URLs into Roles.
- Enriched ~34 roles with JD text.
- Scored those roles with a heuristic model; tuning in progress.
- Many discovered URLs failed enrichment due to 404 and were marked Dead.

After attempting multi-source, Brave returned HTTP 422; this was fixed (see §4). Pipeline is restored: run `gate3A_braveSearchToRoles_lever()` (or `gate3A_runAllSources_daily()`), then Gate 3B enrich, then Gate 4 score.

---

## 10) Request to the New Cursor LLM (partially done)
1) ~~Load the repo and identify where Brave search calls are made.~~  
2) ~~Fix Brave pagination: enforce `count<=20`, `offset 0..9`.~~  
3) ~~Ensure Lever-only pipeline works end-to-end again (discover → enrich → score).~~  
4) Ashby and Greenhouse use the fixed generic; run `gate3A_runAllSources_daily()` to test.  
5) Add versioned configuration for query sets (e.g., YAML/JSON) — not yet done.  
6) Add a “daily orchestrator” and optionally GitHub Actions cron workflow — not yet done.  
7) Keep changes incremental and testable (“gates”) so we don’t lose time to dead ends.

---

## Appendix: Example Brave request (known-good)
- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Headers:
  - `Accept: application/json`
  - `X-Subscription-Token: <token>`
- Params:
  - `q=<site query>`
  - `count=5..20`
  - `offset=0..9`
  - optional: `country=us`, `search_lang=en`, `freshness=pd/pw` (can be finicky; use cautiously)