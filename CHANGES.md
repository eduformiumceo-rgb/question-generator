# Round 2: hardening and maintainability

**Real bug found by the new tests**
- **Double-charge on a double-tap.** "Premium AI" (generate) and "Write new question" (replace) disabled themselves only after
  React re-rendered, so two taps in the same moment started two paid runs (proved: 2 requests before, 1 now). Both now take a
  synchronous lock that the `finally` always releases. The payment "Buy" button got the same lock (it created duplicate pending
  transactions). Tests: `tests/generateGuard.test.jsx`.

**Security**
- A password-reset token is signed with the same secret as a login token and was accepted as one. All four functions now refuse any
  token that carries a `purpose`.
- Account enumeration closed: sign-in returns one message ("Incorrect email or password.") for an unknown email and a wrong password
  (an unknown email also pays for a password hash, so the timing matches), and "send reset code" answers identically whether or not
  the account exists (no email is sent for an unknown one). Google-only accounts still get the actionable "use Continue with Google".

**Maintainability**
- `npm run lint` (ESLint 9: undefined names, hook rules, dead code, lost error causes). The codebase is at 0 errors / 0 warnings.
  Removed ~35 dead imports, variables and helpers; every rethrown error now keeps its `cause`; the invisible characters in
  `schemeMatch.js` are written as `\u` escapes.
- `npm run check` = lint + tests + build.
- Server copies of 6 shared files (`functions/_shared`): `scripts/sync-shared.mjs`. `npm run sync:shared` copies the originals from
  `src/`; `npm run build` now FAILS if a copy has drifted, so server and browser can never disagree silently.
- `QuestionsGenerator.jsx`: the credit-balance / free-usage fetching moved to `hooks/useAccountMeters.js`, the tab/hash/CSS helpers
  to `generatorTabs.js` (moved verbatim).
- Service worker: the cache is capped at 250 files (oldest dropped, app shell never), the offline fallback can no longer
  resolve to nothing, and its behaviour is covered by tests that run it in a simulated worker.
- `vite.config.js` size comment corrected (the entry bundle is ~870 KB, not ~570 KB).

**Round 3: stuck payments (optional database migration)**
- `supabase/004_exam_credit_purchase.sql` adds ONE new function, `exam_credit_purchase(p_ref, p_user_id)`, that claims a purchase AND
  credits it (by calling your shared `increment_coins`) in a single transaction, so a crash can no longer leave a payment half-done.
  It changes nothing that exists, so your other apps are unaffected; roll back with `drop function public.exam_credit_purchase(text, uuid)`.
- `exam-payment` uses it when it is installed and falls back to the old three-step flow when it is not, so deploying the code
  before (or without) the migration is safe. If the function errors, the app never falls back (no chance of crediting twice).
- Verified on a real PostgreSQL 16: credit once, second call returns NULL, a failing wallet call rolls the claim back, a wrong
  user / unknown ref / already-"processing" row is left alone, and two simultaneous calls credit exactly once.
  (Tested with stand-ins for `transactions` / `coins` / `increment_coins` using your real function signatures; run it on a copy or
  at a quiet moment first, since I could not see your real tables.)
- The file also holds two read-only checks: (A) whether browsers can call your shared coin functions directly, and (B) purchases
  already stuck in "processing" from the old flow.

**Still open**
- The free-tier / sign-in rate counters read-then-write, so truly simultaneous requests can slightly exceed a limit (needs an atomic
  counter in the database).
- `npm run e2e` (real browser) must be run on a machine with Chromium before a release; it cannot run in every environment.

---

# Full-app audit (bug-fix round)

Method: production build, the whole test suite, a linter pass over every source file (undefined names, hook rules, dead code),
every one of the 77 curriculum loaders executed, and a line-by-line read of all four server functions.

**Security / money**
- `POST /api/auth/coins/deduct`: the `amount` was never validated. A NEGATIVE amount passed the "enough coins?" check and
  ADDED coins (a balance of 10 became 1,010 with one request); a non-number wrote a broken balance. Now: only a positive number up
  to 100 is accepted, and the deduction is the atomic `decrement_coins` RPC (no read-then-write race). The client does not call
  this endpoint today, so nothing in the app changes.
- `generate-exam`: a section with 0, negative, fractional or non-numeric questions, zero/negative/huge marks, a `null` entry, or
  more than 12 sections used to get through and cost 3 AI calls per section before failing. Now refused with a 400 before any
  credit is reserved or any AI call is made.

**Logic**
- `exam-account /free-usage` did not filter `curriculum=GES`, unlike the server's real free-tier limit. Free question
  replacements (logged as `tier=free`) were counted as used quizzes, so the "free quizzes left" figure was wrong.
- `exam-account`: `meta_json` had no size limit (only `exam_json` did). Capped at 100 KB.
- `exam-payment`: any database/Paystack hiccup escaped as a bare 500 without CORS headers (browser showed a network error);
  now a normal JSON error. If Paystack refuses to start a payment, the pending row is closed instead of lingering under "Restore
  previous purchase". If credits were added but the last "mark completed" write failed, the buyer is no longer told it failed.
- `examApi.streamExamAPI`: a final stream line without a trailing newline (proxies can drop it) was ignored, so a finished paper
  could be reported as "connection interrupted". Also clears its stall timer on the no-streaming error path.
- `public/sw.js`: error pages (404/500) were cached; the offline shell was only the copy saved at install time and went stale
  (pointing at deleted script files) after every deploy. Good navigations now refresh it; offline fallback never resolves to nothing.

**Project structure**
- `functions/` contained a full, OLDER copy of the whole project (`functions/src`, `functions/tests`, `functions/functions/api/...`,
  its own `package.json`, ...). Cloudflare Pages publishes everything under `functions/` as routes, so the old
  `functions/functions/api/*` handlers would have been live at `/functions/api/...`. Removed; `functions/` now holds only the live
  `api/` and `_shared/`. The 17 test files that lived in the stale copy each have a same-named live counterpart in `tests/`.

**Tests**: `tests/auditFixes.test.js` (25 tests) fails on the old code and passes now. Suite: 939 + build green.

**Left for a later round** (needs a database change, see "Still open" at the top): none of round 1's notes remain; round 2 fixed them.

---
# Changes in this round

**Answer booklet and shading sheets**
- Subject and class are never printed. The booklet cover has empty SUBJECT / CLASS write-in lines; both shading sheets have an empty CLASS box beside SUBJECT, and the class is gone from the sheet heading.
- Pages: presets from 4, a Custom field (2 to 40), A3 rounds up to a multiple of 4. Suggested page count from your structured / essay questions.
- Page numbers: Show / Hide toggle.
- Graph paper ruling (5 mm squares), a 40-question examiner's table, fold marks with a white halo so they show over the masthead.
- WASSCE sheet rows spread to fill the page on short papers.

**Scan reader (`src/omrReader.js`)**
- Reads sheets turned a quarter turn either way, as well as upside down.
- Hatched, scribbled and light pencil: marks are judged against the blanks of the same row, on the sides of each bubble (away from the printed letter).
- Page curl and tilt: each row / index column is snapped onto its printed outline; a per-digit printing bias is removed.
- Mark thresholds are relative; faint marks are read but flagged for review.

**Scan screen**
- Marks for each question (default 1, half marks allowed).
- Index numbers are editable, with undo; duplicates, scores and the CSV follow the corrected number.

**Code**
- `QuestionsGenerator.jsx` split: `BookletPanel`, `ShadingPanel`, `FormControls`, `examApi.js`.

**Tests**
- `tests/omr.robust.test.js`, `tests/sheetCounts.test.js`, extended booklet / sheet / scan-marker tests.
- Real-browser end-to-end: `npm run e2e` (needs `pip install playwright pillow numpy` and `playwright install chromium`).

---
# UI clean-up round

- One type scale for the whole app (12 / 13 / 15 / 17 / 20 px). The 19 near-identical sizes were collapsed; hierarchy now comes from size, weight and colour.
- Labels are sentence case (no more shouting uppercase). Page titles 700, not 800.
- Long help text is small and folds behind an (i) button or a "Details" link on phones (`CardTitle`, `Hint`).
- Difficulty, marking scheme and diagrams are fold-away cards with a one-line summary (`FoldCard`); open by default on desktop, closed on phones.
- Exam Structure Builder rebuilt so the Questions / Marks fields line up.
- School fields: tidy logo row; colours are swatches with the chosen name shown.
- Booklet and Shading pages: shorter hero text and card descriptions, full-width main buttons on phones.
- Fields are 16px on phones (stops iOS zooming in), buttons and nav use the app font.
- Edit tokens in `src/theme.css` ("CLEAN UI LAYER") and `src/sharedStyles.jsx`.

---
# Finish round (mobile first, no speed cost)

- Phone header subtitle 8px -> 11px; bottom-nav labels 10px -> 11px.
- 44px touch targets on touch screens / phones (CSS only; mouse users keep compact sizes). Tiny controls (info button, switches, answer dot, swatches, desktop tabs) grow their tap area, not their looks.
- Bottom nav now covers up to 760px, so the 4-tab pill is never clipped on landscape phones / small tablets.
- Paper action bar on phones: Paper/Answers, More, Print / PDF always visible; Word, Share, Shading sheet, Answer booklet and Save changes open from the More sheet (dot on More when there are unsaved changes). Desktop is unchanged.
- Desktop >= 1180px: the paper and its review sit beside the form (two columns).
- One teal family: tokens `--teal-bright`, `--teal-bright-hover`; components use `--accent` / `--btn` instead of hard-coded hex (also fixes low contrast of those spots in dark mode).
- Generate panel gets the hero's teal glow (static gradient). Header lines up with the wide page column. `viewport-fit=cover` added. Soft haptic tap when a paper finishes.
- Rules kept: opacity/transform animations only, no shadows or filters, nothing loops. `tests/finishLayer.test.js` pins the new rules; all 1182 tests pass; CSS grew about 3 KB (7 KB gzip total), JS unchanged in size class.
