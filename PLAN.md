# JobDiscovery Project Plan

**Purpose:** Living document to prioritize, sequence, and track progress. Update as we complete items and add new goals.

**Scope of this document:** This plan *started* from a specific set of 12 questions (planning file, search criteria, Applied/Falcon sync, custom answers, LinkedIn, scalability, scoring bugs, etc.). It is **not** yet a full project plan. As we add broader goals, phases, and context from `context.md` (and elsewhere), this file can become the **single comprehensive project plan**. Until then, treat the sections below as "plan for this batch of questions" plus any broader context we pull in.

---

## Broader project context (from context.md)

- **Goal:** System that runs as autonomously as possible to (1) discover new job postings daily matching target roles (Strategy & Operations, BizOps, Head of Business Ops/Strategy, Strategic Finance, GM, Chief of Staff, etc.) across ATS domains, (2) store in a structured tracker (Sheet for now), (3) enrich with JD text + key fields, (4) compute fit score and rank, (5) on demand generate draft responses to application questions. Constraints: free/cheap MVP first; no brittle SERP scraping; avoid dead ends (e.g. Google Custom Search JSON API).
- **Current MVP state:** Discovery via Brave (Lever, Ashby, Greenhouse); Gate 3B enrichment (incl. Ashby API); Gate 4 heuristic scoring; Roles + Logs in Google Sheet. Pipeline works; some Ashby TEXT_TOO_SHORT and scoring refinements in progress.
- **Desired next state (context §5):** Daily run: discover → enrich → score; Shortlist for review; robust to 404s, demo boards, missing fields. Later consideration: older results for broader coverage.
- *Additional vision (your expanded objectives) is captured under P4 item 4 below.*

---

## Where we are / What's next (assessment)

**Current state:** Discovery (Brave catch-up + daily, split by source to avoid 6-min timeout), enrichment (Gate 3B, incl. Ashby API), scoring (Gate 4 v0). Roles sheet has ~364 rows from Lever/Ashby/Greenhouse. Path #2 (ATS feed) is implemented: discover from ATS APIs using companies already in the sheet, batched (18 companies per run) to stay under 6 min.

**Limits we hit:** (1) Brave returns a finite slice per query; re-runs add ~0 when that slice is already in the sheet. (2) Apps Script 6-min limit: full catch-up and full ATS feed time out; we use per-source and batching. (3) ATS feed only sees companies we already have, so it doesn’t expand the *universe* of companies—it can add more roles at those companies.

**Recommended next steps (in order):**
1. **Stabilize and use what we have:** Run daily discovery (or per-source catch-up if you want a refresh), enrich, score. Use the shortlist; mark applied; decide Falcon sync (P1 #5).
2. **Scoring and location:** Confirm location rules (PLAN “Location & work-site scoring”) and implement if you want (non-US listed location, US on-site tiers). Optionally run scoring audit (P2 #11) when you have a gold set.
3. **Defer ATS feed as primary discovery:** Keep the ATS-feed code for later. Revisit when we have a **“top companies”** list (from fit score, manual list, or P2/P4 company-fit work); then use ATS feed as a **“watch these companies for new openings”** job, not as a way to find new companies.
4. **Later:** Falcon sync script, custom-answers workflow (P3), company fit / cold outreach (P4).

---

## Priority overview (this batch of questions)

| P | Meaning | Items |
|---|--------|--------|
| **P0** | Fix now (incorrect behavior or confusion) | 10, 12 |
| **P1** | Foundation (decisions + quick wins) | 1, 2, 5 |
| **P2** | Scoring & prioritization (quality of fit) | 3, 9, 11, 13 |
| **P3** | Workflows & scripts (apply, custom answers) | 5 sync, 6 |
| **P4** | Vision, scale, new sources | 4, 7, 8 |

---

## P0 – Fix now

### 10. Scoring bug: incorrect "Non-US location" penalty (and follow-up: overcorrection)
- **Issue:** e.g. Whatnot Ashby role was incorrectly penalized; we then defaulted to "US OK" and only flagged explicit "based in X" patterns.
- **Overcorrection:** Some roles that *should* be flagged are now not: e.g. Match Group (listed Singapore), Jobgether (Philippines), 360learning (Paris). Whatnot (US cities + "Europe as market") is correctly US. User suspects: if a job is *listed* in a non-US country (even if "remote"), comp/eligibility is likely for that market, so should be flagged.
- **Analysis (decide before implementing):** See **"Location & work-site scoring (analysis)"** below. Covers: (1) non-US *listed* location (Singapore, Paris, Philippines, etc.) → flag; (2) US on-site by city (Austin ok, NYC some penalty, SF/Bay higher, elsewhere significant); (3) "Remote" with non-US country → treat as non-US.
- **Status:** Analysis added; implementation deferred until rules are confirmed

### 12. Cursor "73 problems" vs Apps Script runs fine
- **Explanation (no code change):** Cursor runs TypeScript/ESLint in a Node/TS environment. Apps Script is a different runtime (V8, no TS, different globals like `SpreadsheetApp`). So Cursor flags things that Apps Script doesn’t (types, lint rules, undefined globals). The script is valid for Apps Script; the "problems" are environment mismatch.
- **Options:** (a) Ignore in Cursor; (b) add a minimal `clasp` or type stub setup so Cursor is happier; (c) add a short note in repo README. Recommend (a) or (c) for now.
- **Done:** Added README.md with short note explaining this; recommend ignoring Cursor warnings for this script.
- **Status:** Done

---

## P1 – Foundation

### 1. Planning file and iteration
- **Decision:** Yes. This file (`PLAN.md`) is that planning doc. Iterate here: update status, add "Done" dates, and new items as we go.
- **Status:** In use

### 2. Search criteria – what we capture (e.g. Strategic Finance)
- **Question:** Are we capturing strategic finance and other target roles?
- **Done:** Audited queries. All three sources use: Strategy Operations, BizOps, Business Operations, Strategic Finance, Strategy, Operations. Documented in context.md §3.3 Search criteria. To add terms (e.g. Chief of Staff, GM), edit the gate3A_braveSearchToRoles_* query strings.
- **Status:** Done

### 5a. Discovery: job posting age (freshness filter)
- **Current behavior:** **No age filter is applied.** The active discovery path (`braveSearchToRoles_generic_`) calls the Brave Web Search API **without** a `freshness` parameter. Brave returns results by its default (relevance; recency behavior is up to the engine). So we are not prematurely filtering out older-but-still-active postings.
- **Brave API option:** If we did pass `freshness`, supported values are: `pd` = past 24h, `pw` = past 7 days, `pm` = past 31 days, `py` = past year (or custom date range).
- **Intent for initial runs:** Capture anything still active and a good fit—including roles posted up to ~2 months ago (TBD). Keep **no** freshness param (or explicitly use `pm` / `py` if we want to force a wide window). Do **not** use `pd`/`pw` until we’re ready to limit to “recent only” (e.g. daily runs).
- **Later:** When switching to “recent only,” add an optional `freshness` param to the generic Brave call (e.g. `freshness: "pd"` or `"pw"`) and document in plan/context.
- **Status:** Documented; no code change for now (current behavior is correct for initial runs)

### 5b. Discovery: many captured URLs return "job not found"
- **Observation:** A large share (close to half) of URLs captured in the discovery process return some form of "job not found" (or equivalent) when visiting the URL. This is a data-quality / freshness issue, not a code bug per se.
- **Plan:** Document this as expected behavior or a known limitation; consider (later) ways to reduce or surface it: e.g. expected stale rate in context, discovery freshness (how old results we ingest are), optional HEAD/fetch at discovery time to mark likely-dead, or archiving/filtering by "last seen open". No code change required immediately—capture in plan for follow-up.
- **Status:** Added to plan; follow-up TBD

### 5f. Enrichment failures (HTTP_404, TEXT_TOO_SHORT): path to fixing and scoring
- **Observed:** Of 363 total records, 95 HTTP_404 and 105 TEXT_TOO_SHORT. 404s are invalid/closed links; TEXT_TOO_SHORT are valid URLs where we did not get enough content (e.g. Ashby JS-rendered page, or stub/closed page returning 200).
- **Scoring fix (done):** Gate 4 previously only scored rows with status **Enriched** and had a **cap of 100**. Now: (1) cap removed so **all** Enriched rows are scored; (2) rows with status **FetchError** and failure_reason **TEXT_TOO_SHORT** are also scored (using title, company, and whatever jd/loc/work we have) so you can review them. 404/Dead rows correctly remain unscored.
- **Path to reducing failures:**  
  - **HTTP_404:** Already handled (mark Dead, do not retry). To reduce rate: run discovery more frequently so we capture jobs before they are pulled; or accept some stale rate; or (later) optional HEAD at discovery time to skip likely-dead URLs.  
  - **TEXT_TOO_SHORT:** (1) Improve Ashby API URL→board/slug matching so more Ashby jobs get full JD via API instead of raw fetch (see existing fetchAshbyJobDescription_ and URL parsing). (2) Use `gate3B_resetTextTooShortToNew()` then re-run Gate 3B to retry; some may succeed on retry. (3) For now they are scored for review so you can prioritize fixing or manual check.
- **Status:** Gate 4 updated; path documented. Follow-up: audit Ashby matching for TEXT_TOO_SHORT rows, consider preserving short jd_text for scoring instead of clearing.

### 5c. Audit / test discovery coverage
- **Question:** The Roles sheet (e.g. 258 rows) is not “all matching roles” across the three sites—it’s what Brave returned for our 3 queries, capped at ~140 (Lever) + 100 (Ashby) + 100 (Greenhouse) per run, and Brave only surfaces a subset of indexed pages. User has seen same-company, same-keyword roles that weren’t picked up. How to audit and test?
- **Right way to audit:**
  1. **Document the caps** (done in context.md §3.4): max 200 per query (we use 7/5/5 pages → 20 per page), and Brave is a search index, not a full job index.
  2. **Company-level recall check:** Pick 3–5 companies that appear in the sheet where you’ve already noticed missing roles. For each company, open the ATS job listing page (e.g. `https://jobs.lever.co/<company>` or Ashby/Greenhouse equivalent) and list every job whose title/role matches our keywords. Count: (a) how many we have in the sheet for that company, (b) how many exist on the board that match. Recall = (a)/(b). This quantifies “how much we’re missing” per company.
  3. **Optional: log Brave’s reported total:** If the Brave API returns a total result count in the response (e.g. `data.web.query.total` or similar), log it in Gate 3A so we can compare “Brave says there are X results” vs “we ingested Y” (and Y ≤ 7×20 or 5×20 per source).
  4. **Interpret:** Low recall per company suggests either (a) Brave doesn’t index/rank those URLs in the first N pages, or (b) our query phrasing misses them. That informs next steps (e.g. more queries, different keywords, or supplementing with direct ATS/API discovery).
- **Status:** Process documented; run company-level audit when ready; optional logging can be added later

### 5d. Discovery: re-runs don't add "the next 140"—how to capture more
- **User's understanding (correct):** If there are 1000 matching roles on Lever, each run we only request the first 7 pages (140 results). We get the *same* ~140 every time. Dedupe happens *after* we get results (skip URLs already in sheet), so running again does **not** give us "the next 140"—we add ~0 new. Brave's API does not allow offset > 9, so we can never get more than **200 results per query** from Brave. So we're capped at one slice per query; re-runs don't expand that slice.
- **Two ways to capture more:**
  1. **Max out Brave + query variations (stay with current approach):** Use **10 pages** for all three (200 max per query). Run **multiple queries per site** with different keyword emphasis. Each query gets its own 200; merge and dedupe.
  2. **Direct ATS discovery (fuller population):** See 5e below—sitemaps/feeds vs per-company, and why per-company is a poor fit when we don't have a company list.
- **Recommendation (cost vs completeness):** Run Path #1 as a **one-time "catch up" run** (10 pages + multiple query variations per site) to build a much larger initial population. Then switch to a **lighter recurring process** (fewer queries, e.g. 1 query per site and 5–7 pages, optionally `freshness=pd` or `pw` for recent-only) so daily/weekly runs mainly pick up *new* postings without blowing Brave API cost. One-time cost for catch-up; low ongoing cost for maintenance.
- **Status:** Done. Implemented: `gate3A_runAllSources_catchUp()` (10 pages, 3 Lever + 2 Ashby + 2 Greenhouse query variants); `gate3A_runAllSources_daily()` (6 pages, 1 query per site). Single-source `gate3A_braveSearchToRoles_*` kept for ad-hoc runs. **Apps Script 6-min limit:** Full catch-up can time out; use `gate3A_runAllSources_catchUpLeverOnly()`, `catchUpAshbyOnly()`, `catchUpGreenhouseOnly()` in three separate runs to stay under the limit.

### 5e. Path #2 (direct ATS): implemented; limited value now, better for "top companies watch" later
- **Company list concern:** Path #2 requires knowing company identifiers. We derive them from existing Roles (URLs we already have). So we only poll companies we've already found—we don't discover *new* companies this way.
- **What we implemented:** Company-list-from-sheet: for each (ats, company) in Roles, call Lever/Ashby/Greenhouse API, get all jobs, filter by title keywords, append new URLs with source=ats_feed. Batching added: maxCompanies (default 18), offset for next batch, to stay under 6-min limit. Per-source wrappers: `gate3A_discoverFromAtsFeedsLeverOnly()` etc. Logs: "Fetched X jobs, Y matched keywords, Z already in sheet, wrote W new."
- **Assessment:** Limited value for *broad* discovery right now—we're only searching 18 companies at a time that we've already identified. **Higher value later:** when we have a **ranking of top potential companies** (from fit score, manual list, or P2/P4 company-fit work), use this same ATS-feed flow as a **"watch these companies for new openings"** job: maintain a curated (ats, company) list for top companies, run periodically (batched), filter by keywords, append new roles. So: keep the code; defer as primary discovery; revisit when we have a "top companies" workflow (see P2 #9, P4 #4 cold outreach).
- **Status:** Implemented; use optionally. Prioritize when "top companies" list exists.

**How to proceed (Path #1 vs Better Path #2):**

| Step | What | Why |
|------|------|-----|
| **1. Path #1 catch-up (do first)** | Implement and run the one-time "catch up" (10 pages + 2–3 query variants per site). Run it once. | Gets you a much larger initial set using the pipeline you already have. No new discovery mechanism—just more Brave queries once. |
| **2. Path #1 daily (recurring)** | Use the lighter run (1 query per site, 5–7 pages, optional freshness) on a schedule. | Keeps adding *new* postings over time without high Brave cost. Same sheet, same enrich/score flow. |
| **3. Better Path #2 (optional, after 1–2)** | *Research only* at first: do Lever, Ashby, and Greenhouse expose one URL (e.g. sitemap or feed) that lists many or all job URLs in one response? | If yes, we could add a second discovery path: fetch that URL, parse out job links, filter by keywords, append to the same Roles sheet (dedupe as now). That would use **no Brave** for that slice and could give very high coverage for that ATS. If no such URL exists, we stay with Path #1 only. |

**Better Path #2 in plain terms:** Today we "ask Brave" for job pages (Brave has indexed them). Better Path #2 would mean "ask the ATS itself" for a single page or feed that already lists lots of job URLs—like a sitemap or an RSS/XML feed for job boards. One request per ATS could return hundreds/thousands of URLs; we'd filter by our keywords and add new ones to the sheet. We don't yet know if each ATS offers that; step 3 is to check. If they do, we add it; if not, Path #1 (catch-up + daily) is the discovery strategy.

### 5. How to mark "Applied" and sync to legacy tracker (Project Falcon)
- **Current:** You added columns "Applied?" and "Date Applied / Commentary".
- **Questions:** (1) How to mark applied in JobDiscovery. (2) Whether to copy applied rows to Falcon or make Falcon the single source of truth.
- **Approach:**
  - **Marking applied:** Use your two columns as the source of truth in JobDiscovery. Optionally add a small script: "Mark selected row(s) as Applied with today’s date" for speed.
  - **Sync vs single source:** Decide one approach: (A) JobDiscovery is source of truth; script exports "Applied" rows to Falcon (one-way sync). (B) Falcon is master; you log applications there and optionally link back (e.g. URL) to JobDiscovery. (C) Both: log in both, script copies from JobDiscovery → Falcon so Falcon has a complete log. Recommendation: (C) or (A) so Falcon stays the master application log and we don’t duplicate manual entry.
  - **Script:** Once approach is decided, add a function (e.g. "Copy applied from JobDiscovery to Falcon") that runs on demand or on a trigger: read rows where Applied? = yes, append to Falcon sheet (with mapping of columns). Requires Falcon sheet ID and column mapping.
- **Status:** Not started; decision needed on sync direction

---

## P2 – Scoring & prioritization

### 3. Your notes on top-scored results
- **Note:** You have notes on top scored results to share later. Use them to refine scoring and ranking.
- **When:** Share when ready; we’ll use as input for item 11 (scoring audit) and any one-off scoring tweaks.
- **Status:** Pending your input

### 9. Similar companies + company fit ranking
- **Goal:** Find companies similar to those where we’re finding good roles; rank by company fit + role fit.
- **Approach:** Research phase. Options: (a) manual list of "similar companies" per employer; (b) use a data source (e.g. LinkedIn, Clearbit) for "similar companies"; (c) simple heuristic (sector, size, funding). Then add a "company_fit" or "similar_to" concept and combine with role fit_score. Likely P4 after core pipeline is stable.
- **Status:** Backlog

### 11. Process to audit and refine the scoring algorithm
- **Goal:** Systematic way to improve scoring (not just ad hoc role-by-role).
- **Approach:** (1) Define a small "gold set": 10–20 roles you label as clearly high-fit vs low-fit. (2) Run current scorer on them; compare scores to your labels. (3) Identify systematic errors (e.g. "Non-US" false positives, title misclassification). (4) Adjust heuristics and re-run. (5) Optionally: export a CSV of scored roles + key fields and have an AI or script suggest rule changes. Iterate. Document the process in `context.md` or this plan.
- **Status:** Not started

### 13. Score and prioritize: applied roles + archived (custom-questions) roles
- **Goal:** Develop a process to score and prioritize two buckets so you can act on them: (1) **Roles you’ve applied to** — prioritize for **follow-up** (e.g. email/LinkedIn). (2) **Roles you’ve archived but not applied to** because they have custom questions — prioritize for **custom application** (draft answers, then apply).
- **Approach:** (1) Ensure both buckets are identifiable in the sheet (e.g. Applied? = yes vs a separate “Archived / custom Q” flag or status). (2) Run fit_score (or a variant) on each bucket so they have a consistent score/rank. (3) Produce a simple view or export: e.g. “Applied, ranked by fit” (for follow-up priority) and “Archived / custom Q, ranked by fit” (for custom-application priority). (4) Optionally: link to P3 #6 (custom answers workflow) for drafting and to P4 follow-up for applied. No new discovery; this is scoring + prioritization of existing rows.
- **Status:** Added to plan; not started

---

## P3 – Workflows & scripts

### 5 (sync). Script: JobDiscovery → Project Falcon
- **Depends on:** Decision in item 5 (sync direction and Falcon format).
- **Deliverable:** One function (or trigger) that copies "Applied" rows from JobDiscovery to Falcon with column mapping.
- **Status:** Blocked on P1 item 5

### 6. Custom list: postings requiring custom answers
- **Goal:** Take your existing list of postings that need custom responses → check if still open → score/prioritize → support drafting answers.
- **Approach:** (1) Define input: list of URLs or a tab/sheet. (2) "Check if still active": reuse Gate 3B-style fetch (or HEAD); mark open/closed. (3) Score/prioritize: run same fit_score (or a lighter version) if we have JD text, or use title/source only. (4) Drafting: separate flow (e.g. export to a doc, or a prompt that takes JD + question and drafts an answer). Can be a new script or a small suite of functions.
- **Status:** Not started

---

## P4 – Vision, scale, new sources

### 4. Expanded objective (apply to all above fit, follow-up, cold outreach)
- **Summary of goals:**
  - Submit applications for every job above a fit threshold, including posts >1 week old if still open.
  - Cover Lever, Greenhouse, Ashby plus other sources (e.g. company career pages, Fanatics-style boards).
  - Handle custom questions: identify them, draft and iterate answers, submit quickly.
  - Follow-up: email/LinkedIn for highest-fit roles.
  - Cold outreach: identify top companies with no current posting; find contacts; draft outreach.
- **Approach:** Treat as roadmap. Break into phases: (Phase 1) current pipeline + apply tracking + sync to Falcon. (Phase 2) Custom answers workflow and "apply above threshold" automation. (Phase 3) Follow-up and cold outreach. Capture in `context.md` as "Desired next state" or "Roadmap" and refine here as we go.
- **Status:** Captured; to be reflected in context.md

### 7. LinkedIn ingestion
- **Question:** How to ingest from LinkedIn; it’s an aggregator and may have roles not on our three boards.
- **Options (research):** (a) LinkedIn API / official products (often restricted, paid). (b) Scraping (ToS and reliability issues). (c) LinkedIn job alerts → email → parse (similar to Google Alerts flow). (d) Third-party job aggregators that include LinkedIn (e.g. Adzuna, Indeed API) and may be easier to integrate. (e) Manual: export or paste from LinkedIn into a sheet for scoring. Document options and constraints (ToS, cost, stability) before choosing.
- **Status:** Research backlog

### 8. Scalability – when does the sheet break?
- **Question:** At what point does the Google Sheet become insufficient, and what to do?
- **Approach:** (1) Rough limits: Sheets has cell limits (~10M cells), script runtime (6 min), URL Fetch quotas. Estimate: e.g. 10k–50k rows with current columns might be fine; beyond that, export/archiving or migration. (2) Mitigations: archive old rows (e.g. "Dead" or applied >90 days ago) to another sheet or CSV; limit active sheet to "current" roles. (3) Migration path: when we hit limits, move to a DB (e.g. SQLite + script, or Supabase) and keep Sheets as a view or export target. Document thresholds and "when to migrate" in this plan or context.md.
- **Status:** Not started

---

## Suggested order to work through (next steps)

1. **Now:** Use current pipeline (daily or per-source Brave discovery → Gate 3B → Gate 4); shortlist and apply; decide Falcon sync (P1 #5).
2. **P0/P2:** Implement location scoring rules when confirmed (P0 #10); optionally run scoring audit (P2 #11) when you have a gold set.
3. **P3/P4:** Falcon sync script (#5), custom-list workflow (#6), then roadmap (#4), LinkedIn (#7), scale (#8). When you have a **top companies** list, use ATS feed as "watch these companies for new openings" (5e).

---

## Location & work-site scoring (analysis)

*Decide these rules before implementing changes to Gate 4 / `scoreRoleV0_`.*

### 1. Non-US *listed* location (flag and penalize)
- **Rule:** If the job is **listed** in a non-US country or city (e.g. Singapore, Paris, Philippines, London, Berlin), treat as non-US and apply the non-US penalty—**regardless** of whether the posting also says "Remote".
- **Rationale:** Listing location usually reflects comp/eligibility for that market; "Remote" in that context typically means "remote within that country/region," not "remote from the US."
- **Signals to use:** Primary listed location from the board (e.g. `location_raw` or equivalent from Lever/Ashby), or clear "Location: [city/country]" in the JD when it’s a non-US place. Explicit non-US city/country names (Singapore, Paris, Philippines, UK, London, Berlin, etc.) as the *primary* location → `location_us_ok = FALSE`, -40 (or current penalty).
- **Do *not* flag:** US cities (e.g. Los Angeles, San Francisco, New York, Austin, Phoenix); or JD text that only *mentions* Europe/other regions as markets the company serves (e.g. "we operate in North America and Europe").

### 2. "Remote" with a non-US country
- **Rule:** Same as (1). If the posting says "Remote" but the listed location is a non-US country (e.g. "Remote - Philippines", "Singapore" with "Full-Time / Hybrid"), treat as non-US. One penalty dimension is enough (non-US); no need for a separate "remote but non-US" rule beyond applying (1).

### 3. US on-site location (separate dimension from US vs non-US)
- **Rule:** For roles that are **on-site** (or hybrid with strong on-site expectation) **in the US**, apply a **location-preference** penalty by metro, not a "non-US" penalty:
  - **Austin:** No penalty (preferred).
  - **NYC area:** Some penalty (acceptable but not preferred).
  - **SF Bay Area:** Higher penalty (still possibly acceptable).
  - **On-site elsewhere in the US:** Significant penalty—only the best roles on all other attributes would still be worth pursuing.
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

## Changelog (iterate here)

- **Added:** Initial plan from your 12 items; prioritization and status.
- **Clarified:** Scope note at top: this plan refers to this specific set of questions first; can evolve into comprehensive project plan. Pulled in broader project context from context.md (goal, MVP state, desired next state) so PLAN.md has full picture in one place.
- **P0 #10:** Fixed Non-US location false positive: prefer US signal when both US and non-US appear in JD; check usSignals before nonUsSignals.
- **P0 #12:** Added README.md with Cursor vs Apps Script note.
- **P1 #2:** Audited search criteria; documented in context.md §3.3; confirmed Strategic Finance and other terms are captured.
- **P0 #10 (follow-up):** Added analysis section "Location & work-site scoring (analysis)" and P1 item 5b (stale / job-not-found URLs). Location rules: non-US *listed* location → flag; US on-site tiers (Austin ok, NYC some, SF higher, elsewhere significant). Implementation deferred until rules confirmed.
- **P1 #5a:** Documented discovery job-posting age: no freshness filter is applied (Brave API called without freshness param); intent for initial runs is to capture older-but-active roles (e.g. up to ~2 months); later can add optional freshness=pd/pw for recent-only runs. Comment added in JobDiscovery.ts.
- **P1 #5c:** Documented why 258 ≠ “all matching roles” (Brave caps + search-index subset). Added context.md §3.4 and plan item 5c with audit process: company-level recall check (pick companies, count matching roles on board vs in sheet), optional Brave total logging.
- **Feb 2026:** Added "Where we are / What's next"; context §3.5 (6-min limit, Brave vs ATS-feed per-source, ATS batching, Path #2 limited value now—better for future "top companies watch"). Plan 5e reframed; suggested order updated. ATS feed deferred as primary discovery until ranked top-companies list exists.
- *(Add short lines here as we complete or change items.)*
