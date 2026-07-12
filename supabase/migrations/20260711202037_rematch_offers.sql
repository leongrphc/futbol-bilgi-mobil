create table public.rematch_offers (
  id uuid primary key default gen_random_uuid(),
  room_key text not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  next_match_key text not null,
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  check(requester_id<>recipient_id)
);
create unique index rematch_offers_pending_recipient_unique on public.rematch_offers(room_key,recipient_id) where status='PENDING';
create index rematch_offers_recipient_pending_idx on public.rematch_offers(recipient_id,created_at desc) where status='PENDING';
alter table public.rematch_offers enable row level security;
grant select,update on public.rematch_offers to authenticated;
create policy rematch_offer_recipient_read on public.rematch_offers for select to authenticated using((select auth.uid())=recipient_id);
create policy rematch_offer_recipient_update on public.rematch_offers for update to authenticated using((select auth.uid())=recipient_id) with check((select auth.uid())=recipient_id);
