-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM — AI Questions Generator — migration 003
-- v2: now redundant with 001_exam_tables.sql, which already creates
-- exam_generations with the `tier` column and this same index built in.
-- Safe to still run — every statement below is idempotent (IF NOT
-- EXISTS) — it just won't do anything if you're running the current
-- version of 001. Kept as its own file only so the numbered sequence
-- still makes sense for anyone referencing it from the README.
-- ═══════════════════════════════════════════════════════════════════

alter table exam_generations
  add column if not exists tier text not null default 'premium'; -- 'premium' | 'free'

create index if not exists idx_exam_generations_user_tier_created
  on exam_generations(user_id, tier, created_at desc);
