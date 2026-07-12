# Sonraki görevler

Güncel durum matrisi: [implementation-status.md](implementation-status.md)

## Phase 1–3 + emotes (kodlandı)

1. Phase 1 album/quests prod migration uygulandı
2. Phase 2 sudden-death/commentator/share client-only
3. Phase 3 tutorial bot path; solo daily kaldırıldı (`20260713190000_drop_solo_daily.sql`)
4. Match emotes: free 4 + premium shop + tray toggle (`20260713230000_match_emotes.sql` / prod `match_emotes`)
5. Event Week: admin lig event, kupa yok, lobby empty/live, `/event-match` (prod `event_week_core` + `club_league_country_backfill`)

Smoke: lobby tutorial kartı, bot/tutorial 3 şıklı cevap, maç emoji tray, stil odası premium unlock, control room event draft→live→end, event maç only-league pool

Detay: [feature-roadmap.md](feature-roadmap.md)

## P0 — MVP'yi ürünleştirme

1. İki cihazlı Worker persistence smoke testi ve korelasyon logları
2. Arkadaş davet deep link'i, arkadaş isteği/listesi, hazır mesaj/emoji ve rövanş akışını iki cihazda smoke test etme
3. Hızlı Maç iki cihazlı queue smoke testi, hazır kontrolü kuyruk davranışı ve bölgesel arama

Market/yayın aşamasına ertelendi: Google ve Apple provider anahtarları, production callback allowlist ve iki mağaza hesabıyla OAuth smoke testi. Geliştirmede e-posta hesabı ve test akışları kullanılacak.

Production deploy aşamasına ertelendi: Worker'a güçlü bir `MATCH_TOKEN_SECRET` secret'ı yükleme ve imzalı WebSocket bilet akışının canlı smoke testi. Kod ve yerel doğrulama tamamlandı.

## P1 — Kalite ve operasyon

1. Mobil reducer, aktif maç kalıcılığı ve iki cihazlı E2E testleri
2. İki oyuncunun aynı anda kopması ve alarm idempotency sertleştirmesi
3. Admin kontrol odasına oyuncu/alias/sözleşme inceleme ve düzenleme ekleme
4. İmzalı Android kapalı beta AAB, gerçek cihaz matrisi ve çökme takibi
5. V3 builder için API-Football/Wikidata senkronunu tamamlayıp production oyuncu sayısını en az 5.000'e çıkarma; ardından schema v2 export'u canlı Supabase'e yayınlama

## P2 — Ürün katmanları

1. Kupa/lig/geçmiş migration'ını deploy edip Hızlı Maçla iki cihaz smoke testi
2. Reklam, reklam kaldırma satın alımı ve doğrulama
3. Kozmetik mağazası migration'ını deploy edip gerçek kilit açma/ödül kaynakları ve motion varyantları
4. iOS ve market/hukuk hazırlığı

## Tamamlanan dikey prototip işleri

- [x] Supabase pair doğrulama adapter'ı ve Worker secret yönetimi
- [x] Durable Object state restore ve reconnect pause/snapshot
- [x] Selection timeout ile güvenli otomatik takım atama
- [x] Ani ölüm için cevaplı, kullanılmamış pair seçimi
- [x] Production futbol verisi import ve sürüm sabitleme
- [x] Football Data Builder v3, schema v2 importer, export hash/schema sürümü ve 5.000 oyuncu/50.000 üyelik sentetik yük testi
- [x] Test botu, aktif maça devam ve maçtan güvenli çıkış
- [x] İlk motion paketi ve “hareketi azalt” erişilebilirliği
- [x] Production bot/reconnect smoke testleri
- [x] Expo SDK 54, Expo Doctor ve Android bundle doğrulaması
- [x] Supabase oturumundan kullanıcı+maç kapsamlı 60 saniyelik WebSocket bileti ve Worker doğrulaması
- [x] Ana UI metinleri için cihaz locale'ine bağlı Türkçe/İngilizce sözlük
- [x] Admin web kontrol odası: admin rol doğrulaması, canlı metrikler, veri sürümleri/import geçmişi ve sonuç bildirimi durum yönetimi
