# Football Link — Yayın Öncesi Eksikler

Son kontrol: 25 Temmuz 2026

Mevcut Android AAB teknik olarak başarıyla derleniyor ancak aşağıdaki eksikler tamamlanmadan mağazaya gönderilmemelidir. İkon, Firebase ve mağaza kimlik bilgileri eklendikten sonra yeni production build alınmalıdır.

## P0 — Yayını Engelleyen Eksikler

| Eksik | Mevcut durum | Tahmini efor |
| --- | --- | ---: |
| Uygulama ikonu | Görsel dosyası ve `icon` ayarı yok | 0,5–1 gün |
| Android adaptive icon | Foreground, background ve monochrome ikon yok | 0,5 gün |
| Splash ekranı | Görsel ve renk yapılandırması yok | 0,5 gün |
| Firebase/FCM | `google-services.json` ve FCM V1 anahtarı yok | 0,5 gün |
| Google Play erişimi | Submit service-account anahtarı yok | 0,5 gün |
| Apple imzalama | Dağıtım sertifikası ve provisioning profile yok | 0,5–1 gün |
| Hesap silme | Uygulama içi silme akışı ve web talep sayfası yok | 1–2 gün |
| Gizlilik politikası | Uygulama içi ve herkese açık web bağlantısı yok | 0,5–1 gün |
| Google/Apple giriş | Butonlar mevcut fakat iki Supabase OAuth sağlayıcısı da kapalı | 0,5–1 gün |

## Gerekli Görsel Paket

- 1024×1024 ana uygulama ikonu.
- iOS ikonu: tam kare, köşeleri hazır yuvarlatılmamış ve şeffaf piksel içermeyen PNG.
- Android adaptive foreground ikonu.
- Android adaptive background rengi veya görseli.
- Android 13+ için monochrome ikon.
- Android notification small icon.
- Splash icon ve arka plan rengi.
- Google Play mağaza ikonu: 512×512 PNG.
- Google Play feature graphic: 1024×500 PNG veya JPEG.
- Android ve iPhone için tercihen 5–7 mağaza ekran görüntüsü.
- Türkçe ve İngilizce mağaza görsel/metin varyantları.
- İsteğe bağlı App Store preview videosu.

Bu ayarlar şu anda `apps/mobile/app.json` içinde tanımlı değildir.

## Kimlik Bilgileri ve Platform Yapılandırması

### Android

- Firebase projesi oluşturulmalı veya mevcut proje bağlanmalı.
- Paket adı `com.footballlink.mvp` olarak Firebase'e eklenmeli.
- `google-services.json` uygulamaya bağlanmalı.
- FCM V1 service-account anahtarı EAS'e yüklenmeli.
- Google Play Console service-account anahtarı EAS Submit'e bağlanmalı.
- Mevcut versionCode uzaktan yönetiliyor; yeni build otomatik artırılmalı.

### iOS

- Apple Developer üyeliği doğrulanmalı.
- Bundle ID `com.footballlink.mvp` App Store Connect'te oluşturulmalı.
- Distribution Certificate hazırlanmalı.
- Provisioning Profile hazırlanmalı.
- APNs push anahtarı EAS'e bağlanmalı.
- App Store Connect API Key veya gerekli submit kimlik bilgileri kurulmalı.

### OAuth

- Supabase üretim projesinde Google sağlayıcısı etkinleştirilmeli.
- Supabase üretim projesinde Apple sağlayıcısı etkinleştirilmeli.
- Google OAuth client ID/secret kurulmalı.
- Apple Service ID, Team ID, Key ID ve private key kurulmalı.
- `footballlink://auth/callback` redirect URL izin listesine eklenmeli.
- Google ve Apple girişleri gerçek cihazda test edilmeli.

Mevcut kontrolde iki sağlayıcı da `Unsupported provider: provider is not enabled` yanıtı vermektedir.

## Hesap ve Gizlilik Gereksinimleri

- Ayarlar ekranına “Hesabımı sil” akışı eklenmeli.
- Silme işlemi Supabase Auth kullanıcısını ve ilişkili kullanıcı verilerini güvenli şekilde temizlemeli.
- Silme öncesi açık onay ve mümkünse yeniden kimlik doğrulama uygulanmalı.
- Web üzerinden hesap silme talebi oluşturulabilecek herkese açık bir URL hazırlanmalı.
- Gizlilik politikası herkese açık bir URL'de yayınlanmalı.
- Gizlilik politikası uygulama ayarlarından açılabilmeli.
- Kullanım koşulları bağlantısı eklenmeli.
- Destek sayfası ve destek e-postası belirlenmeli.
- Kullanıcının reklam/gizlilik tercihlerini değiştirebileceği bir ekran eklenmeli.

Gizlilik metni en az şu veri türlerini kapsamalıdır:

- E-posta ve kimlik doğrulama verileri.
- Kullanıcı ID, görünen ad ve profil bilgileri.
- Maç geçmişi, skorlar, cevaplar ve oyun istatistikleri.
- Arkadaşlıklar, engellemeler, davetler ve raporlar.
- Çevrim içi durum ve cihaz bağlantı bilgileri.
- Push notification token'ı, cihaz platformu ve dil bilgisi.
- AdMob ve diğer üçüncü taraf SDK'ların işlediği reklam/cihaz verileri.
- Saklama süreleri, üçüncü taraf paylaşımı ve veri silme yöntemi.

## Reklam Tarafındaki Eksikler

- `apps/mobile/app.json` içinde Google'ın örnek/test AdMob App ID'leri kullanılıyor.
- `apps/mobile/src/monetization/match-end-ad.ts` içinde `TestIds.INTERSTITIAL` kullanılıyor.
- Gerçek Android AdMob App ID oluşturulmalı.
- Gerçek iOS AdMob App ID oluşturulmalı.
- Production interstitial reklam birimi oluşturulmalı.
- Test ve production reklam kimlikleri environment bazında ayrılmalı.
- EEA, İngiltere ve İsviçre için UMP/CMP onay akışı eklenmeli.
- Reklam yüklenmeden önce kullanıcının onay durumu kontrol edilmeli.
- Ayarlara “Gizlilik ve çerez tercihleri” bağlantısı eklenmeli.
- Apple için App Tracking Transparency kullanılıp kullanılmayacağı netleştirilmeli.
- Reklamların uygunsuz/yaşa uygun olmayan içerik olarak bildirilebileceği bir yöntem sağlanmalı.
- Google Play Console'da “Reklam içerir” beyanı verilmelidir.

## Mağaza Metadatası

### Her İki Mağaza

- Uygulama adı ve marka yazımı kesinleştirilmeli.
- Kısa açıklama hazırlanmalı.
- Uzun açıklama hazırlanmalı.
- Türkçe ve İngilizce çeviriler hazırlanmalı.
- Kategori belirlenmeli; olası seçimler Games/Trivia veya Sports.
- Gizlilik politikası URL'si girilmeli.
- Destek URL'si ve destek e-postası girilmeli.
- Kullanım koşulları URL'si belirlenmeli.
- Yaş derecelendirme anketi doldurulmalı.
- Hedef kitle yaş grubu seçilmeli.
- Ülkeler, fiyatlandırma ve dağıtım kapsamı seçilmeli.
- İnceleme için süresi dolmayan demo hesap hazırlanmalı.
- İnceleme notlarına maç, arkadaş daveti, rövanş ve bildirim akışlarının test adımları yazılmalı.

### Google Play

- 512×512 mağaza ikonu.
- 1024×500 feature graphic.
- Telefon ekran görüntüleri.
- Kısa ve tam açıklama.
- Data Safety formu.
- Hesap silme web URL'si.
- Target Audience and Content formu.
- IARC içerik derecelendirme formu.
- Reklam beyanı.
- App Access bölümünde demo hesap.
- Google Play App Signing ve production track kurulumu.

### App Store

- Subtitle ve keywords.
- Support URL.
- Marketing URL isteğe bağlı.
- App Privacy veri beyanları.
- Yaş derecelendirmesi.
- Copyright ve geliştirici bilgileri.
- İnceleme iletişim adı, e-posta ve telefon.
- Demo hesap ve review notes.
- Gerekli iPhone ekran görüntüleri.
- Export compliance ayarı kontrolü.
- Uygulama sürümü ve build seçimi.

## Kalite ve Ürün Eksikleri

- Şifre sıfırlama akışı eklenmeli.
- Ayarlar ekranına gizlilik, koşullar, destek ve hesap silme bölümleri eklenmeli.
- Ekran yönü portre tasarımına uygun olarak `orientation: "portrait"` şeklinde sabitlenmeli.
- `expo` paketi `54.0.35` sürümünden beklenen `54.0.36` sürümüne yükseltilmeli.
- `@react-navigation/bottom-tabs` Expo Doctor beklentisiyle uyumlandırılmalı.
- Push izin reddi ve sonradan ayarlardan açma akışı gerçek cihazda test edilmeli.
- Bildirime dokunarak soğuk başlangıç deep-link testi yapılmalı.
- Arkadaşlık isteği, maç daveti ve rövanş bildirimi uçtan uca test edilmeli.
- Ağ kesintisi, oturum süresi dolması ve tekrar giriş senaryoları test edilmeli.
- Hesap silme sonrasında push token ve oturum temizliği doğrulanmalı.
- Android ve iOS release build'lerinde splash/icon görünümü kontrol edilmeli.
- Farklı ekran boyutlarında taşma ve klavye kontrolleri yapılmalı.

## Hukuki ve İçerik Riskleri

- “Football Link” adı için TÜRKPATENT, EUIPO ve WIPO marka araştırması yapılmalı.
- Kullanılan gerçek oyuncu, kulüp, lig ve istatistik verilerinin yayın/dağıtım lisansları doğrulanmalı.
- Kulüp armaları, oyuncu fotoğrafları ve üçüncü taraf görseller kullanılıyorsa hakları belgelenmeli.
- Ses dosyalarının kaynak ve lisans kayıtları korunmalı.
- Uygulama çocukları hedefleyecekse yaş ekranı, reklam ve veri politikaları ayrıca uygulanmalı.
- Uygulama çocukları hedeflemiyorsa mağaza hedef kitle formları buna göre açık ve tutarlı doldurulmalı.

## Hazır Olanlar

- Android package: `com.footballlink.mvp`.
- iOS bundle ID: `com.footballlink.mvp`.
- Android API 36 hedefi Expo SDK 54 üzerinden karşılanıyor.
- Expo SDK 54, EAS üzerinde iOS 26/Xcode 26 build altyapısını destekliyor.
- Android production AAB başarıyla oluşturuldu.
- EAS uzaktan versionCode artırımı çalışıyor.
- Supabase bildirim migration'ı üretime uygulandı.
- Cloudflare Match Server ve push dispatch endpoint'i üretimde.
- Bildirim kutusu, RLS ve Realtime yapısı aktif.
- TypeScript typecheck başarılı.
- Workspace testlerinin tamamı başarılı.
- `ITSAppUsesNonExemptEncryption: false` ayarı mevcut.

## Önerilen Uygulama Sırası

1. Marka yönü, logo ve ikon paketini hazırlamak.
2. `app.json` içine icon, adaptive icon, notification icon, splash ve orientation ayarlarını eklemek.
3. Gizlilik politikası, kullanım koşulları, destek ve hesap silme web sayfalarını yayınlamak.
4. Uygulama içi hesap silme ve politika bağlantılarını geliştirmek.
5. Google ve Apple OAuth sağlayıcılarını etkinleştirmek.
6. Firebase/FCM, APNs, Google Play ve App Store kimlik bilgilerini bağlamak.
7. Gerçek AdMob kimlikleri ve UMP/CMP onay akışını eklemek.
8. Store metinlerini ve ekran görüntülerini hazırlamak.
9. Android/iOS release candidate build almak.
10. Gerçek cihaz regresyon testi yapmak.
11. Internal testing/TestFlight dağıtımı yapmak.
12. Son onaydan sonra production incelemesine göndermek.

## Tahmini Toplam Efor

| İş grubu | Tahmini efor |
| --- | ---: |
| İkon, splash ve mağaza görselleri | 1–2 gün |
| Gizlilik, destek ve hesap silme | 1–2 gün |
| OAuth, Firebase ve mağaza kimlik bilgileri | 0,5–1,5 gün |
| AdMob production ve consent akışı | 1–2 gün |
| Mağaza metadatası ve ekran görüntüleri | 1–2 gün |
| Release QA ve submission | 1–2 gün |
| **Toplam** | **5–8 iş günü** |

Bu tahmine Google/Apple hesap doğrulama ve mağaza inceleme süreleri dahil değildir.

## Resmî Kaynaklar

- [Expo — Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Expo — FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Google Play — Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Google Play — Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play — Target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Google AdMob — Consent Management Platform](https://support.google.com/admob/answer/7666519)
- [Apple — App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple — Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple — Upcoming SDK requirements](https://developer.apple.com/news/?id=ueeok6yw)
