-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM — AI Questions Generator — migration 003
-- Run AFTER 001 and 002. Adds free/premium tier tracking so the free
-- tier's own daily limit can be checked independently of the general
-- rate limit in migration 001/002.
-- ═══════════════════════════════════════════════════════════════════

alter table exam_generations
  add column if not exists tier text not null default 'premium'; -- 'premium' | 'free'

create index if not exists idx_exam_generations_user_tier_created
  on exam_generations(user_id, tier, created_at desc);
