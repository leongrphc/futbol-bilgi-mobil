# Sonraki görevler

Güncel durum matrisi: [implementation-status.md](implementation-status.md)

## 26 Temmuz yerel sertleştirme — yayın öncesi

Yapıldı (26 Temmuz): migration geçmişi uzlaştırıldı (`migration repair` — 39 yerel dosya applied, 40 karşılıksız MCP kaydı reverted; `migration list` artık birebir). `20260726082345_harden_client_mutation_boundaries.sql`, `20260726093404_competition_match_summary.sql` ve `20260726114500_friends_weekly_league.sql` `db push` ile production'a uygulandı; ACL/RLS matrisi (friendships/result_reports SELECT-only), özet ve haftalık lig RPC grant'leri canlıda doğrulandı. Haftalık lig RPC'si gerçek hesapla (çağıran + ACCEPTED arkadaş) rollback'li smoke geçti. Queue fence + match receipt içeren Worker deploy edildi (versiyon 62393cc2); canlı bot maçı ve reconnect smoke testleri geçti. Security advisor taramasında yeni bulgu yok.

1. İki cihazda cancel-before-join, geç MATCHED, kayıp yanıt ve maçtan lobiye dönüş senaryolarını doğrula
2. 50'den fazla WebSocket olaylı maç, reconnect ve dil değişimini küçük/büyük Android cihazda smoke test et
3. Supabase Auth istemcisindeki implicit/PKCE callback uyumsuzluğunu düzeltip Google, Apple ve e-posta doğrulama deep link'lerini gerçek cihazda test et
4. Expo zincirindeki 5 yüksek/3 orta transitive advisory'yi güvenli SDK yükseltmesiyle kapat; Expo Doctor sürüm uyumunu 18/18'e getir
5. Maç özeti: katılımcı/üçüncü kullanıcı erişimini, tur kayıtsız eski maçı, 50+ tur sınırını ve geçmişten sonuç bildirimini iki cihazla; admin rapor bağlamını service-role ve normal kullanıcı rolleriyle smoke test et
6. Haftalık arkadaş ligi: iki arkadaş cihazında delta/G-M satırlarını, arkadaşsız hesabın boş durumunu ve engellenen oyuncunun listeden düşmesini görsel smoke test et
7. Profil gizlilik migration'ı (`20260726160000_restrict_profile_private_columns.sql`) production'a uygulandı ve canlı rol smoke'u geçti. Kalan: mobil release sonrası cihazda profil/lobi/lider tablosu ekranlarının `profile_self()` yoluyla doğru yüklendiğini ve dil değişiminin (`preferred_locale` UPDATE) hâlâ çalıştığını doğrula
8. Engagement paketi cihaz smoke: giriş serisi kartı claim/ertesi gün artışı, haftalık şampiyon ödül kartı, READY H2H satırı, profil ustalık seviyeleri, albüm koleksiyon claim'i, 4 hesapla tam turnuva (davet→yarı final→final→+150) ve seri/şampiyon push bildirimlerinin cihaza düşmesi

## Phase 1–3 + emotes + audio (kodlandı)

1. Phase 1 album/quests prod migration uygulandı
2. Phase 2 sudden-death/commentator/share client-only
3. Phase 3 zorunlu ilk giriş tutorial bot path; tamamlanma profilde tek seferlik saklanır, solo daily kaldırıldı (`20260713190000_drop_solo_daily.sql`)
4. Match emotes: free 4 + premium shop + tray toggle (`20260713230000_match_emotes.sql` / prod `match_emotes`)
5. Event Week: admin lig event, kupa yok, lobby empty/live, `/event-match` (prod `event_week_core` + `club_league_country_backfill`)
6. Audio v1: match SFX + lobby loop + mute toggles (`expo-audio`, placeholder WAV)
7. Üç mod: Quick/Blitz 4 zor şık, Ranked yazılı cevap; ayrı queue/kupa/ladder ve 5 Quick maçlık Ranked kilidi (`20260713290000_three_mode_ladders.sql`)
8. Başarımlar ve profil vitrini: altı rekabetçi başarım, üç rozet seçimi ve rakip READY kartı (`20260718122859_achievements_profile_showcase.sql`)
9. Oyuncu kariyer profili: lobi adından erişim, G/M ve kazanma oranı, form/seriler, mod karnesi, rekorlar, albüm–kulüp hafızası ve başarım vitrini (`20260718191941_player_profile_stats.sql`)
10. Kuyruk suistimal koruması: ilk 9 gerçek iptal ücretsiz, 10 dakikada 10. iptale 45 saniye cooldown; eşleşmede sıfırlama (`MatchQueue`, production smoke geçti)

Smoke: lobby tutorial kartı, bot/tutorial 3 şıklı cevap, maç emoji tray, stil odası premium unlock, control room event draft→live→end, event maç only-league pool, lobby müzik + hesap menüsü ses toggle, maç SFX (doğru/yanlış/tick/SD/bitiş/emote), başarım ilerlemesi + üçlü vitrin + rakip kartı

Detay: [feature-roadmap.md](feature-roadmap.md)

## P0 — MVP'yi ürünleştirme

1. İki cihazlı Worker persistence smoke testi ve korelasyon logları
2. Arkadaş davet deep link'i, arkadaş isteği/listesi, hazır mesaj/emoji ve rövanş akışını iki cihazda smoke test etme
3. Quick/Blitz/Ranked queue'larını iki cihazda smoke test et; şıkların iki cihazda farklı sırasını, tek kullanımlık `choice_id` reddini, Ranked kilidini ve üç kupa deltasını doğrula
4. Başarım migration'ı ve Worker production'da; rollback'li RPC ile bot/reconnect smoke testleri geçti. Mobil release sonrası Son Saniye, Geri Dönüş ve Kusursuz Maç hesaplamasını kontrollü maçlarla, vitrin seçimini ve rakip kartını iki cihazda doğrula
5. Kariyer profilinin küçük/büyük Android cihazlardaki kaydırma düzenini ve lobi isim yönlendirmesini görsel smoke test et

Market/yayın aşamasına ertelendi: Google ve Apple provider anahtarları, production callback allowlist ve iki mağaza hesabıyla OAuth smoke testi. Geliştirmede e-posta hesabı ve test akışları kullanılacak.

Production deploy aşamasına ertelendi: Worker'a güçlü bir `MATCH_TOKEN_SECRET` secret'ı yükleme ve imzalı WebSocket bilet akışının canlı smoke testi. Kod ve yerel doğrulama tamamlandı.

## P1 — Kalite ve operasyon

1. Mobil reducer, aktif maç kalıcılığı ve iki cihazlı E2E testleri
2. İki oyuncunun aynı anda kopması ve alarm idempotency sertleştirmesi
3. ~~Profil genel okuma yüzeyinden coin/dolar/dil/tutorial alanlarını çıkar~~ (26 Temmuz: `20260726160000_restrict_profile_private_columns.sql` ile `profiles` tablo geneli SELECT kaldırıldı, yalnız oyuncu kartı kolonları grant'lendi; sahibi kendi satırını `profile_self()` SECURITY DEFINER RPC'sinden okuyor). Kalan: avatar URL yerine kullanıcı klasörü doğrulamalı storage path sakla — `avatar_url` hâlâ istemci yazabilir kolon olduğu için keyfi URL yazılabiliyor; düzeltme okuma yüzeylerini de (`player_profile_stats`, `actionable_recent_matches`, `head_to_head_cards` ve avatar render'ı) etkiler
4. Admin kontrol odasına oyuncu/alias/sözleşme inceleme ve düzenleme ekleme
5. İmzalı Android kapalı beta AAB, gerçek cihaz matrisi ve çökme takibi
6. ~~Builder senkronunu tamamlayıp production oyuncu sayısını en az 5.000'e çıkarma; ardından schema v2 export'u canlı Supabase'e yayınlama~~ (26 Temmuz: v4 builder projeye alındı, export production'a yayınlandı — 27.951 oyuncu / 14.311 oynanabilir çift; hedef 5,6 kat aşıldı). Kalan: yeni veri havuzuyla iki cihazda maç kalitesi smoke'u — çok cevaplı çiftlerde tekrar oranı, tanınmayan kulüp adları ve alias kabul hataları

## P2 — Ürün katmanları

1. `20260713290000_three_mode_ladders.sql` migration'ını ve Worker'ı deploy edip üç modun kupa/ladder zincirini iki cihazda smoke test et
2. Mağaza hesapları açılınca test reklam kimliklerini gerçek AdMob kimlikleriyle değiştirme, consent akışını açma ve Google/Apple reklam kaldırma ürünlerini sunucu tarafı makbuz doğrulamasına bağlama. Test interstitial, entitlement modeli ve Shop durum kartı hazır.
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
