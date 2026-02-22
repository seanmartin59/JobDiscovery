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

## Priority overview (this batch of questions)

| P | Meaning | Items |
|---|--------|--------|
| **P0** | Fix now (incorrect behavior or confusion) | 10, 12 |
| **P1** | Foundation (decisions + quick wins) | 1, 2, 5 |
| **P2** | Scoring & prioritization (quality of fit) | 3, 9, 11 |
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
- **Status:** Done. Implemented: `gate3A_runAllSources_catchUp()` (10 pages, 3 Lever + 2 Ashby + 2 Greenhouse query variants); `gate3A_runAllSources_daily()` (6 pages, 1 query per site). Single-source `gate3A_braveSearchToRoles_*` kept for ad-hoc runs.

### 5e. Path #2 (direct ATS): clarifying company list and API cost
- **Company list concern:** Path #2 as "hit each company's listing page" *does* require knowing company identifiers (e.g. Lever's `{clientname}` in `api.lever.co/v0/postings/{clientname}`). We don't have that list—discovering which companies have fitting roles is part of the problem. So per-company discovery is a poor fit for initial coverage.
- **API budget concern:** Per-company calls would be **direct HTTP to the ATS** (Lever/Ashby/Greenhouse), not Brave. So they wouldn't burn Brave API budget. But we'd still need to *get* the company list somehow (e.g. from our Brave-discovered rows over time, or from a third-party list), and then N companies = N requests to the ATS (rate limits and our own script time, not Brave cost).
- **Better Path #2 angle—sitemaps / aggregate feeds:** Sitemaps at jobs.lever.co, boards.greenhouse.io returned 404; no single "all jobs" feed found. **Implemented instead:** company-list-from-sheet approach: derive unique (ats, company) from existing Roles URLs, then for each company call the ATS API (Lever postings API, Ashby job-board API, Greenhouse boards API) to get all jobs, filter by title keywords, append new URLs to the same sheet with source=ats_feed. No Brave cost; expands coverage at companies we already know. Gate 3B updated to enrich source=ats_feed rows. Run `gate3A_discoverFromAtsFeeds()` after Brave discovery (e.g. after catch-up or daily).
- **Status:** Implemented. Use `gate3A_discoverFromAtsFeeds()` as an additive step; does not replace Brave discovery.

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

1. **P0:** Fix scoring bug (#10) for Non-US false positive; add brief README/note for Cursor "problems" (#12).
2. **P1:** Audit search criteria (#2); document in context. Decide Falcon sync approach (#5) and add Applied columns to context schema.
3. **P2:** Define scoring audit process (#11); when you share notes (#3), run a first pass and tune.
4. **P3/P4:** After that, tackle Falcon sync script (#5), custom-list workflow (#6), then roadmap (#4), LinkedIn (#7), scale (#8), company fit (#9) as capacity allows.

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
- *(Add short lines here as we complete or change items.)*
