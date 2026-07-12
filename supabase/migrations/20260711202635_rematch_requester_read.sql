create policy rematch_offer_requester_read on public.rematch_offers
for select to authenticated using((select auth.uid())=requester_id);
