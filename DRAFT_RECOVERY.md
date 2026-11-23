# Draft recovery (refresh / crash / sign-in redirect)

A teacher who refreshes, loses signal, gets bounced through the Google or Hub sign-in, or has the phone kill the tab
no longer loses their work. Everything below happens in the browser only; nothing is sent to a server.

## What is remembered

| What | Where | Restored |
|---|---|---|
| Paper setup: class, term, exam type, duration, subject, programme, topics, ticked strands, pasted syllabus, difficulty, language style, cognitive levels, sections, diagrams, marking scheme, exam style | `localStorage` `eduq.draft.v1` | instantly, before first paint (no empty-form flash) |
| The generated paper on screen, with edits not yet saved to My Exams, version A/B/C, orientation, My Exams link | `IndexedDB` `eduq-drafts` (falls back to `localStorage` `eduq.paper.v1` under 1.5 MB) | a moment after load, with a notice |
| "A generation was running" marker (tier, sections written of total) | `localStorage` `eduq.job.v1` | as an explanatory notice |

School name, motto, logo and paper layout were already remembered separately (`eduq.paperPrefs.v1`) and are unchanged.

## Rules

* **Private to the account.** A draft belongs to the signed-in account. Another account on the same computer never sees it.
  A draft made *before* signing in is adopted by whoever signs in next (that is the redirect case).
* **Sign out wipes everything** and leaves a blank page (`clearAllDrafts` + `resetWizard`).
* **Expires** 7 days after the last change; the interrupted-run notice after 30 minutes. Versioned (`DRAFT_VERSION`): bump it when the draft shape changes and old drafts are dropped.
* **Never trusted.** `sanitizeWizard` type-checks, length-caps and allow-lists every field; a corrupt or hand-edited draft cannot crash the page.
* **Never throws.** Blocked storage, private windows and a full disk make saving silently do nothing.
* **Crash-loop guard.** If restoring a paper crashes the page twice in a row, the stored paper is discarded.
* **Saved on page-hide as well as on a timer** (mobile browsers often never fire `beforeunload`).
* **Leave warning** only when it matters: a generation is running, or an unsaved paper could not be backed up.
* **The "welcome back" note fades after 12 s**; notices that need a decision (continue / save) stay until dealt with.

## Generation interrupted mid-run: Continue, don't redo

Every section is kept in the browser as it finishes (`eduq.job.v1`, with a fingerprint of the exact settings used).
If the page is refreshed, or the run stops part-way (AI error, lost signal), the notice offers
**"Continue (N sections left)"**: the browser sends `skipSectionIds` with the ids it already holds, the server writes
and charges **only the missing sections**, and the paper is put back together in order (title, instructions and
answer key included). Continue is offered only when the settings are unchanged (fingerprint match); otherwise the
notice says so and offers "Generate again".

Server (`functions/api/generate-exam.js`):
* `skipSectionIds`: unknown ids are ignored; skipping everything is refused (400, nothing reserved). Question numbering
  is settled on the FULL section list first, so a continued Section B still starts at its proper number.
  Cost = sections actually written. Progress events count against the whole paper.
* **Disconnect refund.** Credits are reserved when a run starts. They are now handed back (exactly once, via
  `refundOnce`) on a caught failure OR the moment the browser disconnects (`cancel()` on the stream), and the run stops
  spending AI calls. Previously a refund relied on a later write failing, which a serverless runtime may never reach.
  A delivered paper is never refunded.

Limit: sections are kept in this browser (localStorage, up to ~400 KB). A different device cannot continue.

## Where the code is

* `src/draftStore.js`: storage, sanitising, ownership, expiry, crash-loop guard
* `src/hooks/useAutosave.js`: debounce + flush on page-hide
* `src/components/RecoveryBanner.jsx`: the notices
* `src/QuestionsGenerator.jsx`: "Draft recovery" block, plus draft-initialised state
* `src/components/TopicSelector.jsx`: its reset effects now fire only on a real change, and it can restore ticked strands
* `functions/api/generate-exam.js`: `skipSectionIds`, `refundOnce`, stream `cancel()`
* Tests: `tests/draftStore.test.js`, `tests/draftRestore.test.jsx`, `tests/generateExam.resume.test.js` (dev dependency: `fake-indexeddb`)

## How it was verified

* Unit + integration + server tests (the continue flow runs against a fake streaming server; mutation-checked: removing
  `skipSectionIds`, the keep-on-failure logic, the BECE restore guard or the server `cancel()` each makes a test fail).
* A real Chromium run (mobile viewport) of: reload mid-wizard, a run cut after Section A, a real reload, Continue
  (request body checked), paper recovery from real IndexedDB, and sign-out wiping everything.
* Not covered: real iOS Safari / Android Chrome devices. Test a refresh and a tab-kill on a phone before release.

## Known limits

* An uploaded Scheme of Learning's file chip is not restored (its text is, in the syllabus box).
* Two tabs editing at once: the last one to change wins.
