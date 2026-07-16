-- Keep manual production balance changes distinguishable from earned rewards
-- and purchases in the immutable wallet ledger.
alter table public.wallet_transactions
  drop constraint if exists coin_transactions_reason_check;

alter table public.wallet_transactions
  add constraint coin_transactions_reason_check
  check (reason in ('DAILY_QUEST', 'COSMETIC_PURCHASE', 'ADMIN_GRANT'));

