# EDUFORMIUM — AI Questions Generator
A **separate app**: its own repo, its own Cloudflare Pages project, its own
domain (e.g. `questions.eduformium.com`) — wired to the Lesson Planner's
**same Supabase project** for real single sign-on, and now sharing the
**same `coins` wallet** too. A teacher signs in once and sees the exact
same balance in both apps immediately — no separate top-up, no starting
from zero here just because they've used the Lesson Planner before.

## 0. Corrections from earlier versions of this package
**Shared wallet (latest change):** earlier versions of this app used a
separate `exam_credits` table — a deliberate choice at the time, per an
earlier explicit decision in this project's history. That decision was
reversed: since both apps already share one login, they now share one
wallet too. `generate-exam.js` and `exam-payment/[[path]].js` were rewritten
to read and write the REAL `coins` table via the REAL `decrement_coins`/
`increment_coins` RPCs — ported from `generate-premium.js`'s own
`deductCoins()`/`refundCoins()`, including its exact error handling (the
`"insufficient_coins"` text match) and its exact read-then-write fallback
if the RPC is ever missing, not reimplemented from scratch. The separate
`exam_credits`/`exam_transactions` tables and `increment_exam_credits` RPC
from the old migrations are now unused — `supabase/001_exam_tables.sql`
and `002_exam_extras.sql` have been rewritten accordingly (§2).

One display detail that mattered a lot here: your real `App.jsx` never
shows a raw `coins` value to a teacher — it multiplies by
`DISPLAY_CREDIT_MULTIPLIER = 30` first, per an explicit code comment in
`generate-premium.js`: *"Never show coins raw to the user — always pass
through toDisplayCredits() first, same pattern as the timetable app."*
This app now does the same, everywhere a balance or a cost appears —
including package sizes in the top-up modal and the post-purchase
confirmation message, not just the header balance — otherwise the same
raw number would show as two different figures depending on which app a
teacher happened to be looking at.

**AI provider (earlier correction, still true):** earlier versions of
`generate-exam.js` called the **Anthropic API**. That was wrong — this
codebase's actual AI provider is Google Gemini: `gemini-3.6-flash` for the
paid/premium tier (the direct precedent for this feature), `gemini-2.5-flash`
+ rotating free keys + Groq fallback for the free tier. Fixed to match
`generate-premium.js` exactly — endpoint, request shape, response parsing,
env var. **Still not verified end-to-end** — no Gemini key, no network
access to `generativelanguage.googleapis.com` from this sandbox. Verified
by close comparison against your working code, not by executing it.

## 0.5. A launch-blocking bug found in the uploaded "fixed" package
`sharedStyles.jsx`'s own header comment claimed to copy "the F constant,
the S object, and THEME_CSS" from your real `App.jsx`. Only F and S were
ever actually written — `theme.css` (the file defining every
`var(--card-bg)`, `var(--text)`, `var(--border)`, etc. used throughout
every component) never existed until it was added in this pass. Without
it, every card in this app would have rendered with no background, no
border, and default browser text — a real, launch-blocking bug, not a
cosmetic one, and exactly the kind of thing that's invisible in a code
review and only shows up the first time someone opens the app in an
actual browser. An earlier attempt to patch this reverse-engineered
plausible values from colors already hardcoded elsewhere in the app; this
pass replaced that guess with the **actual** `THEME_CSS` constant, copied
byte-for-byte from your real `App.jsx` (found at `const THEME_CSS =`),
including both the light and dark variable sets and the input/button/
select interaction styles. One deliberate exception: the real `App.jsx`
also never loads "DM Sans" as an actual web font anywhere (no
`@font-face`, no Google Fonts `<link>` for it) — it silently falls back to
`system-ui`. `theme.css` intentionally matches that fallback rather than
"improving" it with a font import, since that would make this app render
in a visibly different font than the real Lesson Planner does in practice.
Confirmed working: a real `npm run build` produced valid CSS output
containing these variables (§9 has the full build verification).

## Architecture in one sentence
Same Supabase project + same `JWT_SECRET` = a token minted on
`planner.eduformium.com` verifies successfully on
`questions.eduformium.com`, with zero cookies, zero cross-domain glue, and
zero new Google OAuth client — auth is a bearer token in
`Authorization: Bearer …`, not a cookie, so it doesn't care which subdomain
served the request. The same token also authorizes reads/writes against
the same `coins` wallet, which is what makes the shared balance work.

## File map
```
src/
  examTemplate.js                 Prompt builders + print-safe HTML renderer + SVG safety check + exam variant shuffle
  examDocx.js                     Word (.docx) export — lazy-loaded, see §6
  QuestionsGenerator.jsx          Main page: wizard, auth gate, streaming progress, top-up
  moderation.js                   Input screening (length caps + abuse filter)
  sharedStyles.jsx                F / S style tokens copied from App.jsx
  theme.css                       The real THEME_CSS from App.jsx — see §0.5 below
  auth.js, AuthModal_upgraded.jsx COPIED VERBATIM from the Lesson Planner
  curriculumIndex.js, jhs/ primary/ shs/ kg/   COPIED VERBATIM — the real curriculum data
  freeTierLimits.js               Free-tier caps — single source of truth, see note below
  components/
    ExamStructureBuilder.jsx      Section A/B/C builder (free-tier aware: locks essay, caps counts)
    ExamEditor.jsx                Inline structured exam editor — see §6
    TopicSelector.jsx             Curriculum + topic picker (multi-strand, SOL auto-detect)
    DiagramManager.jsx            Manual diagram upload (for non-AI-generatable figures)
    TopUpModal.jsx                Paystack credit top-up
    PaymentSuccess.jsx            Post-payment verification screen
functions/
  _shared/moderation.js           Server-side copy of the input screen (see note below)
  _shared/examPrompt.js           Server-side copy of buildSectionPrompt (see note below)
  _shared/freeGeneration.js       Free-tier AI strategy: rotating Gemini free keys + Groq fallback
  _shared/freeTierLimits.js       Server-side copy of freeTierLimits.js (see note below)
  api/auth/[[path]].js            COPIED VERBATIM — this is what makes SSO real
  api/generate-exam.js            Streaming, section-by-section, free+premium tier exam generation
  api/exam-account/[[path]].js    Balance + saved-exam history
  api/exam-payment/[[path]].js    Paystack top-up (mirrors the Lesson Planner's payment security)
supabase/
  001_exam_tables.sql             exam_generations / exam_history (NOT exam_credits — see §0)
  002_exam_extras.sql             now a documented no-op — see §0
  003_free_tier.sql               tier tracking for the free-tier daily limit
tests/
  examTemplate.test.js, examDocx.test.js, moderation.test.js, freeTierLimits.test.js    52 passing Vitest tests — see §9
public/
  EDUFORMIUM_ONLY_E.png           Same logo asset
package.json                      Scoped to `npm test` only — see §7
```

**Why `moderation.js` and `examPrompt.js` are duplicated, not imported,
across the `src/` ↔ `functions/` boundary:** different bundlers resolve
cross-directory relative imports differently, and a silent build failure in
production is worse than two ~30–120 line files staying in sync manually.
If you edit the prompt schema or the input-screening rules, update both
copies (each file's header comment says so).

## 1. Create the new repo + Cloudflare Pages project
New git repo, new Cloudflare Pages project, its own domain. This package
ships source files, not a scaffolded build — your bundler/`vite.config.js`
config wasn't part of the original upload, so that piece is still yours to
set up the same way the Lesson Planner's is.

## 2. Run all three SQL migrations
In the Supabase dashboard for the **same project** the Lesson Planner uses,
run `supabase/001_exam_tables.sql`, then `002_exam_extras.sql`, then
`003_free_tier.sql`, in that order. None of them touch `users` or `coins`.

## 3. Set Cloudflare Pages environment variables
Copy the **exact same values** the Lesson Planner project uses for:
```
PROD_SUPABASE_URL   PROD_SUPABASE_SERVICE_KEY   PROD_JWT_SECRET   (byte-identical — this is what makes SSO work)
DEV_SUPABASE_URL    DEV_SUPABASE_SERVICE_KEY    DEV_JWT_SECRET
```
Also copy these **shared-across-branches** values, byte-identical, since the
reused `auth.js`/`AuthModal_upgraded.jsx` support email/password + OTP
signup (not just Google), and the free tier needs the same free-key pool:
```
BREVO_API_KEY   BREVO_FROM
GEMINI_FREE_KEY_1 … GEMINI_FREE_KEY_N   (as many as you've actually set — the loop skips missing ones)
GROQ_API_KEY_1 … GROQ_API_KEY_N
```
Plus one **KV namespace binding** (not a text variable) — Settings →
Functions → KV namespace bindings → variable name `OTP_KV`, bound to the
same KV namespace the Lesson Planner uses (or a new one; it's only used for
OTP rate-limiting, no cross-app data lives in it).

Then set **this app's own**:
```
PROD_ALLOWED_ORIGIN         → https://questions.eduformium.com
DEV_ALLOWED_ORIGIN          → https://dev.questions.eduformium.com
GEMINI_API_KEY               → same paid key generate-premium.js already uses (this app calls
                                gemini-3.6-flash, matching your existing premium tier — not a
                                new/different AI provider). Used for Premium-tier generation only.
PROD_PAYSTACK_SECRET_KEY    → sk_live_... (can be the same Paystack account as the Lesson Planner, or a new one)
DEV_PAYSTACK_SECRET_KEY     → sk_test_...
```

## 4. Render the page + wire the payment callback route
```jsx
import QuestionsGenerator from "./QuestionsGenerator.jsx";
import PaymentSuccess from "./components/PaymentSuccess.jsx";
// route "/payment-success" (matches exam-payment's Paystack callback_url) to <PaymentSuccess/>
// everything else to <QuestionsGenerator/>
```
`QuestionsGenerator.jsx` handles its own auth gate via the reused
`AuthModal_upgraded.jsx`. A teacher signed in on the Lesson Planner will
still click "Sign in with Google" once here (browsers don't share
`localStorage` across domains) — but it's the same Supabase account, so it's
one click and no new signup.

## 5. Curriculum data — GES only, by design
Earlier versions of this app included a Cambridge/IB/Other option with a
generic (non-official) topic scaffold, clearly labeled as such. That scope
has been **removed entirely** — this app is GES-only now. `TopicSelector.jsx`
pulls topics live from your real `curriculumIndex.js` — Subject → Class →
Strand → Sub-Strand, exactly as the Lesson Planner already does — with a
pasted-syllabus field as an optional override/extension for scope the
strand picker doesn't cover. No curriculum data is duplicated or invented
anywhere in this app.

## 6. What changed to push reliability, safety, and UX further
- **Exam activity now shows up in your existing admin panel automatically**
  — `logExamGeneration()` writes to the shared `/generations` table (the
  same one `generate-premium.js` and `generate.js` already write to), using
  the distinct tier values `"exam-premium"`/`"exam-free"` rather than
  reusing `"premium"`/`"free"`. That distinction matters: your Lesson
  Planner's own free-tier daily-limit check filters that table on
  `tier=eq.free` (see `functions/api/generate.js`) — reusing that exact
  value would have silently inflated a teacher's LESSON PLANNER free-tier
  count with unrelated exam activity. This app's OWN free-tier limit still
  uses its own `exam_generations` table (§0.5/§2), which is unaffected.
  No changes were made to the admin panel itself — it was already querying
  `/generations` generically, so this required zero admin-code changes to
  work, only correct logging on this app's side.
- **Inline exam editor + Word (.docx) export** (new, answers "can a teacher
  edit this before printing"): `ExamEditor.jsx` is a structured document
  editor — question text, marks, MCQ options/correct answer, and marking
  guide are all editable, writing straight back into `examData`. Because
  print, PDF, Word export, and Share all read from that same `examData`,
  an edit immediately flows into every export — there's no separate
  "editable copy" to keep in sync. Deliberately NOT a freeform drag/resize
  canvas — real exam-editing tools (Word, Google Docs, every mock-exam
  vendor) are editable *documents*, not design canvases, and building a
  canvas would solve a problem teachers don't have here.
  `examDocx.js` generates a real `.docx` using the `docx` npm library —
  verified by actually generating files in this session (not assumed):
  confirmed valid `Microsoft Word 2007+` format via the `file` command,
  confirmed real question/option/marks text lands correctly by extracting
  and reading the document XML, and confirmed `Packer.toBlob()` (the
  browser API, not just `toBuffer()`) produces a correctly-typed Blob.
  6 tests cover it, all passing.
- **Lazy-loaded, and now actually confirmed, not just claimed**: once real
  scaffolding (`vite.config.js`/`index.html`/`main.jsx`) existed to build
  against, I ran a real `npm run build` (Vite, not a hand-rolled esbuild
  check) and confirmed `examDocx.js` genuinely code-splits into its own
  `357.60 kB` chunk, separate from the main bundle — the lazy-load pattern
  works as intended, verified by output, not assumed.
- **The curriculum-data bundle-size concern, now measured, not estimated**:
  that same real build produced a main bundle of **13.5MB (2.46MB
  gzipped)**. This is dominated by curriculum data (`shs/` alone is 12MB
  raw), not by app code or the `docx` library. 2.46MB gzipped is still a
  meaningful first-load cost on a slow connection — this remains flagged,
  not fixed, for the same reason as before: restructuring how curriculum
  data loads is a real architectural change shared with the Lesson
  Planner and deserves its own scoped conversation, not a change buried
  inside a wallet-sharing update.
- **Two real bugs found and fixed while verifying the above** (by actually
  bundling the app, not just running `node --check`, which doesn't resolve
  imports): `TopUpModal.jsx` and `PaymentSuccess.jsx` both imported
  `./auth.js` when they needed `../auth.js` (wrong relative path — would
  have broken at build time). `@supabase/supabase-js` was used by `auth.js`
  but never declared in `package.json`. Both fixed, and both confirmed
  fixed by the real build succeeding afterward.
- **A pre-existing bug found in your original curriculum data**, not
  something I introduced: `src/jhs/french_curriculum.js` has a duplicate
  `"Basic 9"` key (lines 1476 and 1993) — in a JS object literal, the
  second silently overwrites the first at runtime, meaning one of those
  two blocks' content is currently unreachable. I did not touch this data
  to fix it myself, since I can't tell which of the two blocks is the
  intended/complete one without your input — worth a manual diff and merge
  on your end.
- **Your curriculum data is genuinely large** — `shs/` alone is 12MB,
  `jhs/`+`primary/`+`kg/` add another ~4.5MB, ~16.5MB total. This is a far
  bigger bundle-size concern than the `docx` library ever was, and it's a
  pre-existing property of `curriculumIndex.js`'s eager-import structure
  (shared with the Lesson Planner), not something introduced this session.
  I'm flagging it, not fixing it — restructuring how curriculum data loads
  (e.g. lazy-loading per level) is a real architectural change affecting
  both apps and deserves its own scoped conversation, not a silent change
  bundled into a Word-export feature.
- **Scheme of Learning auto-detect** (new, the flagship differentiator):
  "Load my Scheme of Learning" reads the teacher's own saved SOL — or, as a
  fallback, aggregated weekly lesson plans — directly from the Lesson
  Planner's own `lesson_plans` table (same Supabase project, same user_id,
  **read-only**, this app never writes to that table). If a teacher has
  planned this subject/class/term in the Lesson Planner, this app already
  knows what they taught, without them re-entering it. Honestly caveated in
  the UI: the Lesson Planner caps saved plans at 10 (oldest evicted first,
  shared across ALL plan types for that user), so this can find nothing or
  only a partial picture — the UI always shows which case it hit and lets
  the teacher fix it, never a silent black box.
- **Multi-strand, multi-sub-strand topic selection** (real fix, not a
  workaround): the original picker only let a teacher pick one strand at a
  time, which doesn't match how a Mid-Term/End-of-Term exam actually needs
  to span everything taught across a whole term. Now select as many
  strands as needed, with sub-strands grouped under each.
- **Exam versioning (A/B/C)** — standard anti-cheating practice in real
  invigilated exams. `createExamVariant()` deterministically shuffles
  question order and MCQ option order (remapping the answer key correctly)
  with **zero extra AI calls** — it's a pure transform of the already-
  generated exam, so switching versions is instant and free.
- **School branding** — upload a school logo, printed in the paper header
  alongside the school name.
- **Native share** — a Share button using the Web Share API to send the
  finished exam (as a self-contained `.html` file — see the code comment
  for why not a PDF) directly into WhatsApp, email, or Drive from a phone,
  in one tap. No WhatsApp Business API needed.
- **Free tier** (new): a "Free Quiz / Premium Exam" toggle. Free generates
  through the same rotating-free-key + Groq-fallback strategy your real
  `generate.js` uses (mirrored in `functions/_shared/freeGeneration.js`),
  at zero credit cost. It's deliberately scoped as a smaller quiz product,
  not a stripped-down exam: capped at 2 sections / 15 questions total, no
  essay sections, always Questions Only (no marking scheme) — enforced
  server-side, not just in the UI, and with its own separate daily limit
  (3/user/day) since it's zero-cost and needs its own abuse guard
  independent of the general rate limit. The free-tier limits live in one
  shared `freeTierLimits.js` file (duplicated client/server, like
  `moderation.js`), with a test that diffs the two copies byte-for-byte so
  they can't silently drift apart.
- **Marks-integrity validation** (new, and fixed a consistency bug I caught
  while adding it): both the server (before a section is accepted — can
  still retry) and the client (defense-in-depth) now verify that a
  section's questions actually sum to its declared total marks, and that
  each question's parts sum to that question's own mark value. Catches a
  subtler failure mode than truncation: a model that returns the *right
  number* of questions but gets the arithmetic wrong. I initially added
  this check client-side only, then caught that it would let the server
  charge credits for a paper the client would then reject — moved the same
  check server-side first so a bad section retries instead of billing for
  a paper it's about to refuse.
- **Mobile layout fix**: three fixed two-column grids (Basic Info,
  Curriculum picker, Exam Structure Builder, Output Mode toggle) did not
  stack on a narrow phone screen — a real regression against the "smooth
  on low-end Android" requirement, not a cosmetic nitpick. Fixed with a
  small responsive `.eduq-grid-2` class (inline React styles can't express
  media queries) that stacks to one column under 480px.
- **Error boundary**: an unhandled render error previously meant a blank
  white screen with no way to recover. `QuestionsGenerator` is now wrapped
  in an `ErrorBoundary` that shows a friendly message and a reload button.
- **Basic accessibility**: `role="dialog"`/`aria-modal`/`aria-labelledby`
  on the top-up modal, Escape-to-close, `aria-label` on icon-only buttons,
  `role="switch"`/`aria-checked` on the toggle switches.
- **Questions Only vs. Questions + Marking Scheme toggle** (new): teachers
  choose upfront. "Questions Only" tells the model to skip marking-guide
  prose entirely (`"markingGuide": ""` for every question) — cheaper (3 vs
  5 credits) and faster, for quick worksheets or papers a colleague will
  mark differently. "Questions + Marking Scheme" asks for GES/WAEC-style
  professional marking guidance *by question type*, not one generic
  instruction: objective questions get a one-line rationale for the correct
  answer and why each distractor is wrong; structured questions get a
  point-by-point mark allocation ("[1] correct formula, [1] correct
  substitution, [1] final answer with unit"); essay questions get a banded
  Level 1/2/3 rubric with mark ranges, matching actual WAEC essay-marking
  convention, not a vague paragraph. The answer-key page shows a clear
  "Questions Only — no marking scheme was requested" message rather than an
  empty/broken-looking page when that mode was used.
- **Section-by-section streaming generation** (`generate-exam.js` +
  `buildSectionPrompt`): the AI is asked for one exam section at a time
  (small, ~4000-token calls) instead of one 8000-token call for the whole
  paper. This all but eliminates the truncation risk a single giant call
  has near its token limit, lets a single failed section retry (up to 2
  attempts) without redoing the whole paper, and lets the UI show real
  "Generating Section B (2/3)…" progress instead of one long spinner.
- **AI-generated SVG diagrams** for what's actually safe to generate:
  geometric figures, graphs, number lines, coordinate planes. The model is
  explicitly told to only set `generatable: true` for these; anything
  needing real illustration (a labelled cell diagram, a map) still gets the
  clean text placeholder + manual upload, because that's an honest
  boundary, not a gap to paper over. Every returned SVG is sanitized
  (`isSafeGeneratedSVG` — blocks `<script>`, event handlers, external image
  refs, oversized payloads) before it's ever rendered.
- **Rate limiting** — 3 generations / 2 minutes, 30 / day per user, checked
  off `exam_generations` timestamps (no new table needed) before any credit
  is reserved or AI call made.
- **Input screening** (`moderation.js`) — length caps on school name,
  pasted syllabus, and topic list, plus a narrow high-precision abuse
  filter, run client-side (fast feedback) and server-side (the real
  enforcement) before any credit is spent.
- **Real top-up flow** — `exam-payment/[[path]].js` mirrors every security
  property of your existing `functions/api/payment/[[path]].js`: server-side
  pricing, pre-created transaction row, ownership/IDOR check on verify,
  amount-match validation against Paystack, atomic pending→processing claim
  to prevent double-credit races, atomic RPC increment with a fallback, and
  automatic recovery (reset to "pending") if crediting fails mid-flight.

## 7. Deliberately NOT built this pass, and why
Requested but not built, on purpose, because each is a real product/scope
decision that shouldn't be made silently inside a code-generation session:
- **Digital delivery + auto-grading** (student takes the exam on their
  phone, objective section auto-grades). This is the single largest gap
  versus international competitors like Wayground/Quizizz — but it's a
  genuinely large scope decision (hosting, session security, anti-cheating
  for a digital format, whether you even want to become a delivery
  platform vs. staying a print-exam generator). Worth a dedicated
  conversation, not a bolt-on.
- **Single-question regeneration with a review/edit step, and a vetted
  question bank** — both were scoped and partially reasoned through, but
  cut this pass to keep what shipped actually tested, rather than rushing
  a review UI and a bank-blending change to the marks-validated generation
  pipeline and risking a subtle regression there. Real candidates for next.
- **Item analysis** — needs real captured student scores to analyze, which
  needs digital delivery first. Building this now would be a stub with
  nothing to analyze.
- **Offline/PWA mode** — a legitimate Ghana-specific advantage worth
  pursuing, but service-worker/cache-strategy design deserves its own pass,
  not a rushed addition alongside six other features.

## 8. What's still honestly on you
- **Deploy it and run one real generation end-to-end.** Everything below is
  verified at the unit level (§9) or by matching your proven code
  byte-for-byte (auth) — nothing here has run against live Supabase/Paystack/
  Gemini credentials, because I don't have them.
- **A real GES teacher (or two) should review actual generated exam output**
  for curriculum accuracy, tone, and difficulty calibration. I engineered
  the prompt carefully; I have not validated a single real output against
  GES exam-board conventions with a subject expert.
- The bundler/deploy config (`vite.config.js`/`wrangler.toml` equivalent)
  and the new domain's DNS/Cloudflare custom-domain setup.
- The SOL auto-detect's field-name matching (`strand`/`subStrand` from
  `raw_data.rows`) was verified against your actual SOL-generation code,
  not executed against a real saved SOL — confirm it against a real one
  from your Supabase data before relying on it.
- Cambridge/IB support was deliberately removed (§5) — GES only, by request.
- Pricing was corrected mid-session, based on your real precedent, not left
  as a placeholder: `CREDIT_COST_PER_SECTION_*` in `generate-exam.js` scales
  with section count (= AI call count), priced at the same rate as your
  actual `COINS_PER_LESSON = 0.5` in `generate-premium.js` — one section is
  roughly one lesson plan's worth of AI cost. `CREDIT_PACKAGES` in
  `exam-payment/[[path]].js` uses the **exact same GHS/coin exchange rate**
  as your real `COIN_PACKAGES` in `functions/api/payment/[[path]].js` — a
  teacher moving between the two apps sees the same value per unit, even
  though the wallets are separate. Still worth reviewing before launch —
  this is grounded in your real pricing, not re-derived from live usage
  data, which doesn't exist yet.

## 9. Tests — actually run, not just claimed
`tests/examTemplate.test.js`, `tests/moderation.test.js`, and
`tests/examDocx.test.js`, and `tests/freeTierLimits.test.js` — **52 tests**,
covering the prompt builders (both marking-scheme modes, essay/structured/
objective format branching), the HTML renderer (HTML-injection escaping,
dark-mode-safe print CSS, landscape mode, diagram fallback order, school
logo/version tag rendering, the Questions-Only empty state),
`createExamVariant`'s shuffle correctness/determinism, `validateExamData`'s
truncation/mismatch/marks-arithmetic detection, and `isSafeGeneratedSVG`.
```
npm install
npm test
```
Run during development: **52/52 passing** — including catching one of my
own test assertions being wrong (mismatched error-message text) on the
first run, fixed and re-verified. Every `.js`/`.jsx` file in this package
was also syntax/build-checked (`node --check` for plain JS, `esbuild` for
every JSX file) before delivery.

**This pass, for the first time, also ran a real `npm run build` (Vite)** —
possible now that real scaffolding (`vite.config.js`/`index.html`/
`main.jsx`) exists to build against. It succeeded: 181 modules transformed,
`examDocx.js` confirmed code-split into its own `357.60 kB` chunk (the
lazy-load actually works, not just "should work"), `theme.css` confirmed
present and valid in the CSS output (§0.5's fix confirmed working, not
just written), and the two `./auth.js` → `../auth.js` path bugs confirmed
fixed by the build no longer failing on them. This is real evidence at a
level none of the earlier `node --check`/esbuild-single-file checks could
reach, and it's exactly what caught the auth.js path bugs in the first
place — a lesson worth stating plainly: syntax-checking individual files
is not the same as building the whole app, and several real bugs this
session were only found by doing the latter.

What this still does *not* cover: the
actual AI call, the Supabase reserve/refund flow, or the Paystack verify
flow — those need integration tests against a real (or sandboxed)
environment, which is on you to set up with your actual test keys.

## 10. Edge cases handled
No topics/syllabus → blocked pre-credit. >60 questions/section → blocked.
Invalid duration → blocked. Rate limit exceeded → 429 with a clear message.
Insufficient credits → 402, opens the top-up modal automatically. AI
timeout/malformed JSON/section mismatch → refunded, no charge, clear error.
Unsafe AI-generated SVG → stripped before render, falls back to text
placeholder. Stream interrupted mid-generation → clear message telling the
teacher to check their balance rather than assuming success or failure.
