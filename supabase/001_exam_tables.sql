-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM — AI Questions Generator
-- Run this in the SAME Supabase project as the Lesson Planner
-- (Supabase Dashboard → SQL Editor → paste → Run)
--
-- Deliberately does NOT touch `users` or `coins` — this app reuses the
-- existing `users` table for identity (real SSO via the shared JWT
-- secret) but gets its OWN wallet/tables, per your requirement that
-- exam credits are a separate balance from Lesson Planner coins.
--
-- RLS is left disabled on these tables, matching every other table in
-- this project (see db.js's comment: the browser never talks to
-- Supabase directly — only server-side Cloudflare Functions do, using
-- the service role key, which bypasses RLS anyway). If you later add
-- a direct-from-browser Supabase client for this app, enable RLS and
-- add policies keyed on auth.uid() before doing that.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Exam credit wallet — separate balance from the Lesson Planner's `coins` table
create table if not exists exam_credits (
  user_id     uuid primary key references users(id) on delete cascade,
  balance     integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- 2. Generation log — one row per successful exam generation (for support/audit/analytics)
create table if not exists exam_generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  subject       text,
  class         text,
  exam_type     text,
  curriculum    text,
  credits_used  integer not null default 0,
  question_count integer,
  total_marks   integer,
  fingerprint   text,
  ip_hash       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_exam_generations_user on exam_generations(user_id, created_at desc);

-- 3. Exam history — saved/generated exam papers a teacher can revisit or re-print
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

-- 4. Give every existing Lesson Planner user a starting exam-credit row of 0
--    (new users get a row created on first sign-in, same pattern as `coins`)
insert into exam_credits (user_id, balance)
select id, 0 from users
on conflict (user_id) do nothing;
