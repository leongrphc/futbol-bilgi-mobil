# MVP uygulama durumu

Son güncelleme: 26 Temmuz 2026

Bu dosya gerçekleşen uygulamayı izler. Ürün gereksinimlerinin kesin kaynağı değişmeden `football_link_mvp_prd_v1.1.md` dosyasıdır.

## Durum anahtarı

- ✅ Tamamlandı ve otomatik ya da canlı smoke testiyle doğrulandı
- 🟡 Kısmi; dikey prototip var fakat PRD kapsamının tamamı yok
- ⬜ Başlanmadı
- ⚠️ Bilinçli sapma; çalışan uygulama PRD'den farklı

## Uygulama aşamaları

| Aşama | Durum | Not |
|---|---|---|
| 1 — Veri ve oyun çekirdeği | ✅ | V4 builder, schema v2 importer (tek atışlık + batch yayın hattı), exact-match normalizasyonu, sürümlü futbol verisi, state machine, WebSocket protokolü ve testler var. Production veri havuzu 27.951 oyuncu / 14.311 oynanabilir çift. |
| 2 — İki oyunculu dikey prototip | ✅ | Seçim, geri sayım, cevap, reveal, skor, ani ölüm, timeout ve reconnect çalışıyor. Maç görünüm durumu artık 50 olaylık geçici pencereye bağlı değil; uzun maç ve reconnect regresyon testleri yerelde geçiyor. |
| 3 — Gerçek hesap ve sosyal | 🟡 | Supabase Auth ve sosyal migration canlı. İki production hesabıyla arkadaş isteği/kabul/listeleme backend zinciri doğrulandı. Arkadaşlık yazmalarını doğrulamalı RPC'lerle sınırlayan ACL/RLS migration'ı yerelde hazır; production uygulaması ve maç davetinin iki cihaz smoke testi bekliyor. |
| 4 — Üç rekabetçi mod ve kupa | 🟡 | Quick (4 şık, 15 sn, ilk 3), Blitz (4 şık, 8 sn, ilk 2) ve Ranked (yazılı, 20 sn, ilk 3) için ayrı queue, kupa ve ladder kodlandı. Ranked 5 Quick maçla server-side açılır. Migration/Worker deploy ve iki cihazlı smoke testi bekliyor. |
| 5 — Yönetim ve veri operasyonu | 🟡 | Güvenli web kontrol odası; canlı metrikler, veri sürümü rollback, import geçmişi, aktif kulüpler, canlı oyun/ekonomi ayarları ve sonuç bildirimi yönetimiyle hazır. Oyuncu/alias düzenleme sonraki dilimde. |
| 6 — Gelir modeli | 🟡 | Başlangıç kozmetik envanteri ve mağaza ekranına ek olarak maç sonu test reklamı, reklam muafiyeti entitlement modeli ve Shop durum kartı kodlandı. Gerçek AdMob kimlikleri, mağaza ürünü ve sunucu tarafı makbuz doğrulaması hesapların açılmasını bekliyor. |
| 6b — Sticky retention (Phase 1) | 🟡 | Player album + daily quests + metin share kodlandı (`20260713150000_phase1_album_quests.sql`); Supabase deploy ve canlı smoke bekliyor. |
| 7 — Kapalı Android beta | 🟡 | Android export geçiyor. Expo Doctor 17/18; Expo patch sürümü ve bottom-tabs uyum uyarısı, gerçek cihaz matrisi, AAB ve çökme takibi bekliyor. |
| 8 — Market hazırlığı | 🟡 | Cihaz diline göre Türkçe/İngilizce UI hazır; hukuk metinleri, mağaza varlıkları ve iOS doğrulaması yok. |
| 9 — Başarımlar ve profil vitrini | 🟡 | Altı sunucu hesaplı başarım, üç yuvalı vitrin ve rakip kartı entegrasyonu kodlandı; production migration, RPC ve canlı Worker bot/reconnect smoke testleri geçti. Mobil release ile iki cihaz smoke testi bekliyor. |
| 10 — Oyuncu kariyer profili | 🟡 | Lobi adından açılan TR/EN profil; G/M oranı, form, seri, mod karnesi, cevap/tur isabeti, rekorlar, albüm–kulüp hafızası ve başarım vitriniyle kodlandı. Migration production'da ve gerçek authenticated RPC smoke testi geçti; mobil release ve cihaz görsel smoke testi bekliyor. |
| 11 — Detaylı maç özeti | 🟡 | Son Maçlar'dan açılan TR/EN maç tutanağı; skor, rakip, kupa değişimi, tur kulüpleri ve iki tarafın doğrulama durumunu gösterir. Geçmiş turdan sonuç bildirimi mevcut doğrulamalı RPC'yi kullanır; admin-only inceleme bağlamı maç/tur, kulüpler, raporlayanın cevabı ve yeniden doğrulama sonucunu sunar. Katılımcı kontrollü özet migration'ı production'da; iki hesaplı erişim ve cihaz smoke testi bekliyor. |
| 12 — Haftalık Arkadaş Ligi | 🟡 | Arkadaşlar sekmesinde çağıran + ACCEPTED arkadaşların bu haftaki QUICK/BLITZ/RANKED kupa farkını, G/M kaydını ve sırasını gösteren TR/EN lig kartı. Tek SECURITY DEFINER RPC yalnız toplamları döndürür; hafta pazartesi (UTC) `date_trunc` ile sıfırlanır. Migration production'da; gerçek hesapla (çağıran + ACCEPTED arkadaş) canlı RPC smoke testi geçti. Cihaz görsel smoke testi bekliyor. |
| 13 — Engagement paketi | 🟡 | Giriş serisi, haftalık şampiyon ödülü, H2H kartı, ustalık seviyeleri, albüm lig koleksiyonları, sistem push tetikleri ve 4 kişilik arkadaş turnuvası. Migration'lar ve Worker production'da; ledger/idempotency ve bracket zinciri rollback'li canlı smoke geçti. Cihaz görsel smoke ve mobil release bekliyor. |

## PRD kabul kriterleri

| # | Kabul kriteri | Durum | Uygulama notu |
|---:|---|:---:|---|
| 1 | İki gerçek kullanıcı hesap oluşturabilir | 🟡 | E-posta kayıt/giriş, kalıcı oturum ve canlı otomatik profil migration'ı hazır; Google/Apple provider, callback ve iki cihaz smoke testi bekliyor. |
| 2 | Hızlı Maç kuyruğunda eşleşme | 🟡 | Global Durable Object kuyruğu production'da. İstek kimlikli iptal fence'i, kayıp MATCHED yanıtı kurtarma ve geç eşleşmeyi koruma yerelde testli; Worker deploy ve iki cihazlı yarış smoke testi bekliyor. |
| 3 | Hazır kontrolü | 🟡 | Maç odasında çalışıyor. Kuyruktan çıkış UI'da anında sonuçlanıyor ve sunucu temizliği aynı istek kimliğiyle tamamlanıyor; production Worker doğrulaması bekliyor. |
| 4 | Ortak takım havuzu | ✅ | Production Supabase üzerinden 10 takım dönüyor. |
| 5 | Gizli seçim | ✅ | Rakip seçimi reveal öncesi snapshot'a sızmıyor. |
| 6 | Süre sonunda otomatik takım | ✅ | Sunucu alarmı güvenli çift tamamlıyor. |
| 7 | Geçersiz eşleşmede yeniden seçim | ✅ | Aynı takım, cevapsız pair ve tekrar pair reddediliyor. |
| 8 | Geri sayımda cevap yazılamaması | ✅ | Cevap alanı yalnızca `ANSWERING` fazında oluşuyor. |
| 9 | Sunucu yönetimli 15 saniye cevap | ✅ | Deadline Durable Object tarafından belirleniyor. |
| 10 | Round başına tek cevap | ✅ | Duplicate ve geç cevap sunucuda reddediliyor. |
| 11 | Rakip gönderim durumunun gizliliği | ✅ | `ANSWER_ACCEPTED` yalnızca gönderen oyuncuya gidiyor. |
| 12 | İsim normalizasyonu | ✅ | Türkçe karakter, aksan, boşluk ve noktalama testleri var. |
| 13 | Eksik/fazla/yanlış harfin reddi | ✅ | Fuzzy eşleşme yok; exact-match uygulanıyor. |
| 14 | İlk doğru cevabın kazanması | ✅ | Sunucu sequence sırası yalnızca doğru cevaplarda kullanılıyor. |
| 15 | İlk 3 puan / 9 round | ✅ | Oyun motoru testleri kapsıyor. |
| 16 | Ani ölüm | ✅ | Kullanılmamış, cevaplı pair seçimi ve tekrar roundları var. |
| 17 | 10 saniyelik reconnect | ⚠️ | Kullanılabilirlik için 60 saniye uygulandı; PRD kararı güncellenmeli ya da kod 10 saniyeye dönmeli. |
| 18 | Kasıtlı ayrılmada hükmen sonuç | ✅ | Çıkış onayı sonrası `LEAVE_MATCH` hükmen sonuç üretiyor. |
| 19 | Her rekabetçi modun kupası ayrıdır | 🟡 | QUICK +20/−8, BLITZ +15/−5 ve RANKED +25/−15 idempotent finish RPC'sinde ayrı kolonlara yazılır; migration deploy ve canlı iki cihaz doğrulaması bekliyor. |
| 20 | Oda, kod ve davet bağlantısı | 🟡 | Güçlü rastgele oda oluşturma, native davet paylaşımı, arkadaş listesinden davet ve auth boyunca korunan deep link hazır; migration deploy ve iki cihazlı deep-link smoke testi bekliyor. |
| 21 | Arkadaş maçında rövanş | 🟡 | Maç sonrası teklif/kabul/ret WebSocket protokolü ve iki oyuncunun aynı yeni odaya yönlenmesi hazır; iki cihazlı canlı smoke testi bekliyor. |
| 22 | Reveal veya maç geçmişinden sonuç bildirimi | 🟡 | Reveal/sonuç ekranına ek olarak detaylı maç özetindeki her turdan bildirim akışı hazır. Her iki yol katılımcı ve round doğrulamalı RPC'yi kullanır; service-role admin bağlamı raporu güvenilir maç verileriyle incelenebilir kılar. Doğrudan tablo yazımını kapatan ACL/RLS ile özet/admin bağlam migration'larının production uygulaması bekliyor. |
| 23 | Normal maç sonu reklamı | 🟡 | Google test interstitial'ı normal maçtan Maç Merkezi'ne dönüşte gösteriliyor; bot/antrenman hariç. Gerçek AdMob kimlikleri, izin/consent akışı ve cihaz smoke testi bekliyor. |
| 24 | Reklam kaldırma doğrulaması | 🟡 | İstemciden yazılamayan, RLS kontrollü entitlement modeli ve Shop durum kartı hazır. Google/Apple Billing ürünü ile sunucu tarafı makbuz doğrulaması mağaza hesaplarını bekliyor. |
| 25 | Maç ve roundların veritabanına kaydı | 🟡 | Production migration uygulandı; idempotent match/round/submission/finish RPC zinciri service_role ile rollback'li canlı DB smoke testini geçti. İki cihazlı Worker smoke testi bekliyor. |
| 26 | Yönetici veri yönetimi | 🟡 | `app_metadata.role=admin` kontrollü web konsolu; canlı sağlık, veri sürümü/import, güvenli rollback, aktif kulüp, oyun ayarları ve moderasyon var. Oyuncu/alias inceleme-düzenleme eksik. |
| 27 | Bütün ana metinlerin çeviri anahtarları | ✅ | Auth, lobi, maç, hata ve erişilebilirlik metinleri tip güvenli Türkçe/İngilizce sözlükte; cihaz locale'i otomatik seçiliyor. |
| 28 | Android kapalı beta paketi | 🟡 | Android bundle üretiliyor; imzalı kapalı beta AAB henüz yok. |

Özet: 15 tamamlandı, 12 kısmi, 1 bilinçli sapma, 0 başlanmadı. Kuyruk/ACL sertleştirmeleri production'a uygulanmadığı; arkadaş/mesaj ve gelir katmanlarının canlı doğrulaması tamamlanmadığı için ilgili durumlar kısmi tutulmuştur.

## MVP dışı geliştirme araçları

- Test botu PRD'de MVP dışıdır. Yeni hesapların ilk giriş tutorial'ı ve geliştiricinin tek cihazla çekirdek akışı sınaması için kullanılır; kupa veya gerçek matchmaking davranışı sayılmaz. Tutorial tamamlanması profilde kalıcıdır ve bitiren oyuncuya otomatik olarak tekrar gösterilmez.
- Production bot smoke ve reconnect smoke testleri canlı Worker üzerinde çalıştırılabilir.
- Football Data Builder v4 `tools/football-data-builder/` altında; 190 kulüp config'i, Wikidata/Wikipedia/API-Football toplama hattı, kaynak kanıtı (`source_evidence`) ve server-only schema v2 export'u içerir. Yerel SQLite `data/football.db` (1,2 GB, git dışı) 74.886 oyuncu ve 256.925 üyelik taşır; oyuna giden export bunların çift üreten alt kümesidir. Bir önceki v3 verisi `data/old_db.db` ve `exports/club_pairs.old_db.json` olarak duruyor.
- 26 Temmuz'da v4 export'u production'a yayınlandı (sürüm `20260726202145`): 190 kulüp, 27.951 oyuncu, 45.639 kabul edilen alias, 14.311 oynanabilir çift ve 96.950 çift-oyuncu satırı. 10.765 çiftin en az iki cevabı var. Bir önceki `2026.07.12.1` sürümü ARCHIVED olarak duruyor, admin rollback'i hâlâ ona dönebiliyor. `external_id` şeması Wikidata QID tabanlı olduğu için upsert eski oyuncularla birebir eşleşti, mükerrer kayıt oluşmadı.
- Yayın artık `publish_football_data_begin` → `_chunk` → `_activate` zinciriyle parça parça yapılıyor (`20260726170000_batched_football_data_publish.sql`). Satır satır döngü kuran tek atışlık `publish_football_data` küçük export'lar için duruyor; set-based batch hattı aynı işi 19 dakika yerine **28 saniyede** bitirdi. Sürüm STAGING'de kaldığı için yarım kalan import canlı maçları etkilemez; `_abort` ile temizlenir, aynı export hash'iyle `_begin` tekrar çağrılarak devam edilir (`20260726171000_fix_publish_begin_rerun.sql`).
- Lobi ile alt navigasyonun ilk mağaza-kalitesi görsel geçişi Android export ile doğrulandı.
- Kuşanılan pitch theme artık maç atmosferini, skor panelini, saha çizgilerini ve skor ışıklarını değiştiriyor; badge oyuncunun skor kimliğinde renkli arma olarak render ediliyor. Mağaza kartları gerçek pitch/badge önizlemeleri gösteriyor.
- Başarımlar rekabetçi maçların kalıcı round/submission kayıtlarından hesaplanıyor; production migration canlı ve authenticated okuma/vitrin yazma/maç değerlendirme zinciri transaction rollback smoke testini geçti. Son Saniye için Worker son 1 saniye bilgisini service-role RPC yükünde saklıyor. Oyuncu açtığı üç unvanı vitrine alabiliyor ve rakip yalnızca bu üç rozeti READY kartında görüyor.
- Kuyruktan normal vazgeçiş artık anında ceza üretmiyor. Modlar arasında ortak sayaç 10 dakikada 10 gerçek iptalde 45 saniye cooldown uygular; sırada olmayan sahte iptaller sayılmaz ve başarılı eşleşme seriyi sıfırlar. Production smoke testi 9 ücretsiz + 10. cezalı çıkışı doğruladı.
- Canlı admin hesabı: `leongrphc@gmail.com` (`app_metadata.role=admin`). Admin oyun ayarları server-only tabloda tutuluyor ve production Worker takım havuzu, süreler, reconnect, kazanma puanı, maksimum round ve ani ölüm kurallarını maç başında buradan okuyor.
- Production hesapları `#5C6A0B` ve `#7A51C3` arasında arkadaş isteği, kabul ve iki yönlü listeleme canlı doğrulandı. Arkadaş/lig/kozmetik sekmeleri her odaklanmada yenileniyor; sosyal ve kozmetik RPC hataları artık sessizce yutulmuyor.
- 26 Temmuz kalite sertleştirmesi production'da: queue join/cancel istekleri aynı `request_id` ile eşleştirildi; cancel-before-join ve kayıp MATCHED yanıtları için kısa ömürlü Durable Object kayıtları eklendi. Maç görünüm durumu bütün WebSocket olaylarını artımlı işlerken yalnız geçici efekt geçmişi 50 olayla sınırlandı. Arkadaşlık ve sonuç bildirimi tablolarında doğrulamalı RPC dışı yazmayı kapatan migration uygulandı (authenticated yalnız SELECT). Worker 26 Temmuz'da deploy edildi; canlı bot maçı ve reconnect smoke testleri geçti. Migration geçmişi `migration repair` ile birebir uzlaştırıldı; `db push` artık temiz çalışıyor.
- Profil okuma yüzeyi kolon bazlı daraltıldı (`20260726160000_restrict_profile_private_columns.sql`): `profiles` üzerinde `authenticated` rolünün tablo geneli SELECT'i kaldırıldı, yerine yalnız oyuncu kartı kolonları (`id`, `display_name`, `player_code`, `avatar_url`, `trophies`, `blitz_trophies`, `ranked_trophies`, `created_at`) grant'lendi. `coins`, `dollars`, `preferred_locale` ve `tutorial_completed_at` artık başka oyuncuya görünmüyor; sahibi kendi satırını `profile_self()` SECURITY DEFINER RPC'siyle okuyor. `competition_quick_nearby`/`competition_ranked_nearby` SECURITY INVOKER olarak yalnız grant'li kolonları okuduğu için lider tabloları etkilenmedi; Worker service_role ile çalıştığından kapsam dışı. Yerelde 7 sınır testi geçiyor. Migration 26 Temmuz'da `db push` ile production'a uygulandı; canlı `authenticated` rolüyle yapılan smoke, başka oyuncunun kartının okunduğunu, `coins`/`dollars`/`preferred_locale` tablo okumalarının `insufficient_privilege` ile reddedildiğini ve `profile_self()`'in yalnız çağıranın satırını döndürdüğünü doğruladı; `competition_quick_nearby`, `competition_ranked_nearby`, `competition_nearby`, `social_recent_opponents` ve `player_profile_stats` aynı rolle çalışmaya devam ediyor. Security advisor'da yeni bulgu sınıfı yok (`profile_self` mevcut 38 definer RPC ile aynı jenerik lint'e giriyor).
- Detaylı maç özeti, bitmiş maç katılımcısına en fazla son 50 turu tek RPC'de döndürür. `submissions` istemciye kapalı kalır; mobil sözleşme ham/normalize cevap, alias, gönderim sırası ve kesin zaman yerine yalnız cevap verdi/doğru/son saniye boolean'larını gösterir. Rapor inceleme bağlamındaki raporlayana ait cevap ve eşleşme bilgisi yalnız service-role admin RPC'sinden çıkar. Eski veya hükmen biten tur kayıtsız maçlar için skor korunup yönlendirici boş durum gösterilir.

## Motion durumu

- Motion işlevsel geri bildirim olarak uygulanır; pay-to-win veya süre avantajı sağlamaz.
- [x] Geri sayım rakamı pulse
- [x] Takım seçimi spring vurgusu
- [x] Skor ışıkları puan pulse
- [x] Reveal ve maç sonucu kısa giriş geçişi
- [x] Cihazın “hareketi azalt” tercihine uyum
- [ ] Cevap gönderme kilidi mikro geri bildirimi ve isteğe bağlı haptics

## Güncelleme kuralı

Bir kriter ancak kod, ilgili test ve gerekiyorsa production smoke testi tamamlandığında ✅ yapılır. Her özellik tesliminde bu dosya ve `docs/next-tasks.md` birlikte güncellenir.
