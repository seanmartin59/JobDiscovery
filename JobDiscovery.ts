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
  
    // Ensure columns exist (append missing to the right)
    const needed = ["jd_text","location_raw","work_mode_hint","fetched_at","http_status","failure_reason"];
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
  
      // Only enrich new Brave rows, and only if jd_text not already set
      if (!url || status !== "New" || source !== "brave_search") continue;
      if (jdTextExisting && jdTextExisting.toString().trim().length > 0) continue;
  
      scanned += 1;
  
      let httpStatus = "";
      let text = "";
      let locationRaw = "";
      let workMode = "";
      let failureReason = "";
  
      try {
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
  
        // Minimum “real JD” threshold (tune later)
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
  
      // Safety cap for now
      if ((enriched + failed) >= 25) break;
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

    let scored = 0;
  
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
  
      const status = (row[col["status"] - 1] || "").toString().trim();
      if (status !== "Enriched") continue;
  
      const title = (row[col["job_title"] - 1] || "").toString();
      const company = (row[col["company"] - 1] || "").toString();
      const jd = (row[col["jd_text"] - 1] || "").toString();
      const locRaw = (row[col["location_raw"] - 1] || "").toString();
      const workHint = (row[col["work_mode_hint"] - 1] || "").toString();
  
      const scoreObj = scoreRoleV0_({ title, company, jd, locRaw, workHint });
  
      const sheetRow = r + 2;
      roles.getRange(sheetRow, col["fit_score"]).setValue(scoreObj.fit_score);
      roles.getRange(sheetRow, col["fit_notes"]).setValue(scoreObj.fit_notes);
      roles.getRange(sheetRow, col["dealbreaker_flag"]).setValue(scoreObj.dealbreaker_flag ? "TRUE" : "FALSE");
      roles.getRange(sheetRow, col["location_us_ok"]).setValue(scoreObj.location_us_ok);
      roles.getRange(sheetRow, col["comp_ok"]).setValue(scoreObj.comp_ok);
      roles.getRange(sheetRow, col["work_mode_final"]).setValue(scoreObj.work_mode_final);
  
      // rank_key lets you sort descending easily: score + tiebreaker
      const rankKey = `${String(scoreObj.fit_score).padStart(3, "0")}-${company.toLowerCase()}-${title.toLowerCase()}`;
      roles.getRange(sheetRow, col["rank_key"]).setValue(rankKey);
  
      scored += 1;
  
      // keep runtime safe in MVP
      if (scored >= 100) break;
    }
  
    logs.appendRow([new Date(), "Gate 4", `Scored ${scored} enriched roles (v0 heuristic).`]);
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
  
    // Location gate: US-only
    // (Heuristic: flag common non-US city/country words. We'll improve later.)
    const nonUsSignals = /(london|united kingdom|uk\b|england|europe|berlin|munich|paris|france|spain|madrid|barcelona|amsterdam|netherlands|canada|toronto|vancouver|india|bangalore|hyderabad|singapore|australia|sydney|melbourne)/i;
    let location_us_ok = "UNKNOWN";
  
      // Locale / language penalty (quick heuristic)
      // If title contains lots of non-ASCII characters, it’s likely not a US role.
      const nonAscii = (title || "").match(/[^\x00-\x7F]/g);
      if (nonAscii && nonAscii.length >= 3) {
        score -= 35;
        notes.push("-35 Non-English / non-ASCII title");
        // If it’s non-English, treat US-location as suspicious unless explicitly stated
        if (location_us_ok === "UNKNOWN") location_us_ok = "FALSE";
      }
  
    if (nonUsSignals.test(text)) {
      location_us_ok = "FALSE";
      score -= 40;
      notes.push("-40 Non-US location signal");
    } else if (/united states|u\.s\.|us\b|remote.*us|within the us|anywhere in the us|usa\b/i.test(text)) {
      location_us_ok = "TRUE";
      notes.push("+0 US location signal");
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
      bannedHosts = [],    // extra exclusions
      urlFilterFn          // function(url) => { ok, companySlug?, canonical? }
    } = params;

    const safeCount = Math.min(20, Math.max(1, count));
    const safePages = Math.min(10, Math.max(0, pages));
    const offsetMax = safePages - 1; // offset is page index 0..9

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logs = ensureSheet_(ss, "Logs");

    const { sheet: roles } = ensureRolesSchema_();

    const token = PropertiesService.getScriptProperties().getProperty("BRAVE_SUBSCRIPTION_TOKEN");
    if (!token) throw new Error("Missing BRAVE_SUBSCRIPTION_TOKEN in Script Properties.");

    const existing = new Set(getColumnValues_(roles, 1)); // canonical_url

    let totalResults = 0;
    let candidates = 0;
    let written = 0;
    let pagesFetched = 0;

    for (let page = 0; page <= offsetMax; page++) {
      const offset = page; // Brave offset is page index (0-9), not result start index

      const url =
        "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) +
        "&count=" + safeCount +
        "&offset=" + offset +
        "&country=us&search_lang=en";
  
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
  
        roles.appendRow([
          res.canonical,
          parsed.company || res.companySlug || "",
          parsed.job_title || (r.title || ""),
          "brave_search",
          new Date(),
          "New",
          query,
          ats
        ]);
  
        existing.add(res.canonical);
        written += 1;
      }
    }
  
    logs.appendRow([new Date(), `Gate 3A (${ats})`, `Query ran. pagesFetched=${pagesFetched}. Brave results=${totalResults}, candidates=${candidates}, wrote=${written}.`]);
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
    const query =
      'site:jobs.lever.co ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp';
  
    braveSearchToRoles_generic_({
      ats: "lever",
      query,
      count: 50,
      pages: 7, // you’ve already seen this produce real volume
      urlFilterFn: urlFilter_lever_
    });
  }
  
  function gate3A_braveSearchToRoles_ashby() {
    const query =
      'site:jobs.ashbyhq.com ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp';
  
    braveSearchToRoles_generic_({
      ats: "ashby",
      query,
      count: 20,
      pages: 5,
      urlFilterFn: urlFilter_ashby_
    });
  }
  
  function gate3A_braveSearchToRoles_greenhouse() {
    const query =
      'site:boards.greenhouse.io (job OR jobs) ("Strategy Operations" OR "BizOps" OR "Business Operations" OR "Strategic Finance" OR "Strategy" OR "Operations") -democorp';
  
    braveSearchToRoles_generic_({
      ats: "greenhouse",
      query,
      count: 20,
      pages: 5,
      urlFilterFn: urlFilter_greenhouse_
    });
  }
  
  function gate3A_runAllSources_daily() {
    gate3A_braveSearchToRoles_lever();
    gate3A_braveSearchToRoles_ashby();
    gate3A_braveSearchToRoles_greenhouse();
  }