# Codex'e verilecek veri güncelleme talimatı

Eklediğim `football-data-builder-v3.zip` ile `football_link_mvp_prd_v1.2.md` dosyalarını incele.

Eski v2 veri builder yerine v3'ü kullan. V3 şu kararları kesinleştirir:

- 131 kulüp config'i bulunur.
- Tarihî veri 1990 ve sonrasını kapsar.
- 2026 güncel kadroları API-Football `/players/squads` akışından alınır.
- Son transferler ayrı senkronize edilir.
- Yeni transferler için idempotent `manual_overrides.json` desteği vardır.
- Hedef en az 5.000 gerçek ve benzersiz futbolcudur; sentetik oyuncu production'a alınmaz.
- JSON schema v2 kullanılır ve accepted answer/alias listeleri backend'e aktarılır.
- JSON mobil uygulamaya gömülmez; yalnızca Supabase/backend'e import edilir.

Önce mevcut monorepo içindeki `tools/football-data-builder` klasörünü v3 ile güncelle. Ardından:

1. V3 SQLite migration'larını koru.
2. `club_pairs.json` schema v2 için idempotent Supabase importer yaz.
3. `football_data_versions` tablosu ve export hash kontrolü ekle.
4. Güncel kadro/transfer sync komutlarını README'ye bağla.
5. Match server'ın accepted_answers değerlerini yalnızca server-side kullanmasını sağla.
6. Uğurcan Çakır'ın Trabzonspor–Galatasaray eşleşmesinde doğru kabul edildiği integration testi yaz.
7. `Ugurcann Cakir` yazımının yanlış kaldığını test et.
8. 5.000 oyuncu ve 50.000 üyelik için load test fixture'ı oluştur; fixture sentetik olabilir ama production seed'e karışmamalıdır.
9. Testleri çalıştır ve sonuçları raporla.

Ürün kurallarını değiştirme. Veri kaynağı eksik olduğunda sessizce yanlış cevap üretmek yerine kaydı inceleme kuyruğuna gönder.
