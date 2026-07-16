-- Premium cosmetic collections. These are presentation-only and never affect gameplay.
-- Dollar-priced items are the premium tier used by the existing atomic purchase RPC.

insert into public.cosmetic_items(
  id, name, kind, accent, available, is_premium,
  price_coins, price_dollars, glyph, shop_visible
) values
  ('pitch-aurora', 'Aurora Gecesi', 'PITCH_THEME', '#66E4FF', true, true, 0, 6, null, true),
  ('chat-aurora', 'Aurora Yankısı', 'CHAT_STYLE', '#66E4FF', true, true, 0, 3, null, true),
  ('emote-comet', 'Kuyruklu Yıldız', 'EMOTE', '#66E4FF', true, true, 0, 2, '☄️', true),
  ('emote-star', 'Yıldız', 'EMOTE', '#B996FF', true, true, 0, 2, '🌟', true),
  ('pitch-champion', 'Şampiyon Finali', 'PITCH_THEME', '#FFD76A', true, true, 0, 6, null, true),
  ('chat-champion', 'Şampiyon Sesi', 'CHAT_STYLE', '#FFD76A', true, true, 0, 4, null, true),
  ('emote-rocket', 'Roket', 'EMOTE', '#FF8A5C', true, true, 0, 2, '🚀', true),
  ('emote-shield', 'Kalkan', 'EMOTE', '#FFD76A', true, true, 0, 2, '🛡️', true)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  accent = excluded.accent,
  available = excluded.available,
  is_premium = excluded.is_premium,
  price_coins = excluded.price_coins,
  price_dollars = excluded.price_dollars,
  glyph = excluded.glyph,
  shop_visible = excluded.shop_visible;

