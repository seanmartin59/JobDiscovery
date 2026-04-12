# JobDiscovery Project Plan

**Purpose:** Living document to prioritize, sequence, and track progress. Update as we complete items and add new goals.

**Scope of this document:** Comprehensive project plan for the JobDiscovery system. Covers discovery sources, enrichment, scoring, application workflows, and company targeting. Updated continuously as items are completed and priorities shift.

---

## Broader project context

- **Goal:** System that runs as autonomously as possible to (1) discover new job postings matching target roles (Strategy & Operations, BizOps, Head of Business Ops/Strategy, Strategic Finance, Chief of Staff, etc.) across multiple sources, (2) store in a structured tracker (Google Sheet), (3) enrich with JD text + key fields, (4) compute fit score and rank, (5) on demand generate draft responses to application questions, (6) monitor target companies for new openings, (7) support follow-up and cold outreach workflows.
- **Constraints:** Free/cheap MVP first; no brittle SERP scraping; Google Apps Script runtime (6-min limit); avoid dead ends.
- *Expanded vision and roadmap captured under P4 item 4 below.*

---

## Where we are (Feb 2026)

**Current state:** Three discovery sources operational, full pipeline working end-to-end.

**Discovery sources (Gate 3A / Gate 1):**
- **SerpAPI Google Jobs (primary, done):** 4 keyword-group queries, no date filter, ~8-10 credits/run. Run weekly. ~114 roles discovered. Catch-up complete.
- **LinkedIn job alerts (done):** `gate1_ingestLinkedInAlerts()` parses Gmail for LinkedIn alert emails, extracts title/company/location/URL. First run: 46 new roles from 11 emails. Free, zero API credits. Captures LinkedIn-exclusive listings and personalized recommendations.
- **Brave Search (legacy, still available):** Original discovery source. Superseded by SerpAPI for primary use due to stale index (61% of roles dead on apply). Code retained for ad-hoc use.
- **ATS feeds (available, underutilized):** Per-company polling of Lever/Ashby/Greenhouse APIs. Infrastructure built with batching. Limited value without curated company list; will become powerful once target company list exists (#9).

**Enrichment (Gate 3B):** Fetches JD text from job URLs. Handles Ashby API, LinkedIn public pages, Lever/Greenhouse HTML. JD noise truncation strips LinkedIn sidebar content. Batch cap: 120 rows/run. Sources: `brave_search`, `ats_feed`, `serpapi_google_jobs`, `linkedin_alert`.

**Scoring (Gate 4):** Heuristic v0. Scores all Enriched + TEXT_TOO_SHORT rows. Title matching, keyword analysis, location/work-mode signals, comp extraction. No cap on rows scored.

**Sheet:** ~500+ roles across all sources. ~21 columns. Roles + Logs sheets.

**Known limitations:**
- SerpAPI: Google Jobs caps at ~10-20 results per query. 4 queries x ~10 = ~40 results per run; dedup means weekly runs add fewer over time.
- LinkedIn alerts: Volume depends on LinkedIn's algorithm; not exhaustive.
- Enrichment: ~25% of SerpAPI roles fail with HTTP_403 (aggregator sites block scraping). LinkedIn roles mostly succeed (public pages accessible).
- Scoring: Location rules not yet refined (P0 #10). JD noise from already-enriched LinkedIn roles not cleaned (only future enrichments use truncation).

---

## Priority overview

| P | Meaning | Items |
|---|--------|--------|
| **P0** | Fix now (incorrect behavior) | 10 (location scoring -- analysis done, implementation deferred) |
| **P1** | Foundation (done) | 1 (plan file), 2 (search criteria), 5a-5h (discovery analysis), 12 (Cursor warnings) |
| **P2** | Scoring & prioritization | 3 (scoring notes), 9 (similar companies -- see P4 #9), 11 (scoring audit), 13 (applied/archived scoring) |
| **P3** | Workflows & scripts | 5 sync (Falcon), 6 (custom answers) |
| **P4** | Vision, scale, new sources | 4 (roadmap), 7 (LinkedIn -- **done**), 7b (ATS URL resolver), 8 (scalability), 9 (target companies) |

---

## P0 -- Fix now

### 10. Scoring bug: incorrect "Non-US location" penalty (and follow-up: overcorrection)
- **Issue:** e.g. Whatnot Ashby role was incorrectly penalized; we then defaulted to "US OK" and only flagged explicit "based in X" patterns.
- **Overcorrection:** Some roles that *should* be flagged are now not: e.g. Match Group (listed Singapore), Jobgether (Philippines), 360learning (Paris). Whatnot (US cities + "Europe as market") is correctly US. User suspects: if a job is *listed* in a non-US country (even if "remote"), comp/eligibility is likely for that market, so should be flagged.
- **Analysis (decide before implementing):** See **"Location & work-site scoring (analysis)"** below. Covers: (1) non-US *listed* location (Singapore, Paris, Philippines, etc.) -> flag; (2) US on-site by city (Austin ok, NYC some penalty, SF/Bay higher, elsewhere significant); (3) "Remote" with non-US country -> treat as non-US.
- **Status:** Analysis added; implementation deferred until rules are confirmed

### 12. Cursor "73 problems" vs Apps Script runs fine
- **Explanation (no code change):** Cursor runs TypeScript/ESLint in a Node/TS environment. Apps Script is a different runtime (V8, no TS, different globals like `SpreadsheetApp`). So Cursor flags things that Apps Script doesn't (types, lint rules, undefined globals). The script is valid for Apps Script; the "problems" are environment mismatch.
- **Options:** (a) Ignore in Cursor; (b) add a minimal `clasp` or type stub setup so Cursor is happier; (c) add a short note in repo README. Recommend (a) or (c) for now.
- **Done:** Added README.md with short note explaining this; recommend ignoring Cursor warnings for this script.
- **Status:** Done

---

## P1 -- Foundation

### 1. Planning file and iteration
- **Decision:** Yes. This file (`PLAN.md`) is that planning doc. Iterate here: update status, add "Done" dates, and new items as we go.
- **Status:** In use

### 2. Search criteria -- what we capture (e.g. Strategic Finance)
- **Question:** Are we capturing strategic finance and other target roles?
- **Done:** Audited queries. All three sources use: Strategy Operations, BizOps, Business Operations, Strategic Finance, Strategy, Operations. Documented in context.md §3.3 Search criteria. To add terms (e.g. Chief of Staff, GM), edit the gate3A_braveSearchToRoles_* query strings.
- **Status:** Done

### 5a-5h. Brave discovery analysis (HISTORICAL -- superseded by SerpAPI)

*The sections below document the Brave-era discovery analysis. Brave has been superseded by SerpAPI Google Jobs as the primary discovery source. Retained for reference.*

### 5a. Discovery: job posting age (freshness filter)
- **Current behavior:** Catch-up runs use **no** freshness. Daily run uses `freshness=pw` (past 7 days) to target "new" postings.
- **Brave API:** Supported values: `pd` = past 24h, `pw` = past 7 days, `pm` = past 31 days, `py` = past year. **Important:** Brave's `freshness` filters by **when the search engine last crawled/updated the page**, not by "when the job was posted." Many ATS job listing pages are not re-crawled every 7 days, so with `freshness=pw` Brave can return **0 results** even though there are many new jobs -- the pages simply haven't been re-indexed in the last week.
- **Intent for initial/catch-up:** No freshness (capture older-but-active). For daily, see 5g below.
- **Status:** Documented; daily zero-results issue tracked in 5g

### 5g. Gate 3A daily: zero results with freshness=pw (assessment + fix)
- **User observation:** Gate 3A run across all sources returned Brave results=0, candidates=0, wrote=0 for Lever, Ashby, and Greenhouse. It is not plausible that there are zero job postings in the past week across all companies using these ATSs; something must be broken.
- **Assessment:** Our code (query, URL, filters) is consistent with catch-up runs that do return results. The difference is **daily uses `freshness=pw`**. Brave's freshness applies to **page crawl/index date**, not job post date. So we are not filtering "jobs posted in last 7 days" -- we are filtering "pages Brave has updated in its index in the last 7 days." For many job boards, that set is empty or tiny -> 0 results. **Conclusion:** Likely **not** a bug in our code; it's Brave API semantics. Daily run is over-filtering.
- **Next steps:** (1) **Change daily run:** Remove `freshness` for daily, or use a looser value (`pm` or `py`), so daily actually returns results. (2) **Optional:** Add a one-off test: same query with and without `freshness=pw`; confirm we get results without it. (3) Document in context that Brave freshness = crawl date, not job post date; "recent only" may require different strategy (e.g. run without freshness and rely on dedupe + discovery_date, or use `pm`).
- **Status:** Assessment done; daily now runs without freshness (see 5h).

### 5h. Gate 3A: what we changed, how we capture new roles, dedupe, and open questions

**What we changed in 3A (summary):**
- **Daily run:** Removed `freshness=pw` (it returned 0 results; Brave freshness = page crawl date, not job post date). Daily now runs with no freshness, same as catch-up. Added start/completion/error logging to Logs sheet.
- **Catch-up vs daily:** Catch-up = 10 pages x multiple query variants per site (3 Lever, 2 Ashby, 2 Greenhouse). Daily = 1 query per site; we use 6 pages (see below for 10-page option). Both dedupe by URL after retrieval.

**How we try to capture new roles (and not just the same expired list):**
- We run **without freshness** so Brave returns whatever it ranks (we don't over-filter to 0). "New to us" = URLs not already in the sheet; we write those and set `discovered_date` so you can sort/filter by when we first saw them.
- We **run discovery regularly** (e.g. daily). Each run re-queries Brave; if Brave's index has updated and new job pages appear in the first N pages, we'll see them and add them (dedupe skips URLs we already have).
- We do **not** have "job posted date" from Brave; we only have "when we first saw this URL" (`discovered_date`). So "new" means "new to our sheet," not "posted in last 7 days." To get true "posted recently" we'd need ATS APIs or page-level posted-date parsing.

**If Brave keeps the same order every time (same roles on pages 1-6):**
- Then the same ~120 URLs (6 pages x 20) come back each run; almost all are already in the sheet -> we write 0 new. **New roles** that appear on Brave would have to show up in pages 1-N (Brave's ranking would need to change). We can't ask Brave to "exclude these URLs" or "give us only new."
- **What we do:** (1) Request **up to 10 pages** for daily (same max as catch-up) so we scan the full slice Brave allows; new roles that enter Brave's index might appear on page 7-10. (2) Use **multiple query variants** on catch-up so different query emphasis can surface different URLs. (3) Run **often** so when Brave's ranking or index changes we pick up new URLs quickly.

**Deduplication: "prior to retrieval" vs "after retrieval":**
- **We cannot dedupe before calling Brave.** The Brave API does not accept a list of URLs to exclude. We must request pages 0-9 and get back whatever Brave returns.
- **We dedupe after retrieval:** Before any Brave call we load all existing `canonical_url` values from the Roles sheet into a Set. For each result URL we canonicalize, check the Set; if present we skip (don't write). So we **never write the same role twice**; we do "pull" the same URLs in the API response (and use quota) but we don't add duplicate rows. The only way to avoid "pulling" known URLs would be if Brave supported exclusion; it doesn't.
- **Optional optimization:** Stop requesting further pages when a page is 100% already in sheet (early exit to save quota). Tradeoff: if Brave sometimes puts new roles on page 5-6, we'd miss them. So we prefer "request all 10 pages for daily" over "early exit" for maximum chance of new roles.

**Other questions to consider (objectives: as many new, relevant roles as possible, as often and as soon as possible):**
1. **Run frequency:** Run Gate 3A daily (or twice daily) so we see new postings soon after Brave indexes them.
2. **Daily page count:** Use 10 pages for daily (not 6) so we don't miss new roles that appear on pages 7-10; we already dedupe so we only write new URLs.
3. **Brave's ranking:** We don't control it. New jobs might rank lower; running 10 pages and often helps. Option: log `data.web.query.more_results_available` (if present) to see when Brave has more results we're not requesting.
4. **Query variants on daily:** Catch-up uses 3+2+2 queries; daily uses 1 per site. Adding a second query per site on daily could surface different URLs (same 10-page limit per query).
5. **Staleness:** Many discovered URLs are already closed (404 or dead when user clicks). Run discovery more often to capture sooner; consider optional HEAD before surfacing for apply (5b).
6. **"True" new roles:** To prioritize "posted in last 7 days" we'd need posted-date from ATS APIs or page parsing; Brave doesn't give it. For now "new" = first time we see the URL.
7. **ATS feed (Path #2):** For companies we already have, ATS feed can add new openings at those companies without relying on Brave's ranking; use when we have a "top companies" list (5e).

- **Status:** Documented. Recommended: increase daily to 10 pages; consider run frequency and optional logging of more_results_available.

### 5b. Discovery + apply: many URLs stale (404 at enrich; dead when user clicks to apply)
- **Observation:** A large share of URLs captured return "job not found" at enrich time (404). Additionally, many URLs that we *did* enrich successfully are **no longer open when the user follows the link to apply**.
- **User data (Feb 2026):** 363 roles total; 93 dead/HTTP_404. Of 270 remaining, 205 scored >=50. User reviewed 151 of those; **93 of 151 (61%) were not available** when clicking through (Ashby: "Job not found"; Greenhouse: "The job you are looking for is no longer open."). Lever roles did not appear among the 93 -- suggesting Lever postings may stay discoverable longer or were not in the sampled 151.
- **Two layers of staleness:** (1) **At discovery/enrich:** URLs already closed when we fetch -> 404, marked Dead. (2) **At apply time:** Enriched and scored, but job closed between our fetch and user's click -> wasted review effort.
- **Plan:** (1) Run discovery more frequently so we see postings sooner. (2) Consider optional "last checked open" or HEAD re-check before surfacing for apply (e.g. filter or badge "checked open in last 24h"). (3) Prefer or prioritize sources that stay open longer if data supports it (e.g. Lever in this sample). (4) Document expected stale rate in context; accept some staleness as inherent to job boards.
- **Status:** Numbers and next steps captured; follow-up TBD

### 5f. Enrichment failures (HTTP_404, TEXT_TOO_SHORT): path to fixing and scoring
- **Observed:** Of 363 total records, 95 HTTP_404 and 105 TEXT_TOO_SHORT. 404s are invalid/closed links; TEXT_TOO_SHORT are valid URLs where we did not get enough content (e.g. Ashby JS-rendered page, or stub/closed page returning 200).
- **Scoring fix (done):** Gate 4 previously only scored rows with status **Enriched** and had a **cap of 100**. Now: (1) cap removed so **all** Enriched rows are scored; (2) rows with status **FetchError** and failure_reason **TEXT_TOO_SHORT** are also scored (using title, company, and whatever jd/loc/work we have) so you can review them. 404/Dead rows correctly remain unscored.
- **Path to reducing failures:**
  - **HTTP_404:** Already handled (mark Dead, do not retry). To reduce rate: run discovery more frequently so we capture jobs before they are pulled; or accept some stale rate; or (later) optional HEAD at discovery time to skip likely-dead URLs.
  - **TEXT_TOO_SHORT:** (1) Improve Ashby API URL->board/slug matching so more Ashby jobs get full JD via API instead of raw fetch (see existing fetchAshbyJobDescription_ and URL parsing). (2) Use `gate3B_resetTextTooShortToNew()` then re-run Gate 3B to retry; some may succeed on retry. (3) For now they are scored for review so you can prioritize fixing or manual check.
- **Status:** Gate 4 updated; path documented. Follow-up: audit Ashby matching for TEXT_TOO_SHORT rows, consider preserving short jd_text for scoring instead of clearing.

### 5c. Audit / test discovery coverage
- **Question:** The Roles sheet (e.g. 258 rows) is not "all matching roles" across the three sites -- it's what Brave returned for our 3 queries, capped at ~140 (Lever) + 100 (Ashby) + 100 (Greenhouse) per run, and Brave only surfaces a subset of indexed pages. User has seen same-company, same-keyword roles that weren't picked up. How to audit and test?
- **Right way to audit:**
  1. **Document the caps** (done in context.md §3.4): max 200 per query (we use 7/5/5 pages -> 20 per page), and Brave is a search index, not a full job index.
  2. **Company-level recall check:** Pick 3-5 companies that appear in the sheet where you've already noticed missing roles. For each company, open the ATS job listing page (e.g. `https://jobs.lever.co/<company>` or Ashby/Greenhouse equivalent) and list every job whose title/role matches our keywords. Count: (a) how many we have in the sheet for that company, (b) how many exist on the board that match. Recall = (a)/(b). This quantifies "how much we're missing" per company.
  3. **Optional: log Brave's reported total:** If the Brave API returns a total result count in the response (e.g. `data.web.query.total` or similar), log it in Gate 3A so we can compare "Brave says there are X results" vs "we ingested Y" (and Y <= 7x20 or 5x20 per source).
  4. **Interpret:** Low recall per company suggests either (a) Brave doesn't index/rank those URLs in the first N pages, or (b) our query phrasing misses them. That informs next steps (e.g. more queries, different keywords, or supplementing with direct ATS/API discovery).
- **Status:** Process documented; run company-level audit when ready; optional logging can be added later

### 5d. Discovery: re-runs don't add "the next 140" -- how to capture more
- **User's understanding (correct):** If there are 1000 matching roles on Lever, each run we only request the first 7 pages (140 results). We get the *same* ~140 every time. Dedupe happens *after* we get results (skip URLs already in sheet), so running again does **not** give us "the next 140" -- we add ~0 new. Brave's API does not allow offset > 9, so we can never get more than **200 results per query** from Brave. So we're capped at one slice per query; re-runs don't expand that slice.
- **Two ways to capture more:**
  1. **Max out Brave + query variations (stay with current approach):** Use **10 pages** for all three (200 max per query). Run **multiple queries per site** with different keyword emphasis. Each query gets its own 200; merge and dedupe.
  2. **Direct ATS discovery (fuller population):** See 5e below -- sitemaps/feeds vs per-company, and why per-company is a poor fit when we don't have a company list.
- **Recommendation (cost vs completeness):** Run Path #1 as a **one-time "catch up" run** (10 pages + multiple query variations per site) to build a much larger initial population. Then switch to a **lighter recurring process** (fewer queries, e.g. 1 query per site and 5-7 pages, optionally `freshness=pd` or `pw` for recent-only) so daily/weekly runs mainly pick up *new* postings without blowing Brave API cost. One-time cost for catch-up; low ongoing cost for maintenance.
- **Status:** Done. Implemented: `gate3A_runAllSources_catchUp()` (10 pages, 3 Lever + 2 Ashby + 2 Greenhouse query variants); `gate3A_runAllSources_daily()` (6 pages, 1 query per site). Single-source `gate3A_braveSearchToRoles_*` kept for ad-hoc runs. **Apps Script 6-min limit:** Full catch-up can time out; use `gate3A_runAllSources_catchUpLeverOnly()`, `catchUpAshbyOnly()`, `catchUpGreenhouseOnly()` in three separate runs to stay under the limit.

### 5e. Path #2 (direct ATS): implemented; limited value now, better for "top companies watch" later
- **Company list concern:** Path #2 requires knowing company identifiers. We derive them from existing Roles (URLs we already have). So we only poll companies we've already found -- we don't discover *new* companies this way.
- **What we implemented:** Company-list-from-sheet: for each (ats, company) in Roles, call Lever/Ashby/Greenhouse API, get all jobs, filter by title keywords, append new URLs with source=ats_feed. Batching added: maxCompanies (default 18), offset for next batch, to stay under 6-min limit. Per-source wrappers: `gate3A_discoverFromAtsFeedsLeverOnly()` etc. Logs: "Fetched X jobs, Y matched keywords, Z already in sheet, wrote W new."
- **Assessment:** Limited value for *broad* discovery right now -- we're only searching 18 companies at a time that we've already identified. **Higher value later:** when we have a **ranking of top potential companies** (from fit score, manual list, or P2/P4 company-fit work), use this same ATS-feed flow as a **"watch these companies for new openings"** job: maintain a curated (ats, company) list for top companies, run periodically (batched), filter by keywords, append new roles. So: keep the code; defer as primary discovery; revisit when we have a "top companies" workflow (see P2 #9, P4 #4 cold outreach).
- **Status:** Implemented; use optionally. Prioritize when "top companies" list exists.

**How to proceed (Path #1 vs Better Path #2):**

| Step | What | Why |
|------|------|-----|
| **1. Path #1 catch-up (do first)** | Implement and run the one-time "catch up" (10 pages + 2-3 query variants per site). Run it once. | Gets you a much larger initial set using the pipeline you already have. No new discovery mechanism -- just more Brave queries once. |
| **2. Path #1 daily (recurring)** | Use the lighter run (1 query per site, 5-7 pages, optional freshness) on a schedule. | Keeps adding *new* postings over time without high Brave cost. Same sheet, same enrich/score flow. |
| **3. Better Path #2 (optional, after 1-2)** | *Research only* at first: do Lever, Ashby, and Greenhouse expose one URL (e.g. sitemap or feed) that lists many or all job URLs in one response? | If yes, we could add a second discovery path: fetch that URL, parse out job links, filter by keywords, append to the same Roles sheet (dedupe as now). That would use **no Brave** for that slice and could give very high coverage for that ATS. If no such URL exists, we stay with Path #1 only. |

**Better Path #2 in plain terms:** Today we "ask Brave" for job pages (Brave has indexed them). Better Path #2 would mean "ask the ATS itself" for a single page or feed that already lists lots of job URLs -- like a sitemap or an RSS/XML feed for job boards. One request per ATS could return hundreds/thousands of URLs; we'd filter by our keywords and add new ones to the sheet. We don't yet know if each ATS offers that; step 3 is to check. If they do, we add it; if not, Path #1 (catch-up + daily) is the discovery strategy.

### 5. How to mark "Applied" and sync to legacy tracker (Project Falcon)
- **Current:** You added columns "Applied?" and "Date Applied / Commentary".
- **Questions:** (1) How to mark applied in JobDiscovery. (2) Whether to copy applied rows to Falcon or make Falcon the single source of truth.
- **Approach:**
  - **Marking applied:** Use your two columns as the source of truth in JobDiscovery. Optionally add a small script: "Mark selected row(s) as Applied with today's date" for speed.
  - **Sync vs single source:** Decide one approach: (A) JobDiscovery is source of truth; script exports "Applied" rows to Falcon (one-way sync). (B) Falcon is master; you log applications there and optionally link back (e.g. URL) to JobDiscovery. (C) Both: log in both, script copies from JobDiscovery -> Falcon so Falcon has a complete log. Recommendation: (C) or (A) so Falcon stays the master application log and we don't duplicate manual entry.
  - **Script:** Once approach is decided, add a function (e.g. "Copy applied from JobDiscovery to Falcon") that runs on demand or on a trigger: read rows where Applied? = yes, append to Falcon sheet (with mapping of columns). Requires Falcon sheet ID and column mapping.
- **Status:** Not started; decision needed on sync direction

---

## P2 -- Scoring & prioritization

### 3. Your notes on top-scored results
- **Note:** You have notes on top scored results to share later. Use them to refine scoring and ranking.
- **When:** Share when ready; we'll use as input for item 11 (scoring audit) and any one-off scoring tweaks.
- **Status:** Pending your input

### 9. Similar companies + company fit ranking
- **Goal:** Find companies similar to those where we're finding good roles; rank by company fit + role fit.
- **Approach:** Research phase. Options: (a) manual list of "similar companies" per employer; (b) use a data source (e.g. LinkedIn, Clearbit) for "similar companies"; (c) simple heuristic (sector, size, funding). Then add a "company_fit" or "similar_to" concept and combine with role fit_score. Likely P4 after core pipeline is stable.
- **Status:** Backlog

### 11. Process to audit and refine the scoring algorithm
- **Goal:** Systematic way to improve scoring (not just ad hoc role-by-role).
- **Approach:** (1) Define a small "gold set": 10-20 roles you label as clearly high-fit vs low-fit. (2) Run current scorer on them; compare scores to your labels. (3) Identify systematic errors (e.g. "Non-US" false positives, title misclassification). (4) Adjust heuristics and re-run. (5) Optionally: export a CSV of scored roles + key fields and have an AI or script suggest rule changes. Iterate. Document the process in `context.md` or this plan.
- **Status:** Not started

### 13. Score and prioritize: applied roles + archived (custom-questions) roles
- **Goal:** Develop a process to score and prioritize two buckets so you can act on them: (1) **Roles you've applied to** -- prioritize for **follow-up** (e.g. email/LinkedIn). (2) **Roles you've archived but not applied to** because they have custom questions -- prioritize for **custom application** (draft answers, then apply).
- **Approach:** (1) Ensure both buckets are identifiable in the sheet (e.g. Applied? = yes vs a separate "Archived / custom Q" flag or status). (2) Run fit_score (or a variant) on each bucket so they have a consistent score/rank. (3) Produce a simple view or export: e.g. "Applied, ranked by fit" (for follow-up priority) and "Archived / custom Q, ranked by fit" (for custom-application priority). (4) Optionally: link to P3 #6 (custom answers workflow) for drafting and to P4 follow-up for applied. No new discovery; this is scoring + prioritization of existing rows.
- **Status:** Added to plan; not started

---

## P3 -- Workflows & scripts

### 5 (sync). Script: JobDiscovery -> Project Falcon
- **Depends on:** Decision in item 5 (sync direction and Falcon format).
- **Deliverable:** One function (or trigger) that copies "Applied" rows from JobDiscovery to Falcon with column mapping.
- **Status:** Blocked on P1 item 5

### 6. Custom list: postings requiring custom answers
- **Goal:** Take your existing list of postings that need custom responses -> check if still open -> score/prioritize -> support drafting answers.
- **Approach:** (1) Define input: list of URLs or a tab/sheet. (2) "Check if still active": reuse Gate 3B-style fetch (or HEAD); mark open/closed. (3) Score/prioritize: run same fit_score (or a lighter version) if we have JD text, or use title/source only. (4) Drafting: separate flow (e.g. export to a doc, or a prompt that takes JD + question and drafts an answer). Can be a new script or a small suite of functions.
- **Status:** Not started

---

## P4 -- Vision, scale, new sources

### 4. Expanded objective (apply to all above fit, follow-up, cold outreach)
- **Summary of goals:**
  - Submit applications for every job above a fit threshold, including posts >1 week old if still open.
  - Cover Lever, Greenhouse, Ashby plus other sources (e.g. company career pages, Fanatics-style boards).
  - Handle custom questions: identify them, draft and iterate answers, submit quickly.
  - Follow-up: email/LinkedIn for highest-fit roles.
  - Cold outreach: identify top companies with no current posting; find contacts; draft outreach.
- **Approach:** Treat as roadmap. Break into phases: (Phase 1) current pipeline + apply tracking + sync to Falcon. (Phase 2) Custom answers workflow and "apply above threshold" automation. (Phase 3) Follow-up and cold outreach. Capture in `context.md` as "Desired next state" or "Roadmap" and refine here as we go.
- **Status:** Captured; to be reflected in context.md

### 7. LinkedIn ingestion (next priority after SerpAPI)
- **Question:** How to ingest from LinkedIn; it's the largest job listings platform and has roles not on Lever/Ashby/Greenhouse.
- **Research completed (Feb 2026).** Options evaluated:
  - (a) **LinkedIn API:** Requires partnership agreement; not available for individual use. Dead end.
  - (b) **Scraping:** Against LinkedIn ToS; actively detected/blocked; LinkedIn has sued scrapers. Not recommended.
  - (c) **LinkedIn job alerts -> email -> parse:** **Winner.** Free, legitimate (LinkedIn built this feature), and we already have the Gate 1 pattern for parsing job URLs from email. Could add 20-50+ roles/day.
  - (d) **Aggregators that include LinkedIn (SerpAPI, Adzuna):** SerpAPI Google Jobs already surfaces some LinkedIn jobs (`via: "LinkedIn"` in results), but only a small fraction. Adzuna untested but may add more.
  - (e) **Manual:** Not scalable.
- **Decision: Option (c) -- LinkedIn Job Alerts -> Email -> Apps Script parse.**
- **Implementation plan:**
  1. User sets up 4-6 LinkedIn job alerts (one per keyword group: "Strategy & Operations", "Strategic Finance", "Chief of Staff", "BizOps", "Head of Operations", "Director of Operations").
  2. LinkedIn sends daily email digests to the user's Gmail.
  3. Build `gate1_ingestLinkedInAlerts()` function in JobDiscovery.ts -- same pattern as existing `gate1A_ingestGoogleAlerts_lever_proof()`: scan Gmail for LinkedIn alert emails, extract job URLs, canonicalize, dedupe against Roles sheet, write new rows with source=`linkedin_alert`, ats=`linkedin`.
  4. LinkedIn alert emails contain job title, company, location, and a `linkedin.com/jobs/view/...` URL. Extract all of these.
  5. Enrichment (Gate 3B) and scoring (Gate 4) work unchanged on the new rows.
- **Advantages over other sources:**
  - LinkedIn has the largest job index, including roles posted only on LinkedIn (not on any ATS board).
  - LinkedIn's alert algorithm does relevance filtering for us (at zero API cost).
  - No API credits consumed. No rate limits. No cost.
  - Captures LinkedIn-exclusive listings that SerpAPI/Brave/ATS APIs can never reach.
- **Limitations:**
  - LinkedIn controls what appears in alerts (not guaranteed exhaustive).
  - Email format may change over time (parsing could break; fixable).
  - Requires user to set up alerts manually (one-time).
  - Volume depends on LinkedIn's alert frequency and how many jobs they include per email.
- **Status:** DONE (Feb 2026). Functions built: `gate1_ingestLinkedInAlerts()`, `gate1_linkedInAlerts_diagnostic()`, `parseLinkedInAlertJobs_()`, `canonicalizeLinkedInJobUrl_()`. First run: 46 roles from 11 emails. Gate 3B updated to accept `linkedin_alert` source. JD noise truncation added (`truncateJdNoise_()`) to clean LinkedIn sidebar content from enriched text.

### 7b. ATS URL resolver for HTTP_403 roles (Phase 2)
- **Problem:** SerpAPI discovers jobs across the entire web, but many canonical URLs point to aggregator sites (Indeed, ZipRecruiter, Monster, Talent.com, Jobrapido, etc.) that return HTTP_403 when we try to fetch the JD. These roles have title, company, and location from SerpAPI but no JD text, limiting scoring accuracy.
- **Observed:** ~30 out of 120 SerpAPI roles failed with HTTP_403 in the first enrichment run (Feb 2026).
- **Solution:** Build a `gate3B_resolveAtsUrls()` function that:
  1. Finds rows with `failure_reason = "HTTP_403"` (or similar blocked statuses).
  2. For each, takes the company name and attempts to find the company's ATS board:
     - Construct candidate URLs: `https://jobs.lever.co/{slug}`, `https://jobs.ashbyhq.com/{slug}`, `https://boards.greenhouse.io/{slug}` using `companyToSlug_()`.
     - Probe each URL. If a board exists, search it for a job title match.
     - If found, swap the canonical URL to the ATS URL and reset status to "New" for re-enrichment.
  3. For companies not on Lever/Ashby/Greenhouse, leave as-is (score with limited data).
- **Complexity:** Medium. Requires fuzzy title matching and slug guessing (some companies use non-obvious slugs).
- **Priority:** After LinkedIn ingestion. The 403 roles are still scored (with less precision); this is an accuracy improvement, not a blocker.
- **Status:** Planned.

### 9. Target company identification and board monitoring
- **Objective:** Build a ranked list of companies at the intersection of (a) where you'd be most excited to work and (b) most likely to have roles you'd be a strong fit for. Then continuously monitor their specific job boards for new openings.
- **Phase 1: Build the target company list**
  - **Data-driven seeding:** Extract companies from roles already scored highly in the Roles sheet (e.g., fit_score >= 70). These are companies that have already posted relevant roles. Deduplicate and rank by frequency + average score.
  - **Manual curation:** Add companies you're personally excited about but that haven't appeared in discovery yet (e.g., companies you admire, have connections at, or are in industries you prefer).
  - **Company scoring dimensions:** Industry/sector fit, company stage (startup vs. growth vs. enterprise), culture signals, comp range observed, geographic fit, number of relevant roles posted, whether they use a known ATS (Lever/Ashby/Greenhouse).
  - **Storage:** New "Companies" sheet in the spreadsheet with columns: company_name, ats_type, ats_slug, company_score, last_checked, notes.
- **Phase 2: Monitor their boards**
  - For companies on Lever/Ashby/Greenhouse: use existing `gate3A_discoverFromAtsFeeds()` (already built, handles batching) to poll their boards on a schedule (e.g., weekly).
  - For companies on other platforms: store their careers page URL; optionally build a lightweight scraper or manual check process.
  - **New roles trigger:** When a new role appears on a monitored company's board, write it to Roles sheet with source=`company_watch`, run enrichment + scoring automatically.
  - **Cadence:** Weekly polling for top-tier companies; less frequent for lower-tier. Stay within Apps Script 6-min limit by batching (already solved with offset/maxCompanies pattern).
- **Phase 3: Cold outreach for top companies with no current openings**
  - For top-ranked companies that don't currently have matching roles posted: flag for cold outreach.
  - Identify contacts (hiring managers, heads of strategy/ops) via LinkedIn.
  - Draft outreach templates expressing interest in the company and relevant capabilities.
  - Track outreach in the sheet (contacted date, response, follow-up).
- **Relationship to existing work:**
  - The "Phase 2 hybrid" approach in the suggested order (item 5) is a subset of this. This plan expands it to include company scoring, manual curation, and cold outreach.
  - The ATS feed infrastructure is already built (`gate3A_discoverFromAtsFeeds`, batching with offset/maxCompanies). It just needs a curated company list to be effective.
- **Status:** Planned. Depends on having enough scored roles to seed the company list (available now with ~500 roles scored).

### 8. Scalability -- when does the sheet break?
- **Question:** At what point does the Google Sheet become insufficient, and what to do?
- **Approach:** (1) Rough limits: Sheets has cell limits (~10M cells), script runtime (6 min), URL Fetch quotas. Estimate: e.g. 10k-50k rows with current columns might be fine; beyond that, export/archiving or migration. (2) Mitigations: archive old rows (e.g. "Dead" or applied >90 days ago) to another sheet or CSV; limit active sheet to "current" roles. (3) Migration path: when we hit limits, move to a DB (e.g. SQLite + script, or Supabase) and keep Sheets as a view or export target. Document thresholds and "when to migrate" in this plan or context.md.
- **Status:** Not started

---

## Suggested order to work through (next steps)

**Completed:**
- SerpAPI Google Jobs integration (catch-up + periodic runner, split queries, no date filter)
- LinkedIn job alerts ingestion (email parsing, title/company extraction, dedup)
- Gate 3B: linkedin_alert + serpapi_google_jobs sources, 120-row batch cap, JD noise truncation
- Gate 4: scores all Enriched + TEXT_TOO_SHORT rows, no cap

**Next priorities (in order):**
1. **Location scoring (#10):** Implement the location rules from the analysis section below (non-US penalty, US on-site tiers). This is the highest-impact scoring improvement.
2. **Target company identification (#9 Phase 1):** Build ranked company list from high-scoring roles + manual curation. Create "Companies" sheet. This unlocks ATS feed monitoring for depth.
3. **Target company monitoring (#9 Phase 2):** Set up weekly ATS feed polling for top companies using existing `gate3A_discoverFromAtsFeeds()` infrastructure.
4. **ATS URL resolver (#7b):** Recover JD text for HTTP_403 roles by finding original ATS postings. Improves scoring accuracy for ~25% of SerpAPI results.
5. **Scoring audit (#11):** Build gold set from reviewed roles; systematically improve scoring heuristics.
6. **Applied/archived scoring (#13):** Score and prioritize applied roles (for follow-up) and archived custom-question roles (for drafting).
7. **Falcon sync (#5):** Script to copy applied rows from JobDiscovery to Project Falcon.
8. **Custom answers workflow (#6):** Check if custom-question roles are still open, prioritize, support drafting.
9. **Cold outreach (#9 Phase 3):** For top companies with no current openings, identify contacts and draft outreach.
10. **Scalability (#8):** Archive old rows, plan migration path when sheet approaches limits.

---

## Location & work-site scoring (analysis)

*Decide these rules before implementing changes to Gate 4 / `scoreRoleV0_`.*

### 1. Non-US *listed* location (flag and penalize)
- **Rule:** If the job is **listed** in a non-US country or city (e.g. Singapore, Paris, Philippines, London, Berlin), treat as non-US and apply the non-US penalty -- **regardless** of whether the posting also says "Remote".
- **Rationale:** Listing location usually reflects comp/eligibility for that market; "Remote" in that context typically means "remote within that country/region," not "remote from the US."
- **Signals to use:** Primary listed location from the board (e.g. `location_raw` or equivalent from Lever/Ashby), or clear "Location: [city/country]" in the JD when it's a non-US place. Explicit non-US city/country names (Singapore, Paris, Philippines, UK, London, Berlin, etc.) as the *primary* location -> `location_us_ok = FALSE`, -40 (or current penalty).
- **Do *not* flag:** US cities (e.g. Los Angeles, San Francisco, New York, Austin, Phoenix); or JD text that only *mentions* Europe/other regions as markets the company serves (e.g. "we operate in North America and Europe").

### 2. "Remote" with a non-US country
- **Rule:** Same as (1). If the posting says "Remote" but the listed location is a non-US country (e.g. "Remote - Philippines", "Singapore" with "Full-Time / Hybrid"), treat as non-US. One penalty dimension is enough (non-US); no need for a separate "remote but non-US" rule beyond applying (1).

### 3. US on-site location (separate dimension from US vs non-US)
- **Rule:** For roles that are **on-site** (or hybrid with strong on-site expectation) **in the US**, apply a **location-preference** penalty by metro, not a "non-US" penalty:
  - **Austin:** No penalty (preferred).
  - **NYC area:** Some penalty (acceptable but not preferred).
  - **SF Bay Area:** Higher penalty (still possibly acceptable).
  - **On-site elsewhere in the US:** Significant penalty -- only the best roles on all other attributes would still be worth pursuing.
- **Implementation note:** This requires knowing both (a) that the role is on-site (or hybrid with on-site), and (b) the US city/metro. May need to parse `location_raw` or JD for "On-Site", "Berkeley", "Austin", "New York", "San Francisco", etc., and map to these tiers. No code change until rules are confirmed.

### 4. Summary table (for implementation later)

| Situation | Treat as | Penalty / note |
|----------|----------|----------------|
| Listed in Singapore / Paris / Philippines / etc. (even if "Remote") | Non-US | Full non-US penalty |
| Listed in US city/cities + "Remote" or "Hybrid"; JD mentions Europe as market | US OK | No non-US penalty |
| On-site Austin | US, preferred | No location penalty |
| On-site NYC area | US | Some penalty |
| On-site SF/Bay | US | Higher penalty |
| On-site elsewhere US | US | Significant penalty |

---

## 6. Discovery redesign: first-principles analysis (Feb 2026)

### 6.1 The problem (why Brave-primary doesn't work)

**Objective:** Discover all (or as many as possible) currently-open job postings matching target role criteria across the entire market, as soon as possible, so the user can review and apply while they're still open.

**What we built:** Brave Search -> individual job URLs -> enrich (fetch JD) -> score -> user reviews and clicks to apply.

**What's broken:**
- **Brave's index is stale for job boards.** Brave crawled these pages days/weeks/months ago. Jobs close fast; Brave re-crawls slowly. Result: we discover mostly expired jobs. User data: of 151 scored roles reviewed, 93 (61%) were no longer available when clicking to apply. Ashby and Greenhouse jobs were the failures; Lever jobs were not in that set.
- **Coverage is incomplete.** Brave returns at most 200 results per query (10 pages x 20). The total number of open roles matching our keywords across all companies on Lever + Ashby + Greenhouse is orders of magnitude larger. Brave only surfaces what it has indexed and ranked, which is a small, stale subset.
- **Dedupe doesn't help discover more.** We can't ask Brave to exclude known URLs. Re-runs return the same pages; we skip known URLs after retrieval but don't see new ones unless Brave's ranking changes.

**The ATS-API-primary idea (proposed, then rejected as insufficient):** Use Brave to discover companies, then use ATS public APIs (Lever, Ashby, Greenhouse) to get currently-open jobs at those companies. This solves staleness (APIs return only open jobs) and per-company coverage (all open roles at each company). But: the universe of companies that could post a matching role is orders of magnitude larger than the company list we'd accumulate from Brave. So this approach is structurally incomplete for the same reason -- it only covers known companies.

**Root issue:** No single approach we've tried covers the full population of currently-open jobs across all companies on these ATSs.

### 6.2 What exists: discovery approaches evaluated from first principles

#### A. Search engines (Brave, Google via SerpAPI)

| | Brave Search API | SerpAPI (Google Jobs) |
|---|---|---|
| **What it does** | Web search; returns indexed pages ranked by relevance | Scrapes Google Jobs results (structured job postings from Google's index) |
| **Coverage** | Whatever Brave has indexed; max 200/query | Whatever Google Jobs has indexed; 10 results/page, paginated via token |
| **Freshness** | Stale (pages may be weeks/months old in index); `freshness` param filters by crawl date, not post date | Google Jobs is purpose-built for jobs and likely more current than Brave's general web index, but still an index |
| **Cost** | Current plan (have token); 200 results costs 10 API calls | Free: 250 searches/mo; $25/mo: 1,000; $75/mo: 5,000 |
| **Pros** | Already integrated; covers full internet | Purpose-built for jobs; structured data (title, company, location, posted date); aggregates from LinkedIn, Indeed, etc.; likely fresher than Brave for job pages |
| **Cons** | Stale; not job-aware; no posted-date field; 200/query cap | New integration; still an index (not guaranteed real-time); cost scales with queries; scraping wrapper (SerpAPI) |

#### B. Job aggregator APIs (Adzuna, JSearch)

| | Adzuna API | JSearch (RapidAPI) |
|---|---|---|
| **What it does** | Job search API; aggregates from many job boards/sources | Aggregates from Google Jobs, LinkedIn, Indeed, ZipRecruiter, Monster, etc. |
| **Coverage** | Broad; international; many sources | Very broad; 40+ data points per job; multi-source |
| **Freshness** | Aggregator-maintained; likely more current than Brave for jobs | Pulls from Google Jobs (purpose-built job index) |
| **Cost** | Free: 250/day, 2,500/month | Free: 200 requests/month; $25/mo: 10,000; $75/mo: 50,000 |
| **Pros** | Free tier; keyword + location search; returns structured job data | Rich data; multi-source aggregation; quality scoring; free tier |
| **Cons** | Low free-tier limits (250/day); may not cover all ATS-hosted roles; unclear how complete Lever/Ashby/Greenhouse coverage is | Very low free tier (200/mo); need to test if Lever/Ashby/Greenhouse roles actually appear; RapidAPI dependency |

#### C. ATS public APIs (per-company, currently-open only)

| | Lever Postings API | Ashby Job Postings API | Greenhouse Job Board API |
|---|---|---|---|
| **What it does** | `GET https://api.lever.co/v0/postings/{company}` -> all open postings for that company | `GET https://api.ashbyhq.com/posting-api/job-board/{board}` -> all published postings | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` -> all published jobs |
| **Coverage** | 100% of open postings at that company | 100% of published postings at that company | 100% of published jobs at that company |
| **Freshness** | Real-time (only currently-open jobs returned) | Real-time | Real-time |
| **Cost** | Free, no auth needed | Free, no auth needed | Free, no auth needed (read) |
| **Pros** | Zero staleness; complete per-company; structured data (title, location, team, etc.); no quota issues | Zero staleness; complete per-company; includes compensation, HTML/plain description | Zero staleness; complete per-company; includes content/description |
| **Cons** | **Requires company slug.** No global "all companies" endpoint. Only covers companies you know about. | **Requires board name.** No global feed (partner feed exists but requires partnership agreement with Ashby). | **Requires board token.** No global endpoint. |

#### D. ATS global feeds / sitemaps

| | Lever sitemap | Ashby Partner Feed | Greenhouse sitemap |
|---|---|---|---|
| **Exists?** | **No.** `jobs.lever.co/sitemap.xml` returns 404. No global sitemap found. `robots.txt` doesn't reference one. | **Yes, but gated.** Ashby offers a "Dedicated Partner Job Feed" (JSON/XML, updated hourly, all opted-in companies). Requires partnership agreement -- contact partnerships@ashbyhq.com. | **No.** `boards.greenhouse.io/sitemap.xml` returns 404. No global sitemap found. |
| **If available** | Would list all current job URLs across all Lever companies; filter by keyword -> done | Would be the ideal solution for Ashby: all jobs, all companies, updated hourly, structured data | Would list all current job URLs across all Greenhouse companies |
| **Feasibility** | Not available | Requires being an approved partner; not available for individual use | Not available |

#### E. Google Cloud Talent Solution

- **What it is:** Google's job search ML service. You upload *your own* jobs, it indexes and provides search.
- **Not applicable:** It doesn't search public job listings. You'd need to already have the jobs to put into it. Dead end for our use case.

### 6.3 Assessment: what could actually work

**The fundamental challenge:** No single free/cheap API gives us "all currently-open jobs across all companies on Lever + Ashby + Greenhouse, filtered by keyword." The ATS APIs are real-time and complete, but per-company. The search engines and aggregators are global but stale and incomplete.

**Approaches ranked by potential:**

1. **Job aggregator with job-specific index (SerpAPI Google Jobs, JSearch, or Adzuna):**
   - These are purpose-built for job search and likely have better freshness than Brave for job pages.
   - Google Jobs in particular ingests structured `JobPosting` schema data from across the web, which Lever/Ashby/Greenhouse emit. Its index should be more current and complete for jobs than Brave's general web index.
   - **Key unknown:** How complete is their coverage of Lever/Ashby/Greenhouse roles? Does every open role on these ATSs appear in Google Jobs / Adzuna / JSearch? This needs testing.
   - **Key unknown:** Do they provide `posted_date` or `last_seen_open` so we can filter for freshness properly (unlike Brave's crawl-date `freshness`)?
   - **Cost:** SerpAPI free tier is 250 searches/month (could work if each search returns many results and we run a few queries daily). Adzuna free tier is 250/day. JSearch free tier is only 200/month (too low without paying).

2. **ATS APIs (Lever + Ashby + Greenhouse) for known companies, fed by an expanding company list:**
   - Zero staleness; 100% per-company coverage; free.
   - Company list grows over time: from Brave results, from aggregator results, from manual additions, from "similar companies" research.
   - Limitation: we only cover companies we know about. But if the company list grows to hundreds or thousands over time, coverage improves significantly.
   - This is the **"watch list"** approach: maintain a large and growing company list; poll their APIs regularly.

3. **Hybrid: aggregator for broad discovery + ATS APIs for depth:**
   - Use a job-specific aggregator (SerpAPI Google Jobs or Adzuna) as the primary discovery mechanism -- it should be fresher and more job-aware than Brave.
   - Extract company slugs from aggregator results and add to a Companies list.
   - Use ATS APIs for all companies in the list to get the full set of currently-open roles (not just the ones the aggregator surfaced).
   - This combines broad discovery (aggregator covers the full market) with depth (ATS APIs give complete, real-time per-company data).

4. **Brave (current approach):**
   - Still useful for discovering company slugs we haven't seen before.
   - Not reliable as primary job discovery (stale, incomplete).
   - Keep as a secondary/supplementary source.

### 6.4 Decision: SerpAPI Google Jobs ($0/month free tier)

**Research completed (Feb 2026).** We evaluated SerpAPI (Google Jobs), Adzuna, and JSearch. Decision: **SerpAPI Google Jobs as primary aggregator discovery source**, using the free tier (250 searches/month).

**Why SerpAPI Google Jobs:**
- Google Jobs ingests structured `JobPosting` schema data that Lever/Ashby/Greenhouse emit, so it should have good ATS coverage.
- It aggregates from LinkedIn, Indeed, ZipRecruiter, etc. -- solving the LinkedIn gap.
- Returns structured fields: `title`, `company_name`, `location`, `detected_extensions.posted_at` (e.g. "3 days ago"), `apply_options` (array of source URLs including direct ATS links).
- Supports query operators: `OR`, `AND`, quoted phrases `"..."`, grouping `()`, wildcard `*`, and date filtering `after:YYYY-MM-DD`.
- 10 results per page; paginate via `next_page_token` until exhausted (no documented page cap).
- Free tier: 250 searches/month, 50/hour throughput. Each page = 1 search credit.

**Why not Adzuna or JSearch as primary:**
- Adzuna free tier is generous (250/day) but returns only a description *snippet* (not full JD) and redirect URLs (not direct ATS links). Useful as a supplementary source later.
- JSearch free tier is too low (200/month) for meaningful use without paying.

**Key cost optimization: combined OR queries.**
Google Jobs supports `OR` and grouping, so we combine all keywords into a single query:
`("Strategy Operations" OR "Strategic Finance" OR "BizOps" OR "Business Operations" OR "Chief of Staff" OR "Head of Operations")`
This uses 1 credit per page instead of 5-6 separate queries. Combined with `after:` date filtering for daily runs, this keeps credit usage very low.

**Phases (same structure, now concrete):**

**Phase 1 -- Implement SerpAPI Google Jobs integration (current step):**
- Sign up for SerpAPI free tier (250 searches/month, $0).
- Build `serpApiGoogleJobsToRoles_()` core function in JobDiscovery.ts.
- Run one-time catch-up (~45 credits) + daily runs (~3-5 credits/day).
- Validate: freshness, ATS coverage, liveness, volume. See section 6.6 for full implementation spec.

**Phase 2 -- Build hybrid (after Phase 1 validates):**
- SerpAPI Google Jobs becomes primary broad discovery (replaces Brave for job URLs).
- Extract company slugs from discovered URLs -> Companies list.
- ATS APIs poll all companies in the list for complete, real-time open roles.
- Brave demoted to "discover new company slugs occasionally."

**Phase 3 -- Scale the company list:**
- Every source (aggregator, Brave, ATS feed, manual additions) adds companies to the list.
- Over time the company list grows; ATS API polling covers more of the market.
- Optional: "similar companies" research (P2 #9) or industry/sector lists to proactively add companies.

**Fallback (if SerpAPI results are poor):**
- Fall back to ATS-API-primary with aggressive company list building.
- Optionally test Adzuna (250/day free) as alternative aggregator.
- Use Brave + multiple query variants to maximize company discovery (not job discovery).

### 6.5 Open questions (status after research)

1. **Aggregator freshness:** Google Jobs returns `detected_extensions.posted_at` (e.g. "3 days ago", "25 days ago"). Confirmed from API docs. Actual liveness vs Brave's 61% stale rate: **to be validated after first run.**
2. **ATS coverage:** SerpAPI example responses show jobs `via` "Lever", "LinkedIn", "ZipRecruiter", "Dice", etc. with direct ATS links in `apply_options`. Confirmed Lever and Greenhouse URLs appear. Ashby coverage: **to be validated.**
3. **Posted date:** Yes -- `detected_extensions.posted_at` provides relative posted date. The `after:` query operator provides absolute date filtering (e.g. `after:2026-02-01`). Both confirmed from SerpAPI docs.
4. **Cost at scale:** Free tier (250/month) is sufficient. Combined OR query + `after:` filtering = ~3-5 credits/day for daily runs. Catch-up ~45 credits one-time. Monthly budget: ~165 month 1, ~120 month 2+. Leaves ~85-130 credits buffer.
5. **Ashby Partner Feed:** Still gated behind partnership agreement. Not pursuing now; SerpAPI may surface Ashby jobs via Google Jobs index.
6. **LinkedIn:** Google Jobs aggregates from LinkedIn (confirmed in SerpAPI example: `"via": "LinkedIn"`). This may solve LinkedIn coverage without needing LinkedIn's restricted API.

### 6.6 Implementation spec: SerpAPI Google Jobs integration

#### Prerequisites (user action)
- Sign up at serpapi.com (free, no credit card required).
- Copy API key.
- In Google Apps Script editor: File > Project Settings > Script Properties > add `SERPAPI_KEY` = your key.

#### Query constants (as implemented)

```
SERPAPI_QUERIES_CATCHUP_ = [
  '"strategy & operations" OR "strategy operations" OR "strategic operations" OR "strategy & ops"',
  '"business operations" OR "bizops" OR "biz ops"',
  '"strategic finance" OR "chief of staff"',
  '"head of operations" OR "director of operations" OR "VP operations" OR "head of business operations"'
]
```

Both catch-up and periodic (daily/weekly) runners use the same 4 split queries. Combined OR query was abandoned because Google Jobs caps at ~10-20 results per query -- splitting into 4 queries yields ~4x more unique results.

#### Core function: `serpApiGoogleJobsToRoles_(params)`

Modeled after `braveSearchToRoles_generic_` but adapted for SerpAPI's response format:

- **Input params:** `query`, `maxPages` (default 15), `afterDate` (optional, ISO string like "2026-01-20"), `logLabel`
- **API call:** `GET https://serpapi.com/search?engine=google_jobs&q=...&gl=us&hl=en&api_key=...` (and `&next_page_token=...` for subsequent pages)
- **Per result, extract:**
  - `title` -> `job_title`
  - `company_name` -> `company`
  - `location` -> stored for later scoring
  - `detected_extensions.posted_at` -> logged for freshness analysis
  - `apply_options` array -> scan for Lever/Ashby/Greenhouse/LinkedIn URLs -> use the first ATS URL found as `canonical_url`; if none, use `apply_options[0].link`
  - Determine `ats` from the canonical URL domain (lever/ashby/greenhouse/linkedin/other)
- **Dedup:** Check against existing `canonical_url` Set (same pattern as Brave function)
- **Write row** with source = `"serpapi_google_jobs"`, status = `"New"`
- **Pagination:** Follow `serpapi_pagination.next_page_token` until absent or `maxPages` reached
- **Logging:** Log to Logs sheet: pages fetched, results seen, candidates, wrote, credits used

#### URL canonicalization logic

For each result's `apply_options`, prioritize in order:
1. `jobs.lever.co/*` -> ats = "lever"
2. `jobs.ashbyhq.com/*` -> ats = "ashby"
3. `boards.greenhouse.io/*` -> ats = "greenhouse"
4. `linkedin.com/jobs/*` -> ats = "linkedin"
5. First option otherwise -> ats = "other"

Strip tracking params (`utm_campaign`, `utm_source`, `utm_medium`) from URLs before storing, to improve dedup accuracy.

#### Catch-up runner: `gate3A_serpApiCatchUp()` (DONE)

- Runs 4 keyword queries, `maxPages` = 15, no date filter
- Estimated cost: ~8 credits (Google Jobs exhausts at ~2 pages per query)
- Run once; completed Feb 2026. ~114 roles discovered across multiple runs.

#### Periodic runner: `gate3A_serpApiDaily()` (DONE)

- Runs same 4 keyword queries, `maxPages` = 5, no date filter
- Deduplication handles freshness (only new URLs written)
- ~8-10 credits per run. Run weekly (or every few days).
- Adaptive: stops when `next_page_token` is absent

#### Credit budget (free tier: 250/month)

- **Weekly runs:** ~8-10 credits x 4 = ~32-40/month. Buffer: 210+.
- **Ample room** for catch-up re-runs, location-targeted queries, or experimentation.
- If run every 2-3 days: ~80-120/month. Still well within budget.

#### What this does NOT change

- Existing Brave discovery functions remain untouched (can still run them).
- Existing enrichment (Gate 3B) and scoring (Gate 4) work unchanged -- they operate on rows in the Roles sheet regardless of source.
- Existing ATS feed functions remain available for depth at known companies.

#### Coverage limitations (documented)

- Google Jobs has an implicit result cap per query (~100-200 results before pagination exhausts).
- Combined OR query means Google ranks across all keywords by its own relevance; niche terms may get fewer results in the mix.
- For daily runs with `after:` filtering (last 2-3 days), total new postings are likely small enough that the cap is not a problem.
- For catch-up, using 3 separate keyword-group queries (not 1 combined) mitigates the ranking/cap issue.
- No single source captures every role in existence; the hybrid approach (aggregator + ATS APIs for known companies) provides the best combined coverage at $0.

#### Query tuning (to revisit)

- **"General Manager" excluded for now.** First catch-up returned mostly fast-food/retail GMs (KFC, Taco Bell, Wendy's, etc.). The term is valid in tech/startup context (e.g. "General Manager, Marketplace") but has extremely low signal-to-noise. **Revisit later:** add back with exclusions (e.g. `"general manager" -restaurant -food -retail -store -hotel -salon -automotive -dealership`) once the pipeline is stable and we can evaluate whether scoring alone is sufficient to filter noise or whether query-level exclusion is needed.
- **Keyword broadening (done).** Initial catch-up used strict exact-match phrases (e.g. `"Strategy Operations"`) which missed common variants like "Strategy & Operations", "Strategy & Ops", "Strategic Operations". Queries broadened to include these variants. Catch-up `after:` date filter also removed (was limiting results).
- **Split queries over combined (done).** Google Jobs caps at ~10-20 results per query regardless of pagination depth. A single combined OR query wastes this cap by mixing all keywords into one result set. Switched daily runner from 1 combined query to 4 separate keyword-group queries (same as catch-up), each getting its own ~10-20 results. Net effect: ~4x more unique results for the same or slightly more credits.
- **Date filter removed from daily (done).** The `after:` filter was reducing the result set. Deduplication handles freshness (only new URLs get written), so the date filter was redundant.
- **Run cadence: weekly is fine.** At ~8-10 credits per run and 250 credits/month, weekly runs use ~32-40 credits/month, leaving plenty of budget for catch-up runs or experimentation. Google Jobs results shift over time as new jobs are posted, so each weekly run will surface new roles even without a date filter.
- **Location-targeted queries (future).** SerpAPI supports a `location` parameter that shifts Google Jobs results by geography. Adding runs targeted at "Austin, TX" and "Remote" could surface roles not appearing in the default (US-wide) results. Deferred for now because location data is not always reliable, but worth testing later. Each location variant costs ~2 credits (1 query x ~2 pages).
- **Future tuning:** Monitor results for additional keyword gaps (e.g., titles that don't match any current query but should). Consider adding: `"operations lead"`, `"operations manager" strategy`, `"GM" tech OR startup`, or company/industry-specific terms.

---

## Changelog (iterate here)

- **Added:** Initial plan from your 12 items; prioritization and status.
- **Clarified:** Scope note at top: this plan refers to this specific set of questions first; can evolve into comprehensive project plan. Pulled in broader project context from context.md (goal, MVP state, desired next state) so PLAN.md has full picture in one place.
- **P0 #10:** Fixed Non-US location false positive: prefer US signal when both US and non-US appear in JD; check usSignals before nonUsSignals.
- **P0 #12:** Added README.md with Cursor vs Apps Script note.
- **P1 #2:** Audited search criteria; documented in context.md §3.3; confirmed Strategic Finance and other terms are captured.
- **P0 #10 (follow-up):** Added analysis section "Location & work-site scoring (analysis)" and P1 item 5b (stale / job-not-found URLs). Location rules: non-US *listed* location -> flag; US on-site tiers (Austin ok, NYC some, SF higher, elsewhere significant). Implementation deferred until rules confirmed.
- **P1 #5a:** Documented discovery job-posting age: no freshness filter is applied (Brave API called without freshness param); intent for initial runs is to capture older-but-active roles (e.g. up to ~2 months); later can add optional freshness=pd/pw for recent-only runs. Comment added in JobDiscovery.ts.
- **P1 #5c:** Documented why 258 != "all matching roles" (Brave caps + search-index subset). Added context.md §3.4 and plan item 5c with audit process: company-level recall check (pick companies, count matching roles on board vs in sheet), optional Brave total logging.
- **Feb 2026:** Added "Where we are / What's next"; context §3.5 (6-min limit, Brave vs ATS-feed per-source, ATS batching, Path #2 limited value now -- better for future "top companies watch"). Plan 5e reframed; suggested order updated. ATS feed deferred as primary discovery until ranked top-companies list exists.
- **Feb 2026:** Gate 3A daily zero results (5g): assessed -- Brave `freshness` = page crawl date, not job post date; daily over-filters. Plan: remove/relax freshness for daily. Stale jobs (5b): added user data (93/151 dead on apply, 61%); next steps: run discovery more often, optional HEAD before apply. 5h: Gate 3A summary -- what we changed, how we capture new roles, dedupe (post-retrieval only; Brave has no exclude-URL API), same-order risk (use 10 pages for daily), and "other questions to consider." Daily run increased to 10 pages; optional log of Brave more_results_available.
- **Feb 2026:** Section 6 Discovery redesign: first-principles analysis. Documented why Brave-primary fails (stale index, 61% dead on apply, incomplete coverage). Evaluated all available approaches: search engines (Brave, SerpAPI/Google Jobs), aggregators (Adzuna, JSearch), ATS public APIs (Lever/Ashby/Greenhouse per-company), ATS global feeds (Lever/Greenhouse have none; Ashby partner feed gated), Google CTS (not applicable). Recommended path: test a job-specific aggregator (SerpAPI Google Jobs or Adzuna) for freshness and coverage; if good, build hybrid (aggregator for broad discovery + ATS APIs for depth). Open questions documented. No implementation yet.
- **Feb 2026:** Updated "Recommended next steps" and "Suggested order" to reflect discovery redesign as top priority.
- **Feb 2026:** Discovery redesign decision: SerpAPI Google Jobs free tier ($0/month, 250 searches/month). Research completed: evaluated SerpAPI, Adzuna, JSearch pricing and capabilities. Key optimization: combined OR queries reduce credit usage by ~80%. Google Jobs supports `OR`, `after:`, quoted phrases; returns `posted_at`, direct ATS URLs in `apply_options`, aggregates from LinkedIn/Indeed/etc. Section 6.4 updated from speculative to concrete; 6.5 open questions updated with answers; 6.6 added with full implementation spec (query constants, core function, catch-up + daily runners, URL canonicalization, credit budget, coverage limitations). Migrated plan from `.cursor/plans/serpapi_google_jobs_integration_3619aceb.plan.md` into PLAN.md; old plan files obsoleted. Next steps and suggested order updated.
- **Feb 2026:** SerpAPI Google Jobs integration COMPLETE. Catch-up run done (~114 roles). Daily runner updated: split into 4 separate keyword queries (Google Jobs caps at ~10-20 per query; splitting gives ~4x coverage). Date filter removed (dedup handles freshness). Queries broadened to include "Strategy & Operations", "Strategy & Ops", "Strategic Operations" variants. "General Manager" excluded (too much fast-food/retail noise). Weekly cadence recommended (~8-10 credits/run, ~32-40/month). Location-targeted queries noted as future enhancement.
- **Feb 2026:** Gate 3B updates: batch cap increased from 50 to 120 rows/run. `serpapi_google_jobs` and `linkedin_alert` added to allowed sources. JD noise truncation (`truncateJdNoise_()`) added to strip LinkedIn sidebar content (Similar jobs, People also viewed, etc.) at known markers.
- **Feb 2026:** LinkedIn job alerts ingestion COMPLETE. Built `gate1_ingestLinkedInAlerts()`: scans Gmail for LinkedIn alert emails, parses HTML to extract job title (from nested link text), company (from img alt), location (Unicode separator + City/STATE fallback). First run: 46 new roles from 11 emails. High-quality companies (xAI, Google, Stripe, Microsoft, GitHub, etc.) with variant titles not covered by SerpAPI queries. Diagnostic function for verifying parsing. LinkedIn public job pages accessible for enrichment (54/56 success rate).
- **Feb 2026:** Plan comprehensive review. Updated "Where we are" to reflect 3 operational discovery sources (~500+ roles). Marked SerpAPI and LinkedIn as DONE. Rewrote suggested order: location scoring -> target companies -> ATS URL resolver -> scoring audit. Marked Brave analysis sections as historical. Added #9 (target company identification and board monitoring) with 3 phases: build list, monitor boards, cold outreach.
- *(Add short lines here as we complete or change items.)*
