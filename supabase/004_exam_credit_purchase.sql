-- ═══════════════════════════════════════════════════════════════════
-- EDUFORMIUM - AI Questions Generator - migration 004 (OPTIONAL, additive)
--
-- WHAT IT FIXES
--   Verifying a Paystack purchase is today three separate database calls: mark the row "processing", add the coins, mark it
--   "completed". If the server is killed between the first two, the buyer paid but the row stays "processing" forever and no
--   later "verify" can finish it. This adds ONE function that does the claim AND the credit in a single transaction: either both
--   happen or neither does, so nothing can be left half-done.
--
-- WHAT IT TOUCHES
--   Nothing that exists. It only CALLS the shared public.increment_coins(uuid, numeric) - the same wallet function every one of your
--   apps already uses - and reads/updates the shared public.transactions row for ONE paystack_ref. No existing function, table or
--   column is changed, so your other apps are unaffected.
--
-- SAFE TO SKIP / SAFE TO ROLL BACK
--   The app detects whether this function exists. If it is not installed the app uses its current three-step flow, unchanged.
--   To remove it again:   drop function if exists public.exam_credit_purchase(text, uuid);
--
-- RETURNS
--   the wallet's NEW balance (numeric)   -> this call claimed the purchase and credited it
--   NULL                                 -> nothing to do: already completed / being processed / no such pending purchase
--   (an exception rolls everything back, so the purchase simply stays "pending" and "Restore previous purchase" can retry it)
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.exam_credit_purchase(p_ref text, p_user_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_coins   numeric;
  v_balance numeric;
begin
  -- 1) claim: only a purchase that is still "pending" and belongs to this user can be claimed (a second call finds nothing)
  update public.transactions
     set status = 'completed'
   where paystack_ref = p_ref
     and user_id::text = p_user_id::text
     and status = 'pending'
  returning coins_purchased into v_coins;

  if not found then
    return null;
  end if;

  if v_coins is null or v_coins <= 0 then
    raise exception 'exam_credit_purchase: purchase % has no valid coin amount', p_ref;   -- rolls the claim back too
  end if;

  -- 2) credit through the shared wallet function, inside the SAME transaction as the claim above
  v_balance := public.increment_coins(p_user_id, v_coins);
  return v_balance;
end;
$$;

-- Only your server (service role) may call it. Without this, Supabase would let any signed-in browser call it.
revoke all on function public.exam_credit_purchase(text, uuid) from public, anon, authenticated;
grant execute on function public.exam_credit_purchase(text, uuid) to service_role;


-- ═══════════════════════════════════════════════════════════════════
-- CHECKS TO RUN (read-only; they change nothing)
--
-- A) Can a browser call your shared coin functions directly? Every row below should say false. If any says true, anyone with
--    your public (anon) key could add coins to a wallet from the browser console, in EVERY app that shares this database.
--
--    select p.proname,
--           has_function_privilege('anon',          p.oid, 'execute') as anon_can_run,
--           has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
--    from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('increment_coins','decrement_coins','wallet_bridge_apply','wallet_bridge_credit_coins',
--                        'wallet_complete_claim','wallet_record_debit','exam_credit_purchase');
--
-- B) Purchases left half-done by the old flow (paid, but stuck in "processing" for over 10 minutes). Review these by hand:
--    never "fix" them blindly, because some may already have been credited.
--
--    select id, user_id, paystack_ref, coins_purchased, amount_ghs, created_at
--    from public.transactions
--    where status = 'processing' and created_at < now() - interval '10 minutes'
--    order by created_at;
-- ═══════════════════════════════════════════════════════════════════
