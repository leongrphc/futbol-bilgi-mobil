# MVP uygulama durumu

Son güncelleme: 13 Temmuz 2026

Bu dosya gerçekleşen uygulamayı izler. Ürün gereksinimlerinin kesin kaynağı değişmeden `football_link_mvp_prd_v1.1.md` dosyasıdır.

## Durum anahtarı

- ✅ Tamamlandı ve otomatik ya da canlı smoke testiyle doğrulandı
- 🟡 Kısmi; dikey prototip var fakat PRD kapsamının tamamı yok
- ⬜ Başlanmadı
- ⚠️ Bilinçli sapma; çalışan uygulama PRD'den farklı

## Uygulama aşamaları

| Aşama | Durum | Not |
|---|---|---|
| 1 — Veri ve oyun çekirdeği | ✅ | V3 builder, schema v2 atomik importer, exact-match normalizasyonu, sürümlü futbol verisi, state machine, WebSocket protokolü ve testler var. |
| 2 — İki oyunculu dikey prototip | ✅ | Seçim, geri sayım, cevap, reveal, skor, ani ölüm, timeout ve reconnect çalışıyor. |
| 3 — Gerçek hesap ve sosyal | 🟡 | Supabase Auth ve sosyal migration canlı. İki production hesabıyla arkadaş isteği/kabul/listeleme backend zinciri doğrulandı; odak yenileme ve hata geri bildirimi düzeltildi. Maç davetinin iki cihaz smoke testi bekliyor. |
| 4 — Üç rekabetçi mod ve kupa | 🟡 | Quick (4 şık, 15 sn, ilk 3), Blitz (4 şık, 8 sn, ilk 2) ve Ranked (yazılı, 20 sn, ilk 3) için ayrı queue, kupa ve ladder kodlandı. Ranked 5 Quick maçla server-side açılır. Migration/Worker deploy ve iki cihazlı smoke testi bekliyor. |
| 5 — Yönetim ve veri operasyonu | 🟡 | Güvenli web kontrol odası; canlı metrikler, veri sürümü rollback, import geçmişi, aktif kulüpler, canlı oyun/ekonomi ayarları ve sonuç bildirimi yönetimiyle hazır. Oyuncu/alias düzenleme sonraki dilimde. |
| 6 — Gelir modeli | 🟡 | Başlangıç kozmetik envanteri ve mağaza ekranına ek olarak maç sonu test reklamı, reklam muafiyeti entitlement modeli ve Shop durum kartı kodlandı. Gerçek AdMob kimlikleri, mağaza ürünü ve sunucu tarafı makbuz doğrulaması hesapların açılmasını bekliyor. |
| 6b — Sticky retention (Phase 1) | 🟡 | Player album + daily quests + metin share kodlandı (`20260713150000_phase1_album_quests.sql`); Supabase deploy ve canlı smoke bekliyor. |
| 7 — Kapalı Android beta | 🟡 | Expo Doctor ve Android export geçiyor; gerçek cihaz matrisi, AAB ve çökme takibi eksik. |
| 8 — Market hazırlığı | 🟡 | Cihaz diline göre Türkçe/İngilizce UI hazır; hukuk metinleri, mağaza varlıkları ve iOS doğrulaması yok. |

## PRD kabul kriterleri

| # | Kabul kriteri | Durum | Uygulama notu |
|---:|---|:---:|---|
| 1 | İki gerçek kullanıcı hesap oluşturabilir | 🟡 | E-posta kayıt/giriş, kalıcı oturum ve canlı otomatik profil migration'ı hazır; Google/Apple provider, callback ve iki cihaz smoke testi bekliyor. |
| 2 | Hızlı Maç kuyruğunda eşleşme | 🟡 | Global Durable Object kuyruğu production'da; eşleştirilmiş iki kullanıcıya ortak QUICK maç kimliği veriyor. İki cihazlı smoke testi bekliyor. |
| 3 | Hazır kontrolü | 🟡 | Maç odasında çalışıyor; kuyruktan çıkarma/geri alma davranışı yok. |
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
| 22 | Reveal ekranından sonuç bildirimi | ✅ | Gerçek maç reveal/sonuç ekranında neden seçimi var; authenticated, katılımcı kontrollü ve idempotent RPC canlı rollback smoke testini geçti. |
| 23 | Normal maç sonu reklamı | 🟡 | Google test interstitial'ı normal maçtan Maç Merkezi'ne dönüşte gösteriliyor; bot/antrenman hariç. Gerçek AdMob kimlikleri, izin/consent akışı ve cihaz smoke testi bekliyor. |
| 24 | Reklam kaldırma doğrulaması | 🟡 | İstemciden yazılamayan, RLS kontrollü entitlement modeli ve Shop durum kartı hazır. Google/Apple Billing ürünü ile sunucu tarafı makbuz doğrulaması mağaza hesaplarını bekliyor. |
| 25 | Maç ve roundların veritabanına kaydı | 🟡 | Production migration uygulandı; idempotent match/round/submission/finish RPC zinciri service_role ile rollback'li canlı DB smoke testini geçti. İki cihazlı Worker smoke testi bekliyor. |
| 26 | Yönetici veri yönetimi | 🟡 | `app_metadata.role=admin` kontrollü web konsolu; canlı sağlık, veri sürümü/import, güvenli rollback, aktif kulüp, oyun ayarları ve moderasyon var. Oyuncu/alias inceleme-düzenleme eksik. |
| 27 | Bütün ana metinlerin çeviri anahtarları | ✅ | Auth, lobi, maç, hata ve erişilebilirlik metinleri tip güvenli Türkçe/İngilizce sözlükte; cihaz locale'i otomatik seçiliyor. |
| 28 | Android kapalı beta paketi | 🟡 | Android bundle üretiliyor; imzalı kapalı beta AAB henüz yok. |

Özet: 16 tamamlandı, 11 kısmi, 1 bilinçli sapma, 0 başlanmadı. Arkadaş/mesaj ve gelir katmanlarının canlı doğrulaması henüz yapılmadığından ilgili durumlar kısmi tutulmuştur.

## MVP dışı geliştirme araçları

- Test botu PRD'de MVP dışıdır. Yeni hesapların ilk giriş tutorial'ı ve geliştiricinin tek cihazla çekirdek akışı sınaması için kullanılır; kupa veya gerçek matchmaking davranışı sayılmaz. Tutorial tamamlanması profilde kalıcıdır ve bitiren oyuncuya otomatik olarak tekrar gösterilmez.
- Production bot smoke ve reconnect smoke testleri canlı Worker üzerinde çalıştırılabilir.
- Football Data Builder v3; 131 kulüp config'i, güncel kadro/transfer senkronizasyonu, freshness raporu ve server-only schema v2 export'u içerir. Mevcut paketlenmiş export 161 gerçek oyuncu ve 245 oynanabilir takım çifti içerir; 5.000 gerçek oyuncu production veri hedefi henüz tamamlanmadı.
- Schema v2 migration ve v3 export canlı Supabase'e MCP ile yayınlandı: 161 oyuncu, 170 kabul edilen alias, 472 kulüp üyeliği ve 245 pair. Lobi ile alt navigasyonun ilk mağaza-kalitesi görsel geçişi Android export ile doğrulandı.
- Kuşanılan pitch theme artık maç atmosferini, skor panelini, saha çizgilerini ve skor ışıklarını değiştiriyor; badge oyuncunun skor kimliğinde renkli arma olarak render ediliyor. Mağaza kartları gerçek pitch/badge önizlemeleri gösteriyor.
- Canlı admin hesabı: `leongrphc@gmail.com` (`app_metadata.role=admin`). Admin oyun ayarları server-only tabloda tutuluyor ve production Worker takım havuzu, süreler, reconnect, kazanma puanı, maksimum round ve ani ölüm kurallarını maç başında buradan okuyor.
- Production hesapları `#5C6A0B` ve `#7A51C3` arasında arkadaş isteği, kabul ve iki yönlü listeleme canlı doğrulandı. Arkadaş/lig/kozmetik sekmeleri her odaklanmada yenileniyor; sosyal ve kozmetik RPC hataları artık sessizce yutulmuyor.

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
