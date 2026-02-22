/**
 * Gate 0: prove Apps Script can write to this spreadsheet.
 * Creates/ensures Roles and Logs tabs + headers, then writes one test row to each.
 */

function gate0_writeTestRows() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
  
    // Ensure tabs exist
    const rolesSheet = ensureSheet_(ss, "Roles");
    const logsSheet = ensureSheet_(ss, "Logs");
  
    // Ensure headers
    ensureHeaders_(rolesSheet, [
      "canonical_url",
      "company",
      "job_title",
      "source",
      "discovered_date",
      "status"
    ]);
  
    ensureHeaders_(logsSheet, [
      "timestamp",
      "gate",
      "message"
    ]);
  
    // Write one test row to Logs
    logsSheet.appendRow([
      new Date(),
      "Gate 0",
      "✅ Apps Script successfully wrote to Logs."
    ]);
  
    // Write one test row to Roles
    rolesSheet.appendRow([
      "https://example.com/job/test",
      "TestCo",
      "Test Role (Gate 0)",
      "manual_test",
      new Date(),
      "New"
    ]);
  
    Logger.log("Gate 0 complete: wrote test rows to Roles and Logs.");
  }
  
  /** Helpers */
  
  function ensureSheet_(ss, name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    return sheet;
  }
  
  function ensureHeaders_(sheet, headers) {
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const headersMatch =
      firstRow.length === headers.length &&
      headers.every((h, i) => (firstRow[i] || "").toString().trim() === h);
  
    if (!headersMatch) {
      // Clear the first row only, then set headers (do not wipe existing data)
      sheet.getRange(1, 1, 1, headers.length).clearContent();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  
  /**
   * Gate 1A (proof): Ingest Google Alerts emails and extract only jobs.lever.co URLs.
   * Writes new URLs into Roles and logs a summary row in Logs.
   *
   * If you add the Gmail label JobDiscovery/Alerts, this will only scan labeled emails.
   * If you haven't set the label yet, it will fall back to scanning recent Google Alert emails.
   */
  function gate1A_ingestGoogleAlerts_lever_proof() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rolesSheet = ensureSheet_(ss, "Roles");
    const logsSheet = ensureSheet_(ss, "Logs");
  
    // Prefer labeled emails (clean + precise). Fall back if label isn't set up yet.
    const labeledQuery = 'label:"JobDiscovery/Alerts" newer_than:14d';
    const fallbackQuery = 'newer_than:14d (from:googlealerts-noreply@google.com OR subject:"Google Alert")';
    const threads = GmailApp.search(labeledQuery, 0, 20);
    const usingQuery = threads.length ? labeledQuery : fallbackQuery;
    const threadsToScan = threads.length ? threads : GmailApp.search(fallbackQuery, 0, 20);
  
    let scannedMsgs = 0;
    let leverUrlsFound = 0;
    let written = 0;
  
    for (const thread of threadsToScan) {
      const messages = thread.getMessages();
      for (const msg of messages) {
        scannedMsgs += 1;
        const body = msg.getBody(); // HTML
  
        const urls = extractUrls_(body)
          .map(canonicalizeUrl_)
          .filter(Boolean)
          .filter(u => u.includes("jobs.lever.co/")); // proof focus: Lever only
  
        leverUrlsFound += urls.length;
  
        for (const u of urls) {
          if (!rolesHasUrl_(rolesSheet, u)) {
            rolesSheet.appendRow([
              u,
              "",            // company (later)
              "",            // job_title (later)
              "google_alert",
              new Date(),
              "New"
            ]);
            written += 1;
          }
        }
      }
    }
  
    logsSheet.appendRow([
      new Date(),
      "Gate 1A",
      `Query="${usingQuery}". Scanned ${threadsToScan.length} threads / ${scannedMsgs} msgs. Found ${leverUrlsFound} lever URLs. Wrote ${written} new rows.`
    ]);
  }
  
  /** Extract all http(s) URLs from a blob of HTML/text */
  function extractUrls_(html) {
    if (!html) return [];
  
    const urls = new Set();
  
    // Match href="..." or href='...' (case-insensitive)
    const hrefRe = /href\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi;
    let m;
    while ((m = hrefRe.exec(html)) !== null) {
      urls.add(m[2]);
    }
  
    // Match any raw URLs (covers plain text bodies)
    const rawRe = /https?:\/\/[^\s"'<>]+/g;
    const rawMatches = html.match(rawRe) || [];
    rawMatches.forEach(u => urls.add(u));
  
    return Array.from(urls);
  }
  
  /** Normalize by stripping common tracking params and fragments */
  function canonicalizeUrl_(url) {
    if (!url) return null;
  
    // Trim and remove surrounding punctuation that can sneak in
    let u = String(url).trim();
  
    // Some emails include trailing punctuation or brackets
    u = u.replace(/[)\].,;]+$/g, "");
  
    // Remove fragment
    u = u.split("#")[0];
  
    // Remove common tracking params without parsing full URL
    // (works even if URL class is unavailable)
    const parts = u.split("?");
    if (parts.length === 1) return parts[0];
  
    const base = parts[0];
    const query = parts.slice(1).join("?");
  
    const params = query.split("&").filter(Boolean);
  
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid"
    ]);
  
    const kept = [];
    for (const p of params) {
      const key = p.split("=")[0];
      if (!drop.has(key)) kept.push(p);
    }
  
    return kept.length ? `${base}?${kept.join("&")}` : base;
  }
  
  /** Check if Roles already contains canonical_url (simple scan for proof; optimize later) */
  function rolesHasUrl_(rolesSheet, canonicalUrl) {
    const lastRow = rolesSheet.getLastRow();
    if (lastRow < 2) return false;
    const values = rolesSheet.getRange(2, 1, lastRow, 1).getValues().flat();
    return values.includes(canonicalUrl);
  }
  function gate1_testEmail_ingest() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rolesSheet = ensureSheet_(ss, "Roles");
    const logsSheet = ensureSheet_(ss, "Logs");
  
    const query = 'subject:"JobDiscovery Test" newer_than:7d';
    const threads = GmailApp.search(query, 0, 5);
  
    let scannedMsgs = 0;
    let urlsFound = 0;
    let written = 0;
  
    for (const thread of threads) {
      for (const msg of thread.getMessages()) {
        scannedMsgs += 1;
  
        const html = msg.getBody() || "";
        const plain = msg.getPlainBody() || "";
  
        const urls = extractUrls_(html + "\n" + plain)
          .map(canonicalizeUrl_)
          .filter(Boolean);
  
        urlsFound += urls.length;
  
        for (const u of urls) {
          if (!rolesHasUrl_(rolesSheet, u)) {
            rolesSheet.appendRow([u, "", "", "test_email", new Date(), "New"]);
            written += 1;
          }
        }
      }
    }
  
    logsSheet.appendRow([
      new Date(),
      "Gate 1 (Test Email)",
      `Query="${query}". Threads=${threads.length}, Msgs=${scannedMsgs}, URLs=${urlsFound}, Wrote=${written}.`
    ]);
  }
  
  function sanitizeForLog_(s) {
    if (!s) return "(empty)";
    return s
      .replace(/\s+/g, " ")
      .replace(/</g, "[")
      .replace(/>/g, "]")
      .slice(0, 250);
  }
  
  function gate1_debug_testEmailBodies() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logsSheet = ensureSheet_(ss, "Logs");
  
    const query = 'subject:"JobDiscovery Test" newer_than:7d';
    const threads = GmailApp.search(query, 0, 5);
  
    if (!threads.length) {
      logsSheet.appendRow([new Date(), "Gate 1 Debug", `No threads for query: ${query}`]);
      return;
    }
  
    const thread = threads[0];
    const messages = thread.getMessages();
  
    logsSheet.appendRow([new Date(), "Gate 1 Debug", `Found ${threads.length} threads. Debugging first thread with ${messages.length} messages.`]);
  
    messages.forEach((msg, idx) => {
      const html = msg.getBody() || "";
      const plain = msg.getPlainBody() || "";
      const combined = html + "\n" + plain;
  
      const rawUrls = extractUrls_(combined);
      const canonUrls = rawUrls.map(canonicalizeUrl_).filter(Boolean);
  
      const htmlSample = sanitizeForLog_(html.slice(0, 250));
      const plainSample = sanitizeForLog_(plain.slice(0, 250));
      const urlSample = canonUrls.slice(0, 5).join(" | ") || "(none)";
  
      logsSheet.appendRow([
        new Date(),
        "Gate 1 Debug Msg",
        `msg#${idx + 1}/${messages.length} htmlLen=${html.length} plainLen=${plain.length} rawUrls=${rawUrls.length} canonUrls=${canonUrls.length} urlsSample=${urlSample}`
      ]);
  
      logsSheet.appendRow([
        new Date(),
        "Gate 1 Debug Snip",
        `msg#${idx + 1}: HTML=${htmlSample} | PLAIN=${plainSample}`
      ]);
    });
  }
  
  function gate1B_brave_smokeTest() {
    const token = PropertiesService.getScriptProperties().getProperty("BRAVE_SUBSCRIPTION_TOKEN");
    if (!token) throw new Error("Missing Script Property BRAVE_SUBSCRIPTION_TOKEN");
  
    const q = 'site:jobs.lever.co "Strategy Operations"';
    const url = "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(q) + "&count=5&country=us&search_lang=en";
  
    const resp = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { "X-Subscription-Token": token }
    });
  
    Logger.log("HTTP " + resp.getResponseCode());
    Logger.log(resp.getContentText().slice(0, 800));
  }
  
  function gate2_fetchAndExtract_lever() {
    const testUrl = "https://jobs.lever.co/CordTechnologies/edfa044b-3202-4fb2-ac4e-a5e09f080c79";
  
    const html = UrlFetchApp.fetch(testUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        "User-Agent": "Mozilla/5.0" // helps avoid some basic blocks
      }
    }).getContentText();
  
    Logger.log("htmlLen=" + html.length);
  
    const text = htmlToText_(html);
    Logger.log("textLen=" + text.length);
    Logger.log("TEXT SAMPLE:\n" + text.slice(0, 1200));
  
    // quick heuristics for common Lever sections
    Logger.log("Contains 'Responsibilities'? " + /responsibilit/i.test(text));
    Logger.log("Contains 'Requirements'? " + /requirement/i.test(text));
    Logger.log("Contains 'Apply'? " + /apply/i.test(text));
  }
  
  /**
   * Ashby job pages are JS-rendered; UrlFetchApp gets almost no content. Use their public API instead.
   * GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME} returns JSON with jobs[].descriptionPlain, jobUrl, location, workplaceType.
   */
  function fetchAshbyJobDescription_(url) {
    if (!url || !String(url).includes("jobs.ashbyhq.com")) return null;
    try {
      const pathMatch = url.match(/https:\/\/jobs\.ashbyhq\.com\/([^\/]+)/i);
      const boardName = pathMatch && pathMatch[1] ? pathMatch[1] : null;
      if (!boardName) return null;
      const apiUrl = "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(boardName);
      const resp = UrlFetchApp.fetch(apiUrl, {
        muteHttpExceptions: true,
        headers: { "Accept": "application/json" }
      });
      if (resp.getResponseCode() !== 200) return null;
      const data = JSON.parse(resp.getContentText());
      const jobs = (data && data.jobs) ? data.jobs : [];
      const canon = (String(url).split("#")[0] || "").replace(/\/$/, "").toLowerCase();
      const canonPath = canon.replace(/^https?:\/\/[^\/]+/i, "") || "/";
      const canonSegs = canonPath.split("/").filter(Boolean);
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const jobUrl = (job.jobUrl || "").replace(/\/$/, "").toLowerCase();
        const jobPath = jobUrl.replace(/^https?:\/\/[^\/]+/i, "") || "/";
        const jobSegs = jobPath.split("/").filter(Boolean);
        const exactPath = canonPath === jobPath || canon === jobUrl || canonPath.endsWith(jobPath) || jobPath.endsWith(canonPath) || canon.indexOf(jobUrl) !== -1 || jobUrl.indexOf(canon) !== -1;
        const boardAndSlugMatch = canonSegs.length >= 2 && jobSegs.length >= 1 && canonSegs[0] === jobSegs[0] && canonSegs[canonSegs.length - 1] === jobSegs[jobSegs.length - 1];
        if (exactPath || boardAndSlugMatch) {
          const text = (job.descriptionPlain || job.descriptionHtml || "").trim();
          if (job.descriptionHtml && !text) return { text: htmlToText_(job.descriptionHtml), locationRaw: job.location || "", workMode: job.workplaceType || "" };
          const locationRaw = (job.location || "").trim();
          let workMode = (job.workplaceType || "").trim();
          if (job.isRemote && workMode !== "Remote") workMode = workMode ? workMode + ", remote" : "remote";
          return { text: text || "", locationRaw, workMode };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /** Run from Apps Script: paste one failing Ashby URL inside the quotes below, then run this function (Run > runDebugAshby), then View > Executions or View > Logs. */
  function runDebugAshby() {
    debugAshbyMatch("https://jobs.ashbyhq.com/PASTE_ONE_FAILING_URL_HERE");
  }

  /** Run once in Apps Script: paste one Ashby FetchError URL as the argument, then check Logs. Shows API jobUrl values so we can see why matching might fail. */
  function debugAshbyMatch(sheetUrl) {
    if (!sheetUrl || !String(sheetUrl).includes("jobs.ashbyhq.com")) { Logger.log("Not an Ashby URL"); return; }
    const pathMatch = sheetUrl.match(/https:\/\/jobs\.ashbyhq\.com\/([^\/]+)/i);
    const boardName = pathMatch && pathMatch[1] ? pathMatch[1] : null;
    if (!boardName) { Logger.log("No board name"); return; }
    const apiUrl = "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(boardName);
    const resp = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true, headers: { "Accept": "application/json" } });
    Logger.log("API status: " + resp.getResponseCode());
    if (resp.getResponseCode() !== 200) { Logger.log(resp.getContentText().slice(0, 500)); return; }
    const data = JSON.parse(resp.getContentText());
    const jobs = (data && data.jobs) ? data.jobs : [];
    Logger.log("Board: " + boardName + ", jobs count: " + jobs.length);
    Logger.log("Sheet URL (norm): " + (String(sheetUrl).split("#")[0] || "").replace(/\/$/, "").toLowerCase());
    for (let i = 0; i < Math.min(jobs.length, 15); i++) {
      const j = jobs[i];
      const u = (j.jobUrl || "").replace(/\/$/, "").toLowerCase();
      Logger.log("  jobUrl[" + i + "]: " + u + " | descriptionPlain length: " + (j.descriptionPlain || "").length);
    }
  }

  /** very lightweight html -> text */
  function htmlToText_(html) {
    if (!html) return "";
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  /** Superseded by gate3A_braveSearchToRoles_lever() below (uses braveSearchToRoles_generic_). Kept for reference. */
  function gate3A_braveSearchToRoles_lever_standalone() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rolesSheet = ss.getSheetByName("Roles") || ss.insertSheet("Roles");
    const logsSheet = ensureSheet_(ss, "Logs");

    ensureHeaders_(rolesSheet, [
      "canonical_url",
      "company",
      "job_title",
      "source",
      "discovered_date",
      "status",
      "query"
    ]);
  
    const token = PropertiesService.getScriptProperties().getProperty("BRAVE_SUBSCRIPTION_TOKEN");
    if (!token) throw new Error("Missing BRAVE_SUBSCRIPTION_TOKEN in Script Properties.");
  
    // Start simple: one query. Later we will read many queries from a Queries tab.
    const query = 'site:jobs.lever.co (strategy OR operations OR bizops OR "business operations" OR "strategic finance") -democorp';
  
    // IMPORTANT: Web Search endpoint supports count 1-20 and offset max 9.
    const count = 20;
    const maxOffset = 9;
  
    // Use freshness to avoid “all-time” results. Use "pd" for daily runs, "pw" for every-few-days.
    const freshness = "pd";
    const country = "us";
    const searchLang = "en";
  
    const existing = new Set(getColumnValues_(rolesSheet, 1)); // canonical_url
  
    // Canonical Lever posting URL pattern: /<company>/<uuid>
    const leverPostingRe = /^https:\/\/jobs\.lever\.co\/([^\/]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
    const bannedCompanySlugs = new Set(["lever", "democorp"]);
  
    let totalResults = 0;
    let candidates = 0;
    let written = 0;
    let pagesFetched = 0;
  
    for (let offset = 0; offset <= maxOffset; offset++) {
      const url =
      "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) +
      "&count=" + count +
      "&offset=" + offset;
  
      const resp = UrlFetchApp.fetch(url, {
        method: "get",
        muteHttpExceptions: true,
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": token
        }
      });
  
      const code = resp.getResponseCode();
      const bodyText = resp.getContentText();
  
      if (code !== 200) {
        logsSheet.appendRow([new Date(), "Gate 3A", `Brave HTTP ${code} at offset=${offset}. Body=${bodyText.slice(0, 300)}`]);
        throw new Error(`Brave API error HTTP ${code}`);
      }
  
      const data = JSON.parse(bodyText);
      const results = (data.web && data.web.results) ? data.web.results : [];
  
      pagesFetched += 1;
      totalResults += results.length;
  
      // Stop early if this page has no results
      if (!results.length) break;
  
      for (const r of results) {
        if (!r || !r.url) continue;
  
        const canon = canonicalizeUrl_(r.url);
        if (!canon) continue;
  
        const m = canon.match(leverPostingRe);
        if (!m) continue;
  
        const companySlug = (m[1] || "").toLowerCase();
        if (bannedCompanySlugs.has(companySlug)) continue;
  
        candidates += 1;
        if (existing.has(canon)) continue;
  
        const parsed = parseTitleCompany_((r.title || "").trim());
  
        rolesSheet.appendRow([
          canon,
          parsed.company || companySlug,
          parsed.job_title || (r.title || ""),
          "brave_search",
          new Date(),
          "New",
          query
        ]);
  
        existing.add(canon);
        written += 1;
      }
    }
  
    logsSheet.appendRow([
      new Date(),
      "Gate 3A",
      `Query ran. freshness=${freshness}. pagesFetched=${pagesFetched}. Brave results=${totalResults}, candidates=${candidates}, wrote=${written}.`
    ]);
  }
  
  /** Helper: get all values from a column (excluding header) */
  function getColumnValues_(sheet, colIndex) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, colIndex, lastRow, colIndex).getValues().flat().filter(Boolean);
  }
  
  /** Helper: parse titles like "Company - Role Title" */
  function parseTitleCompany_(title) {
    if (!title) return { company: "", job_title: "" };
    const parts = title.split(" - ").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { company: parts[0], job_title: parts.slice(1).join(" - ") };
    }
    return { company: "", job_title: title };
  }
  
  function gate3B_enrichNewRoles_fetchJD() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ss.getSheetByName("Roles");
    const logs = ensureSheet_(ss, "Logs");
    if (!roles) throw new Error("Roles sheet not found.");
  
    const headers = roles.getRange(1,1,1,roles.getLastColumn()).getValues()[0].map(h => (h||"").toString().trim());
    const headerMap = {};
    headers.forEach((h,i)=>{ if(h) headerMap[h]=i+1; });
  
    // Ensure columns exist (append missing to the right). fetched_at = last attempt (any outcome); enriched_at = when we successfully enriched.
    const needed = ["jd_text","location_raw","work_mode_hint","fetched_at","enriched_at","http_status","failure_reason"];
    let col = roles.getLastColumn();
    needed.forEach(h=>{
      if(!headerMap[h]) {
        col += 1;
        roles.getRange(1,col).setValue(h);
        headerMap[h]=col;
      }
    });
  
    const baseCols = {
      url: headerMap["canonical_url"],
      status: headerMap["status"],
      source: headerMap["source"]
    };
    if (!baseCols.url || !baseCols.status || !baseCols.source) {
      throw new Error("Missing canonical_url/source/status headers.");
    }
  
    const lastRow = roles.getLastRow();
    if (lastRow < 2) {
      logs.appendRow([new Date(),"Gate 3B","No role rows to enrich."]);
      return;
    }
  
    const data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();

    let scanned = 0, enriched = 0, failed = 0;
  
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const url = row[baseCols.url-1];
      const status = row[baseCols.status-1];
      const source = row[baseCols.source-1];
      const jdTextExisting = row[headerMap["jd_text"]-1];
  
      // Enrich any New row (brave_search, ats_feed, or blank source for legacy)
      if (!url || status !== "New") continue;
      const src = (source != null && source !== "") ? String(source).trim() : "";
      if (src && src !== "brave_search" && src !== "ats_feed") continue; // skip other sources (e.g. google_alert, test_email)
      // Only skip if we already have a real JD (length > 500). Short junk (e.g. "lever", "ashby", "greenhouse") stays eligible.
      const jdLen = (jdTextExisting != null && jdTextExisting !== "") ? String(jdTextExisting).trim().length : 0;
      if (jdLen > 500) continue;
  
      scanned += 1;
  
      let httpStatus = "";
      let text = "";
      let locationRaw = "";
      let workMode = "";
      let failureReason = "";
      const isAshby = String(url).indexOf("jobs.ashbyhq.com") !== -1;

      try {
        if (isAshby) {
          const ashby = fetchAshbyJobDescription_(url);
          if (ashby && (ashby.text || "").length >= 100) {
            text = ashby.text;
            locationRaw = ashby.locationRaw || extractLocationHint_(text.slice(0, 600));
            workMode = ashby.workMode || extractWorkModeHint_(text);
            httpStatus = 200;
          } else {
            failureReason = "TEXT_TOO_SHORT";
            httpStatus = 200;
          }
        }
        if (!text && !failureReason) {
          const resp = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true,
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          httpStatus = resp.getResponseCode();
          const html = resp.getContentText();
          text = htmlToText_(html);

          // Detect common failure pages
          const lower = (text || "").toLowerCase();
          const looks404 =
          lower.includes("404 error") ||
          lower.includes("not found") ||
          lower.includes("couldn't find anything here") ||
          lower.includes("the job posting you're looking for might have closed");

          const tooShort = (text || "").length < 800;

          if (httpStatus !== 200) {
            failureReason = `HTTP_${httpStatus}`;
          } else if (looks404) {
            failureReason = "LEVER_404_PAGE";
          } else if (tooShort) {
            failureReason = "TEXT_TOO_SHORT";
          } else if (lower.includes("democorp") || lower.includes("jobs at democorp")) {
            failureReason = "DEMO_BOARD";
          }

          if (!failureReason) {
            const top = text.slice(0, 600);
            locationRaw = extractLocationHint_(top);
            workMode = extractWorkModeHint_(text);
          }
        }

      } catch (e) {
        httpStatus = "ERR";
        failureReason = "EXCEPTION";
      }

      const sheetRow = r + 2;
      roles.getRange(sheetRow, headerMap["http_status"]).setValue(httpStatus);
      roles.getRange(sheetRow, headerMap["fetched_at"]).setValue(new Date());
  
      if (!failureReason) {
        roles.getRange(sheetRow, headerMap["jd_text"]).setValue(text);
        roles.getRange(sheetRow, headerMap["location_raw"]).setValue(locationRaw);
        roles.getRange(sheetRow, headerMap["work_mode_hint"]).setValue(workMode);
        roles.getRange(sheetRow, baseCols.status).setValue("Enriched");
        roles.getRange(sheetRow, headerMap["failure_reason"]).setValue("");
        if (headerMap["enriched_at"]) roles.getRange(sheetRow, headerMap["enriched_at"]).setValue(new Date());
        enriched += 1;
      } else {
        // Don’t write junk JD text; mark failure so we can retry / ignore
        roles.getRange(sheetRow, headerMap["jd_text"]).setValue("");
        roles.getRange(sheetRow, headerMap["location_raw"]).setValue("");
        roles.getRange(sheetRow, headerMap["work_mode_hint"]).setValue("");
        roles.getRange(sheetRow, headerMap["failure_reason"]).setValue(failureReason);
        if (failureReason === "HTTP_404" || failureReason === "LEVER_404_PAGE") {
          roles.getRange(sheetRow, baseCols.status).setValue("Dead");
        } else {
          roles.getRange(sheetRow, baseCols.status).setValue("FetchError");
        }
  
        failed += 1;
      }
  
      // Safety cap: stay under Apps Script 6-min limit (~2s per fetch → ~50 is safe)
      if ((enriched + failed) >= 50) break;
    }
  
    logs.appendRow([new Date(),"Gate 3B",`Scanned=${scanned}, enriched=${enriched}, failed=${failed}.`]);
  }
  
  function extractWorkModeHint_(text) {
    const t = (text || "").toLowerCase();
    const hits = [];
    if (t.includes("remote")) hits.push("remote");
    if (t.includes("hybrid")) hits.push("hybrid");
    if (t.includes("in-office") || t.includes("in office") || t.includes("onsite") || t.includes("on-site")) hits.push("in_person");
    // Dedup
    return Array.from(new Set(hits)).join(", ");
  }
  
  function extractLocationHint_(topText) {
    const s = (topText || "").replace(/\s+/g, " ").trim();
    // Very light pattern: look for "Remote" or common US city/state patterns
    if (/remote/i.test(s)) return "Remote (mentioned)";
    const m = s.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
    return m ? m[0] : "";
  }
  
  function gate3B_resetBadEnrichedToNew() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ss.getSheetByName("Roles");
    const logs = ensureSheet_(ss, "Logs");
    if (!roles) throw new Error("Roles sheet not found.");
  
    const headers = roles.getRange(1,1,1,roles.getLastColumn()).getValues()[0].map(h => (h||"").toString().trim());
    const col = {};
    headers.forEach((h,i)=>{ if(h) col[h]=i+1; });
  
    const required = ["canonical_url","source","status","jd_text","http_status","failure_reason","fetched_at","location_raw","work_mode_hint"];
    required.forEach(h => { if (!col[h]) throw new Error(`Missing column: ${h}`); });
  
    const lastRow = roles.getLastRow();
    if (lastRow < 2) return;
  
    const data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();

    let reset = 0;
  
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const status = row[col["status"]-1];
      const source = row[col["source"]-1];
      const jd = (row[col["jd_text"]-1] || "").toString();
      const http = (row[col["http_status"]-1] || "").toString();
  
      if (source !== "brave_search") continue;
  
      // Reset if marked Enriched but content is clearly bad
      const lower = jd.toLowerCase();
      const isBad =
        !jd.trim() ||
        lower.includes("404 error") ||
        lower.includes("not found") ||
        lower.includes("couldn't find anything here") ||
        lower.includes("democorp") ||
        http === "404" ||
        http === "ERR";
  
      if (status === "Enriched" && isBad) {
        const sheetRow = r + 2;
  
        // Clear enrichment fields
        roles.getRange(sheetRow, col["jd_text"]).setValue("");
        roles.getRange(sheetRow, col["location_raw"]).setValue("");
        roles.getRange(sheetRow, col["work_mode_hint"]).setValue("");
        roles.getRange(sheetRow, col["http_status"]).setValue("");
        roles.getRange(sheetRow, col["failure_reason"]).setValue("");
        roles.getRange(sheetRow, col["fetched_at"]).setValue("");
  
        // Reset status so Gate 3B will retry
        roles.getRange(sheetRow, col["status"]).setValue("New");
        reset += 1;
      }
    }
  
    logs.appendRow([new Date(), "Gate 3B Reset", `Reset ${reset} rows from Enriched->New due to bad content.`]);
  }

  /** Reset FetchError TEXT_TOO_SHORT rows to New so Gate 3B will retry them (e.g. after Ashby URL matching or other fixes). */
  function gate3B_resetTextTooShortToNew() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ss.getSheetByName("Roles");
    const logs = ensureSheet_(ss, "Logs");
    if (!roles) throw new Error("Roles sheet not found.");
    const headers = roles.getRange(1, 1, 1, roles.getLastColumn()).getValues()[0].map(h => (h || "").toString().trim());
    const col = {};
    headers.forEach((h, i) => { if (h) col[h] = i + 1; });
    ["canonical_url", "status", "failure_reason", "jd_text", "location_raw", "work_mode_hint", "http_status", "fetched_at"].forEach(h => { if (!col[h]) throw new Error("Missing column: " + h); });
    const lastRow = roles.getLastRow();
    if (lastRow < 2) return;
    const data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();
    let reset = 0;
    for (let r = 0; r < data.length; r++) {
      const status = (data[r][col["status"] - 1] || "").toString().trim();
      const failureReason = (data[r][col["failure_reason"] - 1] || "").toString().trim();
      if (status !== "FetchError" || failureReason !== "TEXT_TOO_SHORT") continue;
      const sheetRow = r + 2;
      roles.getRange(sheetRow, col["jd_text"]).setValue("");
      roles.getRange(sheetRow, col["location_raw"]).setValue("");
      roles.getRange(sheetRow, col["work_mode_hint"]).setValue("");
      roles.getRange(sheetRow, col["http_status"]).setValue("");
      roles.getRange(sheetRow, col["failure_reason"]).setValue("");
      roles.getRange(sheetRow, col["fetched_at"]).setValue("");
      roles.getRange(sheetRow, col["status"]).setValue("New");
      reset += 1;
    }
    logs.appendRow([new Date(), "Gate 3B Reset TEXT_TOO_SHORT", `Reset ${reset} rows (FetchError TEXT_TOO_SHORT -> New) for retry.`]);
  }

  /** Normalize legacy rows: set status to Dead where failure_reason is HTTP_404 or LEVER_404_PAGE (so we don't retry dead links). */
  function gate3B_normalize404ToDead() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ss.getSheetByName("Roles");
    const logs = ensureSheet_(ss, "Logs");
    if (!roles) throw new Error("Roles sheet not found.");
    const headers = roles.getRange(1, 1, 1, roles.getLastColumn()).getValues()[0].map(h => (h || "").toString().trim());
    const col = {};
    headers.forEach((h, i) => { if (h) col[h] = i + 1; });
    if (!col["status"] || !col["failure_reason"]) throw new Error("Missing status or failure_reason column.");
    const lastRow = roles.getLastRow();
    if (lastRow < 2) return;
    const data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();
    let updated = 0;
    for (let r = 0; r < data.length; r++) {
      const status = (data[r][col["status"] - 1] || "").toString().trim();
      const failureReason = (data[r][col["failure_reason"] - 1] || "").toString().trim();
      if (status === "Dead") continue;
      if (failureReason !== "HTTP_404" && failureReason !== "LEVER_404_PAGE") continue;
      const sheetRow = r + 2;
      roles.getRange(sheetRow, col["status"]).setValue("Dead");
      updated += 1;
    }
    logs.appendRow([new Date(), "Gate 3B Normalize 404", `Set status=Dead for ${updated} rows with failure_reason HTTP_404/LEVER_404_PAGE.`]);
  }

  function gate4_score_enriched_roles_v0() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ss.getSheetByName("Roles");
    const logs = ss.getSheetByName("Logs") || ss.insertSheet("Logs");
    if (!roles) throw new Error("Roles sheet not found.");
  
    // Map headers -> column index
    const headers = roles.getRange(1, 1, 1, roles.getLastColumn()).getValues()[0].map(h => (h || "").toString().trim());
    const col = {};
    headers.forEach((h, i) => { if (h) col[h] = i + 1; });
  
    // Required input columns
    const required = ["canonical_url", "company", "job_title", "status", "jd_text", "location_raw", "work_mode_hint"];
    required.forEach(h => { if (!col[h]) throw new Error(`Missing column: ${h}`); });
  
    // Ensure output columns exist
    const outputs = ["fit_score", "fit_notes", "dealbreaker_flag", "location_us_ok", "comp_ok", "work_mode_final", "rank_key"];
    let lastCol = roles.getLastColumn();
    outputs.forEach(h => {
      if (!col[h]) {
        lastCol += 1;
        roles.getRange(1, lastCol).setValue(h);
        col[h] = lastCol;
      }
    });
  
    const lastRow = roles.getLastRow();
    if (lastRow < 2) return;
  
    const data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();
    const hasFailureReason = !!col["failure_reason"];

    let scored = 0;
    let scoredFetchError = 0;

    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var status = (row[col["status"] - 1] || "").toString().trim();
      var failureReason = hasFailureReason ? (row[col["failure_reason"] - 1] || "").toString().trim() : "";

      // Score Enriched rows; also score FetchError + TEXT_TOO_SHORT so valid links get a score for review
      var eligible = (status === "Enriched") || (status === "FetchError" && failureReason === "TEXT_TOO_SHORT");
      if (!eligible) continue;

      var title = (row[col["job_title"] - 1] || "").toString();
      var company = (row[col["company"] - 1] || "").toString();
      var jd = (row[col["jd_text"] - 1] || "").toString();
      var locRaw = (row[col["location_raw"] - 1] || "").toString();
      var workHint = (row[col["work_mode_hint"] - 1] || "").toString();

      var scoreObj = scoreRoleV0_({ title: title, company: company, jd: jd, locRaw: locRaw, workHint: workHint });

      var sheetRow = r + 2;
      roles.getRange(sheetRow, col["fit_score"]).setValue(scoreObj.fit_score);
      roles.getRange(sheetRow, col["fit_notes"]).setValue(scoreObj.fit_notes);
      roles.getRange(sheetRow, col["dealbreaker_flag"]).setValue(scoreObj.dealbreaker_flag ? "TRUE" : "FALSE");
      roles.getRange(sheetRow, col["location_us_ok"]).setValue(scoreObj.location_us_ok);
      roles.getRange(sheetRow, col["comp_ok"]).setValue(scoreObj.comp_ok);
      roles.getRange(sheetRow, col["work_mode_final"]).setValue(scoreObj.work_mode_final);

      var rankKey = String(scoreObj.fit_score).padStart(3, "0") + "-" + company.toLowerCase() + "-" + title.toLowerCase();
      roles.getRange(sheetRow, col["rank_key"]).setValue(rankKey);

      scored += 1;
      if (status === "FetchError") scoredFetchError += 1;
    }

    logs.appendRow([new Date(), "Gate 4", "Scored " + scored + " roles (v0 heuristic)" + (scoredFetchError > 0 ? ", " + scoredFetchError + " were FetchError+TEXT_TOO_SHORT" : "") + "."]);
  }
  
  /**
   * Very first-pass deterministic scoring.
   * Goal: quickly surface likely fits, flag obvious non-US / in-office / low-scope issues.
   * We will tune weights once you see outputs.
   */
  function scoreRoleV0_({ title, company, jd, locRaw, workHint }) {
    const t = (title || "").toLowerCase();
    const text = ((jd || "") + " " + (locRaw || "")).toLowerCase();
  
    let score = 50; // baseline
    const notes = [];
  
    // Seniority adjustment (title-based)
    if (/\b(associate|analyst|coordinator|specialist)\b/.test(t)) {
      score -= 22;
      notes.push("-22 Junior seniority (associate/analyst/etc.)");
    } else if (/\b(manager)\b/.test(t) && !/\b(senior manager|sr\.?\s*manager)\b/.test(t)) {
      score -= 8;
      notes.push("-8 Manager (non-senior) title");
    }
  
    if (/\b(senior manager|sr\.?\s*manager)\b/.test(t)) {
      score += 10;
      notes.push("+10 Senior Manager title");
    }
    if (/\b(lead|principal)\b/.test(t)) {
      score += 8;
      notes.push("+8 Lead/Principal title");
    }
    if (/\b(head of|director|vp|vice president)\b/.test(t)) {
      score += 14;
      notes.push("+14 Head/Director/VP title");
    }
  
    // Positive title signals
    const posTitle = [
      { re: /biz\s?ops|business operations|business ops/, pts: 18, note: "BizOps/Business Ops title" },
      { re: /strategy operations|strategic operations|strategy & operations|strategy and operations/, pts: 18, note: "Strategy Ops title" },
      { re: /\bhead of\b.*(strategy|business operations|bizops|operations)/, pts: 16, note: "Head of Strategy/BizOps/Operations" },
      { re: /chief of staff/, pts: 12, note: "Chief of Staff" },
      { re: /\bgeneral manager\b|\bgm\b/, pts: 10, note: "GM" },
      { re: /strategic finance|corp(orate)? strategy|corporate development|biz dev|business development/, pts: 8, note: "Adjacent strategic function" },
    ];
    posTitle.forEach(x => { if (x.re.test(t)) { score += x.pts; notes.push("+" + x.pts + " " + x.note); } });
  
    // Negative title signals (not your target)
    const negTitle = [
      { re: /\baccountant\b|accounting|controller|tax|audit/, pts: -25, note: "Accounting/Controller" },
      { re: /payroll|ap\b|ar\b|billing specialist/, pts: -20, note: "Back-office ops" },
      { re: /\bhr\b|talent|recruit(ing|er)/, pts: -15, note: "HR/Talent" },
      { re: /sales development|sdr|bdr/, pts: -15, note: "SDR/BDR" },
    ];
    negTitle.forEach(x => { if (x.re.test(t)) { score += x.pts; notes.push(x.pts + " " + x.note); } });
  
    // Location gate: default US OK; only flag when role explicitly requires non-US location (e.g. "Location: London")
    let location_us_ok = "TRUE";
  
      // Locale / language penalty (quick heuristic)
      // If title contains lots of non-ASCII characters, it’s likely not a US role.
      const nonAscii = (title || "").match(/[^\x00-\x7F]/g);
      if (nonAscii && nonAscii.length >= 3) {
        score -= 35;
        notes.push("-35 Non-English / non-ASCII title");
        // If it’s non-English, treat US-location as suspicious unless explicitly stated
        location_us_ok = "FALSE";
      }
  
    // Only flag non-US when JD explicitly states role is based in / located in non-US (e.g. "Location: London")
    const nonUsLocationRequired = /(location\s*[:\-]\s*(london|uk|england|europe|berlin|paris|dublin|india|singapore|australia|toronto|vancouver)|based\s+in\s+(our\s+)?(london|berlin|paris|dublin|toronto|sydney)\s|must\s+be\s+(based|located)\s+in\s+(the\s+)?(uk|eu|europe)|headquarters?\s+in\s+(london|berlin|paris)|role\s+is\s+in\s+(london|berlin|paris))/i;
    if (nonUsLocationRequired.test(text)) {
      location_us_ok = "FALSE";
      score -= 40;
      notes.push("-40 Non-US location required");
    }
  
    // Work mode
    let work_mode_final = "UNKNOWN";
    const work = (workHint || "").toLowerCase() + " " + text;
    if (/remote-first|fully remote|100% remote|\bremote\b/.test(work)) {
      work_mode_final = "REMOTE";
      score += 6;
      notes.push("+6 Remote");
    }
    if (/hybrid/.test(work)) {
      work_mode_final = work_mode_final === "REMOTE" ? "REMOTE_OR_HYBRID" : "HYBRID";
      score += 2;
      notes.push("+2 Hybrid");
    }
    if (/on[- ]site|onsite|in[- ]office|in office|must be in office|five days a week|5 days a week/.test(work)) {
      work_mode_final = "IN_PERSON";
      score -= 6;
      notes.push("-6 In-person requirement");
    }
  
    // Compensation: very light heuristic (we may not have comp yet)
    // If JD contains explicit salary numbers, attempt to infer floor.
    let comp_ok = "UNKNOWN";
    const moneyMatches = (jd || "").match(/\$?\b(1[5-9]\d|2\d\d)\b\s?(k|K)\b/g); // e.g. 180k
    if (moneyMatches && moneyMatches.length) {
      // take max "###k" found
      let maxK = 0;
      moneyMatches.forEach(m => {
        const n = parseInt(m.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(n) && n > maxK) maxK = n;
      });
      if (maxK > 0) {
        if (maxK >= 180) comp_ok = "TRUE";
        else comp_ok = "FALSE";
        notes.push(`Comp max≈${maxK}k => ${comp_ok}`);
        if (comp_ok === "FALSE") score -= 15;
      }
    }
  
    // Dealbreaker flag (v0): non-US explicit
    const dealbreaker_flag = (location_us_ok === "FALSE");
  
    // Clamp score
    score = Math.max(0, Math.min(100, score));
  
    const fit_notes = notes.slice(0, 6).join(" | "); // keep short
  
    return { fit_score: score, fit_notes, dealbreaker_flag, location_us_ok, comp_ok, work_mode_final };
  }
  
  function ensureRolesSchema_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roles = ensureSheet_(ss, "Roles");
  
    const desired = [
      "canonical_url",
      "company",
      "job_title",
      "source",
      "discovered_date",
      "status",
      "query",
      "ats"
    ];
  
    // Read current headers
    const lastCol = Math.max(roles.getLastColumn(), desired.length);
    const current = roles.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(h => (h || "").toString().trim());
  
    // Build header map
    const map = {};
    current.forEach((h, i) => { if (h) map[h] = i + 1; });
  
    // Append missing headers
    let col = roles.getLastColumn();
    desired.forEach(h => {
      if (!map[h]) {
        col += 1;
        roles.getRange(1, col).setValue(h);
        map[h] = col;
      }
    });
  
    roles.setFrozenRows(1);
    return { sheet: roles, headerMap: map };
  }
  
  /**
   * Brave Web Search API constraints: count must be 1-20, offset must be 0-9 (page index, not result index).
   * So max 10 pages × 20 = 200 results per query per run.
   */
  function braveSearchToRoles_generic_(params) {
    const {
      ats,                 // "lever" | "ashby" | "greenhouse"
      query,               // full search query string
      count = 20,          // Brave per-page count (max 20)
      pages = 10,          // number of pages to fetch (max 10; offset 0..9)
      freshness,           // optional: "pd" (24h), "pw" (7 days), "pm" (31 days), "py" (year)
      bannedHosts = [],    // extra exclusions
      urlFilterFn          // function(url) => { ok, companySlug?, canonical? }
    } = params;

    const safeCount = Math.min(20, Math.max(1, count));
    const safePages = Math.min(10, Math.max(0, pages));
    const offsetMax = safePages - 1; // offset is page index 0..9

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logs = ensureSheet_(ss, "Logs");

    const { sheet: roles, headerMap } = ensureRolesSchema_();

    const token = PropertiesService.getScriptProperties().getProperty("BRAVE_SUBSCRIPTION_TOKEN");
    if (!token) throw new Error("Missing BRAVE_SUBSCRIPTION_TOKEN in Script Properties.");

    const existing = new Set(getColumnValues_(roles, 1)); // canonical_url
    const numCols = roles.getLastColumn();

    let totalResults = 0;
    let candidates = 0;
    let written = 0;
    let pagesFetched = 0;

    for (let page = 0; page <= offsetMax; page++) {
      const offset = page; // Brave offset is page index (0-9), not result start index

      var url =
        "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) +
        "&count=" + safeCount +
        "&offset=" + offset +
        "&country=us&search_lang=en";
      if (freshness === "pd" || freshness === "pw" || freshness === "pm" || freshness === "py") {
        url += "&freshness=" + freshness;
      }
  
      const resp = UrlFetchApp.fetch(url, {
        method: "get",
        muteHttpExceptions: true,
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": token
        }
      });
  
      const code = resp.getResponseCode();
      const bodyText = resp.getContentText();
  
      if (code !== 200) {
        logs.appendRow([new Date(), `Gate 3A (${ats})`, `Brave HTTP ${code}. Body=${bodyText.slice(0, 300)}`]);
        throw new Error(`Brave API error HTTP ${code}`);
      }
  
      const data = JSON.parse(bodyText);
      const results = (data.web && data.web.results) ? data.web.results : [];
      pagesFetched += 1;
      totalResults += results.length;
  
      if (!results.length) break;
  
      for (const r of results) {
        if (!r || !r.url) continue;
  
        // Basic host bans
        const u = String(r.url);
        if (bannedHosts.some(h => u.includes(h))) continue;
  
        // Canonicalize
        const canon = canonicalizeUrl_(u);
        if (!canon) continue;
  
        // Site-specific acceptance + parsing
        const res = urlFilterFn(canon);
        if (!res || !res.ok) continue;
  
        candidates += 1;
        if (existing.has(res.canonical)) continue;
  
        const parsed = parseTitleCompany_((r.title || "").trim());

        // Build row so each value goes in the correct column (sheet may have jd_text, etc. before ats)
        const row = [];
        for (let c = 0; c < numCols; c++) row.push("");
        if (headerMap["canonical_url"]) row[headerMap["canonical_url"] - 1] = res.canonical;
        if (headerMap["company"]) row[headerMap["company"] - 1] = parsed.company || res.companySlug || "";
        if (headerMap["job_title"]) row[headerMap["job_title"] - 1] = parsed.job_title || (r.title || "");
        if (headerMap["source"]) row[headerMap["source"] - 1] = "brave_search";
        if (headerMap["discovered_date"]) row[headerMap["discovered_date"] - 1] = new Date();
        if (headerMap["status"]) row[headerMap["status"] - 1] = "New";
        if (headerMap["query"]) row[headerMap["query"] - 1] = query;
        if (headerMap["ats"]) row[headerMap["ats"] - 1] = ats;
        roles.appendRow(row);

        existing.add(res.canonical);
        written += 1;
      }
    }
  
    var logMsg = "Query ran. pagesFetched=" + pagesFetched + ". Brave results=" + totalResults + ", candidates=" + candidates + ", wrote=" + written;
    if (freshness) logMsg += " freshness=" + freshness;
    logs.appendRow([new Date(), "Gate 3A (" + ats + ")", logMsg + "."]);
  }

  function urlFilter_lever_(canonUrl) {
    const leverPostingRe =
      /^https:\/\/jobs\.lever\.co\/([^\/]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
  
    const m = canonUrl.match(leverPostingRe);
    if (!m) return { ok: false };
  
    const slug = (m[1] || "").toLowerCase();
    const banned = new Set(["lever", "democorp"]);
    if (banned.has(slug)) return { ok: false };
  
    // normalize trailing slash
    const normalized = canonUrl.replace(/\/$/, "");
    return { ok: true, companySlug: slug, canonical: normalized };
  }
  
  function urlFilter_ashby_(canonUrl) {
    if (!canonUrl.startsWith("https://jobs.ashbyhq.com/")) return { ok: false };
  
    const path = canonUrl.replace("https://jobs.ashbyhq.com/", "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return { ok: false }; // need at least company + job slug/id
  
    const slug = (parts[0] || "").toLowerCase();
    const banned = new Set(["ashby", "demo", "democorp"]);
    if (banned.has(slug)) return { ok: false };
  
    const normalized = canonUrl.replace(/\/$/, "");
    return { ok: true, companySlug: slug, canonical: normalized };
  }
  
  function urlFilter_greenhouse_(canonUrl) {
    if (!canonUrl.startsWith("https://boards.greenhouse.io/")) return { ok: false };
  
    const path = canonUrl.replace("https://boards.greenhouse.io/", "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 3) return { ok: false };
  
    const company = (parts[0] || "").toLowerCase();
    const segment = (parts[1] || "").toLowerCase();
    const id = parts[2];
  
    if (!(segment === "jobs" || segment === "job")) return { ok: false };
    if (!/^\d+$/.test(id)) return { ok: false };
  
    const banned = new Set(["democorp", "example"]);
    if (banned.has(company)) return { ok: false };
  
    const normalized = canonUrl.replace(/\/$/, "");
    return { ok: true, companySlug: company, canonical: normalized };
  }
  
  function gate3A_braveSearchToRoles_lever() {
    braveSearchToRoles_generic_({
      ats: "lever",
      query: LEVER_QUERIES_[0],
      count: 20,
      pages: 7, // you’ve already seen this produce real volume
      urlFilterFn: urlFilter_lever_
    });
  }
  
  function gate3A_braveSearchToRoles_ashby() {
    braveSearchToRoles_generic_({
      ats: "ashby",
      query: ASHBY_QUERIES_[0],
      count: 20,
      pages: 5,
      urlFilterFn: urlFilter_ashby_
    });
  }
  
  function gate3A_braveSearchToRoles_greenhouse() {
    braveSearchToRoles_generic_({
      ats: "greenhouse",
      query: GREENHOUSE_QUERIES_[0],
      count: 20,
      pages: 5,
      urlFilterFn: urlFilter_greenhouse_
    });
  }
  
  // Query sets: first = main (daily); rest = variants (catch-up).
  const LEVER_QUERIES_ = [
    'site:jobs.lever.co ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp',
    'site:jobs.lever.co ("Strategic Finance" OR "Chief of Staff" OR "GM" OR "General Manager" OR "Head of Business Operations") -democorp',
    'site:jobs.lever.co ("BizOps" OR "Business Operations" OR "Operations Manager" OR "Head of Operations") -democorp'
  ];
  const ASHBY_QUERIES_ = [
    'site:jobs.ashbyhq.com ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp',
    'site:jobs.ashbyhq.com ("Strategic Finance" OR "Chief of Staff" OR "BizOps" OR "Head of Operations") -democorp'
  ];
  const GREENHOUSE_QUERIES_ = [
    'site:boards.greenhouse.io (job OR jobs) ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp',
    'site:boards.greenhouse.io (job OR jobs) ("Strategic Finance" OR "Chief of Staff" OR "BizOps" OR "Head of Operations") -democorp'
  ];

  /** One-time catch-up: 10 pages + all query variants per site. May exceed Apps Script 6-min limit; use catch-up-per-source below if it times out. */
  function gate3A_runAllSources_catchUp() {
    var pages = 10, q;
    for (q = 0; q < LEVER_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "lever", query: LEVER_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_lever_ });
    }
    for (q = 0; q < ASHBY_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "ashby", query: ASHBY_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_ashby_ });
    }
    for (q = 0; q < GREENHOUSE_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "greenhouse", query: GREENHOUSE_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_greenhouse_ });
    }
  }

  /** Catch-up Lever only — BRAVE discovery (~3 queries × 10 pages). Run separately to stay under 6-min limit. (For ATS API discovery, use gate3A_discoverFromAtsFeedsLeverOnly instead.) */
  function gate3A_runAllSources_catchUpLeverOnly() {
    var pages = 10, q;
    for (q = 0; q < LEVER_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "lever", query: LEVER_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_lever_ });
    }
  }

  /** Catch-up Ashby only — BRAVE discovery (~2 queries × 10 pages). Run separately to stay under 6-min limit. (For ATS API discovery, use gate3A_discoverFromAtsFeedsAshbyOnly instead.) */
  function gate3A_runAllSources_catchUpAshbyOnly() {
    var pages = 10, q;
    for (q = 0; q < ASHBY_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "ashby", query: ASHBY_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_ashby_ });
    }
  }

  /** Catch-up Greenhouse only — BRAVE discovery (~2 queries × 10 pages). Run separately to stay under 6-min limit. (For ATS API discovery, use gate3A_discoverFromAtsFeedsGreenhouseOnly instead.) */
  function gate3A_runAllSources_catchUpGreenhouseOnly() {
    var pages = 10, q;
    for (q = 0; q < GREENHOUSE_QUERIES_.length; q++) {
      braveSearchToRoles_generic_({ ats: "greenhouse", query: GREENHOUSE_QUERIES_[q], count: 20, pages: pages, urlFilterFn: urlFilter_greenhouse_ });
    }
  }

  /** Recurring daily: 1 query per site, 6 pages, past 7 days only. Use after catch-up to pick up new postings with lower Brave cost. */
  function gate3A_runAllSources_daily() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logs = ensureSheet_(ss, "Logs");
    logs.appendRow([new Date(), "Gate 3A (daily)", "Daily run started (freshness=pw, 6 pages per source)."]);
    var pages = 6;
    var freshness = "pw"; // past 7 days
    try {
      braveSearchToRoles_generic_({ ats: "lever", query: LEVER_QUERIES_[0], count: 20, pages: pages, freshness: freshness, urlFilterFn: urlFilter_lever_ });
      braveSearchToRoles_generic_({ ats: "ashby", query: ASHBY_QUERIES_[0], count: 20, pages: pages, freshness: freshness, urlFilterFn: urlFilter_ashby_ });
      braveSearchToRoles_generic_({ ats: "greenhouse", query: GREENHOUSE_QUERIES_[0], count: 20, pages: pages, freshness: freshness, urlFilterFn: urlFilter_greenhouse_ });
      logs.appendRow([new Date(), "Gate 3A (daily)", "Daily run completed."]);
    } catch (e) {
      logs.appendRow([new Date(), "Gate 3A (daily)", "Error: " + (e.message || String(e))]);
      throw e;
    }
  }

  // --- Better Path #2: discover from ATS APIs using company list derived from existing Roles (no Brave, no new company list). ---
  const ATS_FEED_KEYWORDS_ = /strategy|operations|bizops|business operations|strategic finance|chief of staff|\bgm\b|general manager|head of operations|head of business/i;

  /** Returns true if job title (and optional description snippet) matches our target role keywords. */
  function atsFeedTitleMatches_(title, descriptionSnippet) {
    var t = (title || "").toString();
    var d = (descriptionSnippet || "").toString();
    var combined = t + " " + d;
    return ATS_FEED_KEYWORDS_.test(combined);
  }

  /** Collect unique (ats, companySlug) from existing Roles by parsing canonical_url. */
  function atsFeedGetCompaniesFromSheet_(roles, headerMap) {
    var lastRow = roles.getLastRow();
    if (lastRow < 2) return [];
    var urlCol = headerMap["canonical_url"];
    var atsCol = headerMap["ats"];
    if (!urlCol || !atsCol) return [];
    var data = roles.getRange(2, 1, lastRow, roles.getLastColumn()).getValues();
    var seen = {};
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var url = (data[i][urlCol - 1] || "").toString().trim();
      var ats = (data[i][atsCol - 1] || "").toString().toLowerCase().trim();
      if (!url || !ats) continue;
      var company = null;
      if (ats === "lever") {
        var m = url.match(/^https:\/\/jobs\.lever\.co\/([^\/]+)\//i);
        if (m) company = (m[1] || "").toLowerCase();
      } else if (ats === "ashby") {
        var p = url.replace("https://jobs.ashbyhq.com/", "").split("/").filter(Boolean);
        if (p.length >= 1) company = (p[0] || "").toLowerCase();
      } else if (ats === "greenhouse") {
        var g = url.replace("https://boards.greenhouse.io/", "").split("/").filter(Boolean);
        if (g.length >= 1) company = (g[0] || "").toLowerCase();
      }
      if (!company) continue;
      var key = ats + "\t" + company;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ ats: ats, company: company });
    }
    return out;
  }

  /** Fetch all job postings from Lever for a site (paginated). Returns array of { url, title, company }. */
  function atsFeedFetchLeverJobs_(site) {
    var base = "https://api.lever.co/v0/postings/" + encodeURIComponent(site) + "?mode=json&limit=100";
    var all = [];
    var skip = 0;
    while (true) {
      var resp = UrlFetchApp.fetch(base + "&skip=" + skip, { muteHttpExceptions: true, headers: { "Accept": "application/json" } });
      if (resp.getResponseCode() !== 200) break;
      var list = [];
      try { list = JSON.parse(resp.getContentText()); } catch (e) { break; }
      if (!Array.isArray(list) || list.length === 0) break;
      for (var i = 0; i < list.length; i++) {
        var j = list[i];
        var url = (j.hostedUrl || "").toString().replace(/\/$/, "");
        var title = (j.text || "").toString().trim();
        if (url && url.indexOf("jobs.lever.co/") !== -1) all.push({ url: url, title: title, company: site });
      }
      if (list.length < 100) break;
      skip += 100;
    }
    return all;
  }

  /** Fetch all jobs from Ashby job board. Returns array of { url, title, company }. */
  function atsFeedFetchAshbyJobs_(boardName) {
    var url = "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(boardName);
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { "Accept": "application/json" } });
    if (resp.getResponseCode() !== 200) return [];
    var data = {};
    try { data = JSON.parse(resp.getContentText()); } catch (e) { return []; }
    var jobs = data.jobs || [];
    var out = [];
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var jobUrl = (j.jobUrl || "").toString().replace(/\/$/, "");
      var title = (j.title || "").toString().trim();
      if (jobUrl && jobUrl.indexOf("jobs.ashbyhq.com/") !== -1) out.push({ url: jobUrl, title: title, company: boardName });
    }
    return out;
  }

  /** Fetch all jobs from Greenhouse board. Returns array of { url, title, company }. */
  function atsFeedFetchGreenhouseJobs_(boardToken) {
    var url = "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { "Accept": "application/json" } });
    if (resp.getResponseCode() !== 200) return [];
    var data = {};
    try { data = JSON.parse(resp.getContentText()); } catch (e) { return []; }
    var jobs = data.jobs || [];
    var out = [];
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var abs = (j.absolute_url || j.url || "").toString().replace(/\/$/, "");
      var title = (j.title || "").toString().trim();
      if (abs && abs.indexOf("boards.greenhouse.io/") !== -1) out.push({ url: abs, title: title, company: boardToken });
    }
    return out;
  }

  /**
   * Better Path #2: discover jobs from ATS APIs using companies already in the Roles sheet.
   * No Brave usage. Adds new rows with source=ats_feed.
   * @param {string} atsFilter - Optional. If "lever"|"ashby"|"greenhouse", only that ATS is run.
   * @param {number} maxCompanies - Optional. Max companies to process this run (default 18). Use to stay under 6-min execution limit.
   * @param {number} offset - Optional. Skip first N companies (default 0). Use for next batch: e.g. (20, 0) then (20, 20) then (20, 40).
   */
  function gate3A_discoverFromAtsFeeds(atsFilter, maxCompanies, offset) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logs = ensureSheet_(ss, "Logs");
    var rolesAndMap = ensureRolesSchema_();
    var roles = rolesAndMap.sheet;
    var headerMap = rolesAndMap.headerMap;
    var existing = new Set(getColumnValues_(roles, 1));
    var numCols = roles.getLastColumn();
    var written = 0;
    var companies = atsFeedGetCompaniesFromSheet_(roles, headerMap);
    if (atsFilter === "lever" || atsFilter === "ashby" || atsFilter === "greenhouse") {
      companies = companies.filter(function(c) { return c.ats === atsFilter; });
    }
    var off = (offset == null || isNaN(offset)) ? 0 : Math.max(0, parseInt(offset, 10));
    var max = (maxCompanies == null || isNaN(maxCompanies)) ? 18 : Math.max(1, parseInt(maxCompanies, 10));
    companies = companies.slice(off, off + max);
    var logLabel = "Gate 3A (ats_feed" + (atsFilter ? " " + atsFilter + " only" : "") + ")";
    logs.appendRow([new Date(), logLabel, "Companies this run: " + companies.length + " (offset " + off + ", max " + max + ")."]);

    var bannedLever = new Set(["lever", "democorp"]);
    var bannedAshby = new Set(["ashby", "demo", "democorp"]);
    var bannedGreenhouse = new Set(["democorp", "example"]);

    var totalFetched = 0, totalMatched = 0, totalAlreadyInSheet = 0;

    for (var c = 0; c < companies.length; c++) {
      var ats = companies[c].ats;
      var company = companies[c].company;
      if (ats === "lever" && bannedLever.has(company)) continue;
      if (ats === "ashby" && bannedAshby.has(company)) continue;
      if (ats === "greenhouse" && bannedGreenhouse.has(company)) continue;

      var jobs = [];
      if (ats === "lever") jobs = atsFeedFetchLeverJobs_(company);
      else if (ats === "ashby") jobs = atsFeedFetchAshbyJobs_(company);
      else if (ats === "greenhouse") jobs = atsFeedFetchGreenhouseJobs_(company);

      totalFetched += jobs.length;

      for (var j = 0; j < jobs.length; j++) {
        var job = jobs[j];
        if (!atsFeedTitleMatches_(job.title, "")) continue;
        totalMatched++;
        var canon = job.url;
        if (existing.has(canon)) {
          totalAlreadyInSheet++;
          continue;
        }
        existing.add(canon);
        var row = [];
        for (var col = 0; col < numCols; col++) row.push("");
        if (headerMap["canonical_url"]) row[headerMap["canonical_url"] - 1] = canon;
        if (headerMap["company"]) row[headerMap["company"] - 1] = job.company;
        if (headerMap["job_title"]) row[headerMap["job_title"] - 1] = job.title;
        if (headerMap["source"]) row[headerMap["source"] - 1] = "ats_feed";
        if (headerMap["discovered_date"]) row[headerMap["discovered_date"] - 1] = new Date();
        if (headerMap["status"]) row[headerMap["status"] - 1] = "New";
        if (headerMap["ats"]) row[headerMap["ats"] - 1] = ats;
        roles.appendRow(row);
        written++;
      }
      Utilities.sleep(200);
    }
    logs.appendRow([new Date(), logLabel, "Fetched " + totalFetched + " jobs, " + totalMatched + " matched keywords, " + totalAlreadyInSheet + " already in sheet, wrote " + written + " new."]);
  }

  /** ATS feed: Lever only, max 18 companies per run to stay under 6-min limit. For next batch run gate3A_discoverFromAtsFeeds("lever", 18, 18) then ("lever", 18, 36), etc. */
  function gate3A_discoverFromAtsFeedsLeverOnly() {
    gate3A_discoverFromAtsFeeds("lever", 18, 0);
  }

  /** ATS feed: Ashby only, max 18 companies per run. For next batch use gate3A_discoverFromAtsFeeds("ashby", 18, 18), etc. */
  function gate3A_discoverFromAtsFeedsAshbyOnly() {
    gate3A_discoverFromAtsFeeds("ashby", 18, 0);
  }

  /** ATS feed: Greenhouse only, max 18 companies per run. For next batch use gate3A_discoverFromAtsFeeds("greenhouse", 18, 18), etc. */
  function gate3A_discoverFromAtsFeedsGreenhouseOnly() {
    gate3A_discoverFromAtsFeeds("greenhouse", 18, 0);
  }