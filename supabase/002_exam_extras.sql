-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM — AI Questions Generator — migration 002
-- Run AFTER 001_exam_tables.sql, in the same Supabase project.
-- Adds: rate limiting, Paystack top-up transactions, atomic credit RPC.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Rate limiting — a sliding window is overkill for this scale; a simple
--    per-user rolling counter checked against exam_generations' own
--    timestamps is enough and needs no extra table. See the rate-limit
--    query in functions/api/generate-exam.js, which reads exam_generations
--    directly (created_at >= now() - interval). No new table required here.

-- 2. Paystack top-up transactions — mirrors the Lesson Planner's own
--    `transactions` table exactly, scoped to this app's exam credits.
create table if not exists exam_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  amount_ghs       numeric not null,
  credits_purchased integer not null,
  paystack_ref     text not null unique,
  status           text not null default 'pending', -- pending | processing | completed
  created_at       timestamptz not null default now()
);
create index if not exists idx_exam_transactions_user on exam_transactions(user_id, created_at desc);
create index if not exists idx_exam_transactions_ref on exam_transactions(paystack_ref);

-- 3. Atomic credit increment — avoids the read-then-write race the Lesson
--    Planner's own payment endpoint already guards against via RPC.
--    (functions/api/exam-payment/[[path]].js falls back to read-then-write
--    if this RPC is missing, same fallback pattern as the existing app.)
create or replace function increment_exam_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
as $$
begin
  insert into exam_credits (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set balance = exam_credits.balance + p_amount, updated_at = now();
end;
$$;
