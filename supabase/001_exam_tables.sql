-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM — AI Questions Generator
-- Run this in the SAME Supabase project as the Lesson Planner
-- (Supabase Dashboard → SQL Editor → paste → Run)
--
-- v2: no longer creates a separate `exam_credits` wallet. Per explicit
-- direction, this app shares the Lesson Planner's real `coins` table and
-- real `decrement_coins`/`increment_coins` RPCs — those already exist in
-- this project from the Lesson Planner's own setup and are NOT created
-- here. A teacher's balance is identical in both apps, immediately.
--
-- This migration only adds what's genuinely new: an exam-specific
-- generation log (for the free-tier daily limit and support/audit) and
-- saved exam history. Neither touches `users` or `coins`.
--
-- RLS is left disabled on these tables, matching every other table in
-- this project (see db.js's comment: the browser never talks to
-- Supabase directly — only server-side Cloudflare Functions do, using
-- the service role key, which bypasses RLS anyway). If you later add
-- a direct-from-browser Supabase client for this app, enable RLS and
-- add policies keyed on auth.uid() before doing that.
--
-- If you already ran the OLD version of this migration (which created
-- `exam_credits`), it's now unused — safe to drop once you've confirmed
-- the shared-wallet switch is live and working:
--   drop table if exists exam_credits;
-- ═══════════════════════════════════════════════════════════════════

-- 1. Generation log — one row per successful exam generation. Used for the
--    free-tier daily limit (functions/api/generate-exam.js's
--    checkFreeTierLimit) and for support/audit. Distinct from the shared
--    `generations` table the Lesson Planner writes to — that table is ALSO
--    written to (with tier="exam-premium"/"exam-free", see
--    logExamGeneration()) purely so exam activity shows up in the existing
--    admin panel; this table is the one this app actually queries.
create table if not exists exam_generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  subject       text,
  class         text,
  exam_type     text,
  curriculum    text,
  credits_used  numeric not null default 0,  -- numeric, not integer — costs are fractional (e.g. 1.5), matching COINS_PER_LESSON's own fractional precedent
  question_count integer,
  total_marks   integer,
  fingerprint   text,
  ip_hash       text,
  tier          text,  -- 'free' | 'premium' — for the free-tier daily-limit query specifically
  created_at    timestamptz not null default now()
);
create index if not exists idx_exam_generations_user on exam_generations(user_id, created_at desc);
create index if not exists idx_exam_generations_user_tier_created on exam_generations(user_id, tier, created_at desc);

-- 2. Exam history — saved/generated exam papers a teacher can revisit or re-print
--    (mirrors the existing `plans` table pattern used by the Lesson Planner)
create table if not exists exam_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  title        text,
  subject      text,
  class        text,
  exam_type    text,
  exam_json    jsonb not null,   -- the full structured exam (examTemplate.js schema)
  meta_json    jsonb,            -- schoolName/term/duration/landscape/etc.
  created_at   timestamptz not null default now()
);
create index if not exists idx_exam_history_user on exam_history(user_id, created_at desc);

-- Reasonable per-user cap, enforced server-side (see functions/api/exam-account/[[path]].js)
-- MAX_EXAM_HISTORY_PER_USER = 10  -- mirrors DB.MAX_PLANS_PER_USER in db.js
