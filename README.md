# JobDiscovery

Pipeline to discover, enrich, score, and track job postings (Strategy & Operations, BizOps, Strategic Finance, etc.) from Lever, Ashby, and Greenhouse. Runs in **Google Apps Script**; code is developed in Cursor and pasted into the Apps Script editor.

- **context.md** – System context, goals, and lessons learned.
- **PLAN.md** – Prioritized plan and progress.
- **JobDiscovery.ts** – Main script (copy into Apps Script).

## Cursor vs Apps Script: "Problems" in the editor

If Cursor shows many "problems" (e.g. 73) in `JobDiscovery.ts` but the script runs fine in Google Apps Script, that’s expected. Cursor uses TypeScript/ESLint and a Node-style environment; Apps Script is a different runtime (V8, no TypeScript, different globals like `SpreadsheetApp`). The linter flags things that Apps Script doesn’t care about. The code is valid for Apps Script; you can ignore the Cursor warnings or add type stubs later if you want a cleaner editor experience.
