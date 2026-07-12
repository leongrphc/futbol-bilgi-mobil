# Football Link — MVP Product Requirements Document (PRD)

**Belge sürümü:** 1.1  
**Durum:** MVP kapsamı donduruldu  
**Hedef platformlar:** Android ve iOS  
**İlk yayın adımı:** Kapalı Android beta  
**Doküman dili:** Türkçe  
**Ürün tipi:** İki oyunculu, gerçek zamanlı futbol bilgi ve hız oyunu

---

## 1. Ürün özeti

Football Link, iki oyuncunun seçtiği iki futbol kulübünde de profesyonel A takım sözleşmesi bulunmuş ortak bir futbolcuyu, rakibinden daha hızlı bulmaya çalıştığı gerçek zamanlı bir mobil oyundur.

Her round'da iki oyuncuya aynı takım havuzu gösterilir. Oyuncular rakibin seçimini görmeden bir takım seçer. İki seçim açıklandıktan sonra oyuncuların, seçilen iki kulüple de geçerli bağı bulunan bir futbolcunun kabul edilen tam oyun adını 15 saniye içinde yazması gerekir.

Doğru cevaplar arasında sunucuya önce ulaşan cevap round'u kazanır. Maç, ilk 3 puana ulaşan oyuncuyla veya maksimum round kurallarına göre sonuçlanır.

---

## 2. Ürün hedefleri

### 2.1 Ana hedefler

- Öğrenmesi kolay, hızlı ve tekrar oynanabilir bir futbol bilgi oyunu oluşturmak.
- Gerçek zamanlı iki oyunculu maçlarda anlaşılır ve deterministik sonuç üretmek.
- Hızlı Maç ile yabancı oyuncuların, Arkadaşla Oyna ile tanıdıkların beraber oynayabilmesini sağlamak.
- Futbolcu ve kulüp verisini canlı maç sırasında harici servise bağımlı olmadan doğrulamak.
- Android ve iOS için aynı kod tabanından sürdürülebilir bir ürün geliştirmek.
- Takım, futbolcu, reklam, kupa ve oyun ayarlarının uygulama güncellemesi olmadan yönetilebilmesini sağlamak.

### 2.2 Başarı göstergeleri

MVP kapalı betasında takip edilecek temel göstergeler:

- Tamamlanan maç oranı
- Ortalama eşleşme süresi
- Ortalama maç süresi
- Bağlantı kopması nedeniyle biten maç oranı
- Geçersiz takım eşleşmesi oranı
- Cevap doğrulama itiraz oranı
- Günlük oyuncu başına maç sayısı
- Tekrar maç oynama oranı
- Hızlı Maç kuyruğundan vazgeçme oranı
- Reklam sonrası uygulamadan çıkış oranı

---

## 3. MVP kapsamı

### 3.1 MVP'de bulunacaklar

1. Zorunlu kullanıcı hesabı
2. Google, Apple ve e-posta ile giriş
3. Hızlı Maç
4. Arkadaşla Oyna
5. Arkadaş listesi
6. Oyuncu koduyla arkadaş ekleme
7. Oda kodu ve davet bağlantısı
8. Gerçek zamanlı iki oyunculu maç
9. Gizli takım seçimi
10. 6–10 takımlık ortak ve akıllı takım havuzu
11. 15 saniyelik takım seçim süresi
12. 3–2–1 geri sayımı
13. 15 saniyelik cevap süresi
14. Sunucu taraflı cevap sıralaması ve doğrulama
15. İlk 3 puana ulaşma sistemi
16. Maksimum 9 normal round
17. Gerekirse ani ölüm
18. Basit kupa sistemi
19. Lig görünümü
20. Maç geçmişi
21. Sonucu Bildir sistemi
22. Hazır mesajlar ve emojiler
23. Reklamlar
24. Reklam kaldırma satın alımı
25. Kozmetik ürün altyapısı
26. Türkçe kapalı beta
27. Türkçe ve İngilizce market sürümüne hazır çeviri altyapısı
28. Yönetim paneli
29. Hibrit futbol verisi içe aktarma ve doğrulama süreci

### 3.2 MVP dışında tutulanlar

Aşağıdaki özellikler ilk sürümün zorunlu parçası değildir:

- Antrenman modu
- Botlara karşı oyun
- Serbest yazılı sohbet
- Sesli sohbet
- Sezon sistemi
- Tüm dünya kulüpleri
- Kullanıcı tarafından lig veya takım filtresi oluşturma
- Dereceli ve derecesiz Hızlı Maç ayrımı
- Canlı turnuvalar
- Klanlar
- İzleyici modu
- Oyun içi doğru cevap ipuçları
- Bir round sonrasında diğer geçerli futbolcuların gösterilmesi
- Ping telafisi
- Gelişmiş Elo/MMR sistemi

Bu özellikler ürün doğrulandıktan sonra ayrıca değerlendirilir.

---

## 4. Hedef kullanıcı

- Futbol bilgisine güvenen 13 yaş ve üzeri kullanıcılar
- Arkadaşlarıyla kısa ve rekabetçi oyun oynamak isteyenler
- Futbol transferleri ve oyuncu kariyer geçmişleriyle ilgilenenler
- Uzun oyun oturumları yerine 3–8 dakikalık maçları tercih eden mobil oyuncular

Yaş derecelendirmesi, reklam sağlayıcıları ve mağaza gereksinimleri yayın öncesinde ayrıca doğrulanmalıdır.

---

## 5. Oyun modları

## 5.1 Hızlı Maç

- Kullanıcı gerçek bir çevrim içi rakiple eşleştirilir.
- Maç kupa sistemini etkiler.
- Eşleştirme önce yakın bölge ve benzer kupa aralığında yapılır.
- Rakip bulunamadıkça arama kademeli olarak genişletilebilir.
- Bot kullanılmaz.
- Maç sonunda rövanş seçeneği bulunmaz.
- Normal tamamlanan her maçtan sonra reklam gösterilebilir.
- Kasıtlı ayrılan oyuncu hükmen mağlup olur ve kupa kaybeder.

## 5.2 Arkadaşla Oyna

Oyuncu şu yöntemlerle arkadaş maçı başlatabilir:

- Arkadaş listesinden doğrudan davet
- Kısa oda kodu
- Paylaşılabilir davet bağlantısı

Kurallar:

- Kupa etkilenmez.
- Maç geçmişine arkadaş maçı olarak kaydedilir.
- Maç sonunda iki oyuncu da kabul ederse rövanş başlatılabilir.
- Her 3 tamamlanan arkadaş maçından sonra reklam gösterilebilir.
- Maçtan ayrılan oyuncu hükmen mağlup olur ancak kupa kaybetmez.

---

## 6. Kullanıcı ve profil sistemi

### 6.1 Giriş

Hesap açmak zorunludur. Desteklenecek yöntemler:

- Google ile giriş
- Apple ile giriş
- E-posta ile kayıt/giriş

### 6.2 Profil

Her kullanıcı için:

- Benzersiz sistem kimliği
- Değiştirilebilir görünen ad
- Benzersiz kısa oyuncu kodu
- Avatar
- Profil çerçevesi
- Kupa sayısı
- Lig
- Galibiyet ve mağlubiyet sayısı
- Hızlı Maç istatistikleri
- Arkadaş maçı istatistikleri
- Maç geçmişi
- Reklam kaldırma durumu
- Sahip olunan kozmetikler

bulunur.

Görünen adların benzersiz olması gerekmez.

Örnek:

```text
Mustafa
#A7K29
```

---

## 7. Ana maç akışı

Bir maç aşağıdaki durum makinesiyle yönetilir:

```text
MATCHMAKING
    ↓
READY_CHECK
    ↓
TEAM_POOL
    ↓
TEAM_SELECTION
    ↓
SELECTION_VALIDATION
    ↓
COUNTDOWN
    ↓
ANSWERING
    ↓
REVEAL
    ↓
NEXT_ROUND veya MATCH_FINISHED
```

Ani ölüm gerektiğinde:

```text
SUDDEN_DEATH_PAIR
    ↓
COUNTDOWN
    ↓
ANSWERING
    ↓
REVEAL
    ↓
MATCH_FINISHED veya yeni SUDDEN_DEATH_PAIR
```

Bütün phase geçişleri sunucu tarafından yönetilir. Mobil istemci kendi başına phase değiştiremez.

---

## 8. Hızlı Maç hazır kontrolü

Rakip bulunduğunda iki oyuncuya da 10 saniyelik **Hazırım** ekranı gösterilir.

- İki oyuncu da onaylarsa maç başlar.
- Onay vermeyen oyuncu kuyruktan çıkarılır.
- Hazır olan oyuncu otomatik olarak kuyruğa geri alınır.
- Bu aşamada kupa veya mağlubiyet cezası verilmez.

---

## 9. Phase 1 — Takım havuzu ve takım seçimi

### 9.1 Takım havuzu

Her normal round'da iki oyuncuya aynı takım havuzu gösterilir.

MVP ayarı:

- Minimum: 6 takım
- Maksimum: 10 takım
- Havuz büyüklüğü round bazında değişebilir.
- Aktif takım listesi yönetim panelinden belirlenir.
- MVP başlangıç kapsamı yaklaşık 30–50 popüler Avrupa kulübüdür.
- Altyapı ileride bütün takımları gösterecek biçimde genişleyebilir.

### 9.2 Akıllı havuz oluşturma

Havuz tamamen kör rastgele üretilmez.

Sistem:

- Kulüpler arasındaki önceden hesaplanmış ortak oyuncu ilişkilerini kullanır.
- Havuzdaki takımlar arasında geçerli eşleşme bulunma olasılığını yükseltir.
- Hangi kulüplerin birbirine bağlı olduğunu istemciye açıklamaz.
- Aynı maçta daha önce oynanmış takım çiftlerini havuz üretirken dikkate alır.

### 9.3 Gizli seçim

- İki oyuncu da rakibin seçimini görmeden takımını seçer.
- Oyuncu, **Onayla** butonuna basmadan önce seçimini değiştirebilir.
- Onaylandıktan sonra seçim kilitlenir.
- Seçim rakibe açıklanmaz.
- İki oyuncu da onayladığında seçimler aynı anda açıklanır.

### 9.4 Seçim süresi

- Takım seçimi için 15 saniye verilir.
- Süre içinde seçim yapmayan oyuncuya sunucu havuzdan takım atar.
- Sistem mümkün olduğunca geçerli ve farklı takım atar.
- İki oyuncunun aynı takımı seçmesi geçersizdir.
- Aynı takım seçilmişse iki oyuncu da tekrar gizli seçime gönderilir.
- Seçilen iki kulüp arasında ortak futbolcu yoksa iki oyuncu da yeniden seçim yapar.
- Geçersizliğin ayrıntısı, rakibin seçimi hakkında fazladan ipucu vermeyecek şekilde gösterilir.

### 9.5 Aynı maçta tekrar kuralı

Takım sırası önemsizdir:

```text
Arsenal + Real Madrid
```

ile:

```text
Real Madrid + Arsenal
```

aynı eşleşmedir.

Aynı takım çifti, aynı maçın normal ve ani ölüm round'larında tekrar kullanılamaz. Farklı maçlarda yeniden kullanılabilir.

---

## 10. Phase 2 — Geri sayım ve cevap

### 10.1 Geri sayım

Takımlar açıklandıktan sonra:

```text
Tahminini hızlıca yap!
3
2
1
```

gösterilir.

- Geri sayım sırasında cevap alanı kilitlidir.
- Klavye ile önceden yazmaya izin verilmez.
- Geri sayım bittikten sonra sunucu cevap phase'ini başlatır.
- İki istemciye aynı sunucu phase olayı gönderilir.

### 10.2 Cevap süresi

- Cevap süresi 15 saniyedir.
- Oyuncular rakibin cevap gönderip göndermediğini göremez.
- Bir oyuncu gönderdiğinde diğer oyuncunun süresi devam eder.
- İki oyuncu da cevap verdiğinde Reveal aşaması erken başlayabilir.
- Oyunculardan biri cevap vermediyse süre sonuna kadar beklenir.
- Uygulama arka plana geçerse süre durmaz.
- Oyuncu süre bitmeden dönerse kalan sürede cevap verebilir.

### 10.3 Cevap gönderimi

Cevap şu iki yöntemle gönderilebilir:

- Ekrandaki **Gönder** butonu
- Mobil klavyedeki Enter/Gönder tuşu

Kurallar:

- Boş cevap gönderilemez.
- Yalnızca boşluklardan oluşan cevap gönderilemez.
- Gönderimden sonra cevap kilitlenir.
- Cevap değiştirilemez.
- Her oyuncunun round başına tek cevap hakkı vardır.
- Kopyala–yapıştır kapalıdır.
- Futbolcu önerisi ve otomatik tamamlama bulunmaz.
- Telefonun standart yazım özellikleri mümkün olduğu ölçüde devre dışı bırakılır.

---

## 11. Phase 3 — Reveal ve puanlama

Reveal ekranı 5 saniye gösterilir ve sonra otomatik olarak sonraki round'a geçilir.

Gösterilecek bilgiler:

- İki oyuncunun cevabı
- Cevapların doğru/yanlış durumu
- Round'u kazanan
- Güncel maç skoru
- Sonucu Bildir butonu

Gösterilmeyecek bilgiler:

- Diğer geçerli futbolcular
- Alternatif doğru cevaplar
- Rakibin cevap gönderdiği kesin milisaniye
- Veri tabanındaki bütün alias'lar

### 11.1 Round sonucu

| Oyuncu 1 | Oyuncu 2 | Sonuç |
|---|---|---|
| Doğru ve önce ulaştı | Doğru | Oyuncu 1 +1 |
| Doğru | Yanlış | Oyuncu 1 +1 |
| Yanlış | Doğru | Oyuncu 2 +1 |
| Yanlış | Yanlış | Puan yok |
| Cevapsız | Doğru | Doğru cevap veren +1 |
| Cevapsız | Yanlış veya cevapsız | Puan yok |
| Aynı doğru cevap ve önce ulaştı | Aynı doğru cevap | Önce ulaşan +1 |

Hız yalnızca doğru cevaplar arasında belirleyicidir. Yanlış cevabı erken göndermek avantaj sağlamaz.

---

## 12. Maç bitiş kuralları

### 12.1 Normal bitiş

- İlk 3 puana ulaşan oyuncu maçı hemen kazanır.
- Bir oyuncu 3 puana ulaşmadıysa en fazla 9 normal round oynanır.
- 9. round sonunda skorlar farklıysa yüksek skorlu oyuncu kazanır.
- Skor eşitse ani ölüm başlar.

### 12.2 Ani ölüm

Ani ölümde oyuncular takım seçmez.

Sistem:

- Daha önce kullanılmamış geçerli bir takım çifti seçer.
- En az 2–3 geçerli ortak futbolcusu bulunan orta zorluktaki eşleşmelere öncelik verir.
- Takımları iki oyuncuya aynı anda açıklar.
- Normal 3–2–1 ve 15 saniyelik cevap akışını kullanır.

Sonuç:

- Yalnızca biri doğruysa maçı o oyuncu kazanır.
- İkisi de doğruysa sunucuya önce ulaşan cevap maçı kazanır.
- İkisi de yanlış veya cevapsızsa yeni ani ölüm round'u başlar.

---

## 13. Futbolcu geçerlilik kuralları

Bir futbolcunun bir kulüpte bulunmuş sayılması için:

- Kulübün profesyonel A takımıyla sözleşme ilişkisi bulunmalıdır.
- Resmî maça çıkmış olması gerekmez.
- Kiralık olarak A takım kadrosuna katılması geçerlidir.
- Yalnızca altyapı veya rezerv takım geçmişi yeterli değildir.
- Veri kapsamı 1 Ocak 1990 ve sonrasıdır.
- Sözleşme veya kiralık dönem 1 Ocak 1990 tarihine taşıyorsa geçerlidir.
- Emekli oyuncular geçerlidir.
- Vefat etmiş oyuncular, veri kurallarını karşılıyorsa geçerlidir.

Örnek:

Bir oyuncu 1988–1991 arasında Arsenal A takım sözleşmesine sahipse Arsenal geçmişi geçerlidir; çünkü sözleşmesi 1 Ocak 1990 tarihine taşmıştır.

---

## 14. İsim doğrulama kuralları

### 14.1 Ana oyun adı

Her futbolcu için bir **ana oyun adı** tanımlanır.

Örnek:

- Cristiano Ronaldo
- Ronaldo Nazário
- Mesut Özil
- Pelé
- Kaká

Hukuki nüfus adının tamamı zorunlu değildir. Futbol dünyasında oyuncuyu açıkça tanımlayan, yönetim tarafından onaylanmış isim kullanılır.

### 14.2 Doğrulanmış alias sistemi

Her futbolcu için isteğe bağlı olarak:

- Aksansız yazım
- Farklı alfabe/transliterasyon
- Yaygın tam isim
- Resmî futbol adı
- Doğrulanmış lakap
- Doğrulanmış tek isim

kaydedilebilir.

Örnek:

```text
Ana oyun adı: Javier Hernández
Alias: Javier Hernandez
Alias: Chicharito
```

Belirsiz alias kabul edilmez.

Örnek:

```text
Ronaldo
```

birden fazla futbolcuyu ifade edebileceği için tek başına kabul edilmemelidir; ancak belirli bir oyuncunun veri politikası açıkça izin veriyorsa yönetim tarafından tanımlanabilir.

### 14.3 Normalizasyon

Karşılaştırma öncesinde:

- Baştaki ve sondaki boşluklar kaldırılır.
- Birden fazla boşluk tek boşluğa indirilir.
- Büyük/küçük harf farkı kaldırılır.
- Unicode normalizasyonu uygulanır.
- Aksan ve Türkçe karakter farklılıkları karşılaştırma biçimine dönüştürülür.
- Zararsız noktalama işaretleri standartlaştırılır.

Örnek olarak aşağıdakiler eşleşebilir:

```text
Mesut Özil
mesut özil
MESUT OZIL
Mesut Ozıl
```

### 14.4 Kabul edilmeyen toleranslar

MVP'de yaklaşık eşleşme veya yazım hatası düzeltmesi yoktur.

Aşağıdakiler yanlış sayılır:

```text
Mesutt Ozil
Mesut Ozi
Mesut Ozl
Mezut Ozil
```

Yani:

- Eksik harf kabul edilmez.
- Fazla harf kabul edilmez.
- Yanlış harf kabul edilmez.
- Kelime eksikliği kabul edilmez.
- Sistem en yakın futbolcuyu tahmin etmez.

Bu yaklaşım deterministik sonuç üretir ve yanlış pozitifleri azaltır.

---

## 15. Sunucu otoritesi ve adalet

Canlı maçta aşağıdaki kararlar yalnızca sunucu tarafından verilir:

- Phase başlangıç ve bitiş zamanları
- Takım havuzu
- Otomatik takım ataması
- Seçimlerin geçerli olup olmadığı
- Cevabın sunucuya ulaşma sırası
- Cevabın doğruluğu
- Round kazananı
- Maç skoru
- Ani ölüm takım çifti
- Maç sonucu
- Hükmen mağlubiyet
- Kupa değişimi

Telefonun yerel saatine güvenilmez.

### 15.1 Cevap sıralaması

Her gönderim için sunucu:

- `received_at`
- `submission_sequence`
- `player_id`
- `round_id`

değerlerini üretir.

Puanlamada ana ölçüt sunucuya ulaşma sırasıdır. Ping telafisi uygulanmaz.

### 15.2 Gizli cevaplar

Doğru cevap listesi veya geçerli oyuncu kimlikleri round başlamadan istemciye gönderilmez. Cevap doğrulaması cihazda yapılmaz.

---

## 16. Bağlantı kopması ve maçtan ayrılma

### 16.1 Bağlantı kopması

- Oyuncunun bağlantısı kesildiğinde maç en fazla 10 saniye duraklatılır.
- Oyuncu aynı hesap ve maç oturumuyla yeniden bağlanabilir.
- Geri dönerse sunucu durumunu yeniden gönderir.
- 10 saniye içinde dönmezse hükmen mağlup olur.

Duraklatma sırasında sunucu kalan phase süresini saklar. Yeniden bağlantıda istemci kendi tahminine göre değil, sunucunun gönderdiği kalan süreye göre devam eder.

### 16.2 Bilerek ayrılma

Hızlı Maç:

- Ayrılan oyuncu hükmen mağlup olur.
- Kupa kaybeder.
- Rakip hükmen galip olur ve kupa kazanır.

Arkadaşla Oyna:

- Ayrılan oyuncu hükmen mağlup olur.
- Kupa etkilenmez.

Tekrarlanan kasıtlı ayrılmalar kayıt altına alınır. Geçici eşleştirme cezası MVP sonrası veya kötüye kullanım görülürse etkinleştirilebilir.

---

## 17. Kupa ve lig sistemi

MVP'de basit kupa sistemi kullanılır.

Başlangıç yapılandırması:

- Galibiyet: +20 kupa
- Mağlubiyet: -15 kupa
- Hükmen galibiyet: +15 kupa
- Hükmen mağlubiyet: -20 kupa
- Minimum kupa: 0

Bu değerler kod içine sabitlenmemeli; yönetim panelinden veya sunucu yapılandırmasından değiştirilebilmelidir.

Lig isimleri örnek olarak:

- Bronz
- Gümüş
- Altın
- Platin
- Elmas
- Şampiyon

Kesin kupa aralıkları ürün dengeleme aşamasında belirlenir.

MVP'de sezon sıfırlaması yoktur. Veri modeli ileride sezon eklenmesini destekler.

---

## 18. Arkadaş ve sosyal sistem

### 18.1 Arkadaş özellikleri

- Oyuncu koduyla arama
- Arkadaşlık isteği gönderme
- Kabul veya reddetme
- Arkadaş silme
- Kullanıcı engelleme
- Çevrim içi durumu
- Maçta durumu
- Doğrudan maç daveti

### 18.2 Oyun içi iletişim

Serbest yazılı sohbet yoktur.

Kullanıcılar yalnızca yönetim tarafından tanımlanmış mesajları ve emojileri gönderebilir:

- İyi oyun!
- Güzel cevap!
- Çok hızlıydın!
- Alkış
- Tebrik
- Şaşkınlık

Kullanıcı rakibin tepkilerini susturabilir.

---

## 19. Reklam ve satın alma modeli

### 19.1 Reklamlar

Hızlı Maç:

- Normal tamamlanan her maçtan sonra geçiş reklamı gösterilebilir.

Arkadaşla Oyna:

- Her 3 normal tamamlanan maçtan sonra geçiş reklamı gösterilebilir.

Şunlardan sonra reklam gösterilmemelidir:

- Hazır kontrolünde iptal
- Teknik hata nedeniyle iptal
- Maç başlamadan bağlantı kesilmesi
- Çok erken hükmen bitiş
- Sunucu tarafından geçersiz sayılan maç

Reklam hiçbir zaman:

- Round sırasında
- Cevap yazarken
- Geri sayım sırasında
- Takım seçimi sırasında

gösterilmez.

Reklam sıklığı uzaktan yapılandırılabilir olmalıdır.

### 19.2 Reklam kaldırma

- Tek seferlik uygulama içi satın alma
- Hesaba bağlı hak
- Aynı mağaza hesabında satın alma geri yükleme desteği
- Android ve iOS mağaza kurallarına uygun doğrulama

### 19.3 Kozmetikler

Satılabilecek içerikler:

- Avatarlar
- Profil çerçeveleri
- Unvanlar
- Takım seçme animasyonları
- Cevap gönderme efektleri
- Maç sonucu efektleri

Satılmayacak avantajlar:

- Ek cevap süresi
- İpucu
- Kolay takım havuzu
- Cevap önerisi
- Kupa avantajı
- Rakibin seçimini görme
- Ek cevap hakkı

Oyun pay-to-win olmamalıdır.

---

## 20. Futbol verisi stratejisi

### 20.1 Temel yaklaşım

Canlı maç sırasında harici futbol API'sine istek yapılmaz.

Veri akışı:

```text
Harici API / CSV / veri kaynağı
              ↓
        Staging tabloları
              ↓
 Normalizasyon ve otomatik kontroller
              ↓
      Yönetici doğrulaması
              ↓
        Canlı oyun tabloları
              ↓
 Önceden hesaplanan takım çiftleri
              ↓
        Canlı maç sunucusu
```

### 20.2 Neden kendi veritabanımız?

- Düşük gecikme
- Harici API kesintilerinden etkilenmeme
- Sağlayıcı değiştirebilme
- A takım sözleşmesi kuralını kendimiz uygulayabilme
- Kiralık dönemleri kontrol edebilme
- Alias ve oyun adlarını yönetebilme
- İtirazlar üzerinden veriyi geliştirebilme
- Maç sırasında API maliyeti oluşturmama

### 20.3 Veri yayın durumları

Her kayıt aşağıdaki durumlardan birine sahip olmalıdır:

```text
IMPORTED
NEEDS_REVIEW
VERIFIED
REJECTED
ARCHIVED
```

Yalnızca `VERIFIED` kayıtlar oyun cevaplarında kullanılabilir.

---

## 21. Önerilen veri modeli

### 21.1 clubs

```text
id
name
normalized_name
country_code
primary_league_id
founded_year
logo_asset_id
brand_asset_status
is_active
created_at
updated_at
```

### 21.2 players

```text
id
game_name
normalized_game_name
legal_name
birth_date
nationality_code
image_asset_id
is_active
verification_status
created_at
updated_at
```

### 21.3 player_aliases

```text
id
player_id
alias
normalized_alias
alias_type
is_ambiguous
verification_status
created_at
updated_at
```

Örnek `alias_type`:

```text
ACCENTLESS
COMMON_NAME
MONONYM
NICKNAME
TRANSLITERATION
ALTERNATIVE_FULL_NAME
```

### 21.4 player_club_contracts

```text
id
player_id
club_id
start_date
end_date
contract_type
squad_level
source_reference
verification_status
notes
created_at
updated_at
```

Örnek `contract_type`:

```text
PERMANENT
LOAN
SHORT_TERM
OTHER_PROFESSIONAL
```

MVP'de yalnızca `squad_level = FIRST_TEAM` kayıtları geçerli cevap üretir.

### 21.5 club_pair_players

Önceden hesaplanmış cevap matrisi:

```text
club_low_id
club_high_id
player_id
difficulty_weight
is_active
generated_at
```

Takım kimlikleri sıralanarak saklanır. Böylece Arsenal–Real Madrid ve Real Madrid–Arsenal tek kayıt kümesi olur.

Önerilen benzersiz anahtar:

```text
UNIQUE(club_low_id, club_high_id, player_id)
```

### 21.6 club_pair_stats

```text
club_low_id
club_high_id
valid_player_count
difficulty_level
last_rebuilt_at
is_enabled
```

Bu tablo:

- Akıllı takım havuzu
- Geçersiz seçim kontrolü
- Ani ölüm eşleşmesi
- Zorluk değerlendirmesi

için kullanılır.

### 21.7 users / profiles

```text
user_id
display_name
player_code
avatar_asset_id
frame_asset_id
trophies
league_id
ads_removed
created_at
updated_at
```

### 21.8 matches

```text
id
mode
status
region
player_1_id
player_2_id
player_1_score
player_2_score
winner_id
finish_reason
started_at
finished_at
trophy_change_player_1
trophy_change_player_2
server_version
```

### 21.9 rounds

```text
id
match_id
round_number
round_type
club_a_id
club_b_id
status
started_at
answer_deadline_at
revealed_at
winner_id
```

`round_type`:

```text
NORMAL
SUDDEN_DEATH
```

### 21.10 submissions

```text
id
round_id
user_id
raw_answer
normalized_answer
received_at
submission_sequence
is_correct
matched_player_id
validation_code
```

### 21.11 result_reports

```text
id
match_id
round_id
reporter_user_id
raw_answer
normalized_answer
club_a_id
club_b_id
matched_player_id
reason
status
reviewer_id
review_notes
created_at
resolved_at
```

### 21.12 friendships ve blocks

```text
friendships
- requester_id
- addressee_id
- status
- created_at
- updated_at

user_blocks
- blocker_id
- blocked_id
- created_at
```

### 21.13 cosmetics ve purchases

```text
cosmetics
user_cosmetics
store_products
purchase_receipts
ad_counters
```

---

## 22. Önerilen teknik mimari

## 22.1 Mobil uygulama

Öneri:

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query veya benzeri sunucu durumu katmanı
- Hafif yerel state yönetimi

Neden:

- Android ve iOS için tek kod tabanı
- Hızlı kapalı beta
- Native mağaza dağıtımı
- Push notification, deep link ve uygulama içi satın alma entegrasyonuna uygunluk
- Web geliştirme tecrübesinden yararlanma

Google ve Apple girişi için Expo'nun native geliştirme build'leri kullanılmalıdır; yalnızca Expo Go'ya bağlı kalınmamalıdır.

## 22.2 Kalıcı backend

Öneri: Supabase

Kullanılacak bileşenler:

- PostgreSQL
- Auth
- Row Level Security
- Storage
- Edge Functions veya güvenli sunucu endpoint'leri
- Profil, arkadaşlık, maç geçmişi ve satın alma verileri
- Yönetim paneli için veri katmanı

Supabase Realtime; çevrim içi durum, arkadaş davetleri ve yönetim dışı hafif gerçek zamanlı olaylarda kullanılabilir.

## 22.3 Canlı maç sunucusu

Öneri: Cloudflare Durable Objects + WebSocket

Her canlı maç için tek otoriter match room:

```text
Match Durable Object
├── Player 1 WebSocket
├── Player 2 WebSocket
├── Current phase
├── Server timers
├── Team pool
├── Locked selections
├── Submissions
├── Submission sequence
├── Score
├── Disconnect state
└── Match result
```

Neden:

- İki bağlantının tek koordinasyon noktasında buluşması
- Sunucu taraflı sıralama
- Tekil ve deterministik phase yönetimi
- WebSocket ile düşük gecikmeli çift yönlü iletişim
- Her maçın birbirinden izole edilmesi
- Maç motorunun veritabanı tetikleyicilerine bağımlı olmaması
- Oyuncu sayısı büyüdüğünde yatay ölçeklenebilme

Maç bittiğinde özet ve round kayıtları güvenli sunucu çağrısıyla PostgreSQL'e yazılır.

## 22.4 Neden canlı maçı yalnızca veritabanı değişiklikleriyle yönetmiyoruz?

Veritabanı gerçek zamanlı olayları prototip için kullanılabilir; ancak:

- Phase zamanlayıcıları
- İlk gelen doğru cevabın deterministik seçimi
- Yeniden bağlantı
- Duraklatma
- Aynı anda gelen mesajların sıralanması
- Ani ölüm durum makinesi

için tek otoriter maç süreci daha güvenlidir.

### En hızlı uygulanabilir yol

```text
React Native + Expo
        ↓
Supabase Auth / Postgres / Storage
        ↓
Cloudflare Worker API
        ↓
Her maç için Durable Object + WebSocket
```

Bu yapı ilk kurulumda yalnızca Supabase Realtime kullanmaktan biraz daha fazla iş çıkarır; ancak markete gönderilecek rekabetçi oyun için sonradan maç motorunu yeniden yazma riskini azaltır.

---

## 23. Canlı maç mesaj protokolü

İstemciden sunucuya örnek olaylar:

```text
READY_CONFIRM
TEAM_SELECT
TEAM_CONFIRM
ANSWER_SUBMIT
RECONNECT
REACTION_SEND
LEAVE_MATCH
```

Sunucudan istemciye örnek olaylar:

```text
READY_CHECK_STARTED
MATCH_STARTED
TEAM_POOL_CREATED
TEAM_SELECTION_STARTED
TEAM_SELECTION_LOCKED
TEAM_SELECTION_INVALID
TEAMS_REVEALED
COUNTDOWN_STARTED
ANSWER_PHASE_STARTED
ANSWER_ACCEPTED
MATCH_PAUSED
PLAYER_RECONNECTED
REVEAL_STARTED
SCORE_UPDATED
NEXT_ROUND
SUDDEN_DEATH_STARTED
MATCH_FINISHED
ERROR
```

Her mesajda en az:

```text
protocol_version
match_id
event_id
server_timestamp
event_type
payload
```

bulunmalıdır.

Tekrarlanan veya gecikmiş mesajları ayıklamak için `event_id` ve istemci komut kimliği kullanılmalıdır.

---

## 24. Yeniden bağlantı

İstemci yeniden bağlandığında sunucu tek bir snapshot döndürür:

```text
match_status
current_phase
phase_started_at
phase_deadline_at
player_scores
team_pool
own_locked_selection
revealed_teams_if_allowed
own_submission_status
disconnect_deadline
round_number
```

Rakibin gizli seçimi veya cevabı, ilgili phase açıklanmadan snapshot'a eklenmez.

---

## 25. Sonucu Bildir sistemi

Reveal ekranında kullanıcı **Sonucu Bildir** seçeneğine basabilir.

Kaydedilecekler:

- Maç ve round
- Takım çifti
- Kullanıcının ham cevabı
- Normalize edilmiş cevap
- Eşleşen futbolcu varsa kimliği
- Doğrulama sonucu
- Bildirim yapan kullanıcı
- Bildirim zamanı

Kurallar:

- Canlı maç sonucu anında değişmez.
- Geçmiş maç skoru MVP'de geriye dönük değiştirilmez.
- Yönetici onaylarsa eksik oyuncu, sözleşme veya alias kaydı düzeltilir.
- Aynı sorun için yinelenen bildirimler gruplanabilir.
- Kötüye kullanım yapan hesapların bildirim yetkisi sınırlandırılabilir.

Bildirim, Reveal kaçırılırsa maç geçmişinden de yapılabilir.

---

## 26. Yönetim paneli

Yönetim panelinde en az şu bölümler bulunmalıdır:

### Futbol verisi

- Kulüpler
- Futbolcular
- Ana oyun adları
- Alias'lar
- A takım sözleşmeleri
- Kiralık dönemler
- Doğrulama kuyruğu
- Veri kaynağı ve notlar
- Takım çiftleri
- Ön hesaplama yeniden oluşturma

### Oyun ayarları

- Aktif kulüpler
- Takım havuzu minimum ve maksimum sayısı
- Takım seçim süresi
- Cevap süresi
- Reveal süresi
- Yeniden bağlantı süresi
- Maksimum round
- Kazanma puanı
- Ani ölüm minimum ortak oyuncu sayısı

### Ekonomi

- Kupa kazanma ve kaybetme değerleri
- Lig aralıkları
- Reklam sıklığı
- Kozmetik ürünler
- Ürün fiyat kimlikleri
- Reklam kaldırma ürünü

### Moderasyon ve destek

- Sonuç bildirimleri
- Kullanıcı engelleri
- Şüpheli maçlar
- Kasıtlı ayrılma kayıtları
- Satın alma sorunları

---

## 27. Marka varlıkları ve lisans notu

MVP ve kapalı beta sırasında gerçek:

- Kulüp adları
- Kulüp armaları
- Kulüp renkleri
- Uygun oyuncu görselleri

kullanılabilir.

Ancak teknik yapı, bu varlıkları koddan bağımsız bir asset katmanında tutmalıdır.

Her görsel için:

```text
asset_id
owner_or_source
license_status
usage_scope
replacement_asset_id
```

gibi alanlar tutulması önerilir.

**Ticari mağaza yayını öncesinde kulüp armaları, oyuncu fotoğrafları, lig markaları ve diğer korunan varlıklar için hukuki ve lisans değerlendirmesi zorunludur.**

Gerektiğinde bütün lisanslı görseller, uygulama kodunu değiştirmeden nötr kartlarla değiştirilebilmelidir.

---

## 28. Yerelleştirme

Kapalı beta:

- Türkçe

Market sürümü hedefi:

- Türkçe
- İngilizce

Sonraki olası diller:

- İspanyolca
- Portekizce
- Fransızca
- Almanca
- İtalyanca

Kurallar:

- Arayüz metinleri kod içine doğrudan yazılmamalıdır.
- Bütün metinler çeviri anahtarlarıyla yönetilmelidir.
- Futbolcu ve kulüp isimleri arayüz çevirilerinden ayrı tutulmalıdır.
- Hazır mesajlar ve emojiler lokalize edilmelidir.
- Sunucu hata kodu göndermeli, kullanıcıya gösterilecek cümleyi istemci çevirmelidir.

---

## 29. Güvenlik ve kötüye kullanım

- İstemciye doğru cevap listesi gönderilmez.
- Doğrulama sunucuda yapılır.
- Kupa değişimi yalnızca güvenli backend tarafından yazılır.
- Kullanıcı kendi kupa veya maç sonucunu doğrudan değiştiremez.
- Match WebSocket bağlantısı kısa ömürlü imzalı token ile açılır.
- Token yalnızca ilgili kullanıcı ve maç için geçerlidir.
- Tek kullanıcı aynı Hızlı Maçta birden fazla aktif bağlantı açamaz.
- Cevap gönderimi round başına bir kez kabul edilir.
- Yinelenen komutlar idempotency anahtarıyla reddedilir.
- Rate limit uygulanır.
- Arkadaşlık ve davet endpoint'leri kötüye kullanıma karşı sınırlandırılır.
- Yönetim panelinde rol bazlı yetki bulunur.
- Satın almalar mağaza sunucusu doğrulamasıyla işlenir.
- Ham cevaplar hata incelemesi için sınırlı süre saklanabilir.
- Gizlilik politikası ve veri saklama süreleri yayın öncesi belirlenir.

---

## 30. Performans hedefleri

Başlangıç hedefleri:

- Maç WebSocket bağlantısının hızlı kurulması
- Kullanıcı komutuna sunucu kabul cevabının bölgesel normal bağlantıda mümkün olduğunca düşük gecikmeyle dönmesi
- Takım çifti doğrulamasının uygulama seviyesinde O(1) veya indeksli sorguyla yapılması
- Cevap doğrulamasının normalizasyon sonrası indeksli exact-match olması
- Harici futbol API'sinin canlı maç yolunda bulunmaması
- Takım havuzlarının önceden hesaplanmış ilişki verisiyle oluşturulması
- Maç odasının iki oyuncu için tek otoriter süreçte tutulması

Kesin SLA değerleri kapalı beta ölçümlerinden sonra belirlenir.

---

## 31. Gözlemlenebilirlik

Kaydedilmesi önerilen teknik olaylar:

- Matchmaking başladı/bitti
- Hazır kontrolü başarısız oldu
- WebSocket bağlantısı açıldı/kapandı
- Reconnect başladı/başarılı/başarısız
- Geçersiz takım seçimi
- Ortak oyuncusuz eşleşme
- Cevap kabul edildi/reddedildi
- Phase zaman aşımı
- Maç hükmen bitti
- Veri tabanı yazımı başarısız oldu
- Satın alma doğrulaması başarısız oldu
- Reklam yüklenemedi
- Sonuç bildirimi oluşturuldu

Her maç için ortak bir `match_id` ile log korelasyonu yapılmalıdır.

---

## 32. Temel ekranlar

### Hesap

- Açılış
- Kayıt ol
- Giriş yap
- Google ile giriş
- Apple ile giriş
- E-posta doğrulama
- Profil oluşturma

### Ana menü

- Hızlı Maç
- Arkadaşla Oyna
- Arkadaşlar
- Profil
- Mağaza
- Ayarlar

### Hızlı Maç

- Rakip aranıyor
- Rakip bulundu
- Hazırım
- Maç yükleniyor

### Arkadaşla Oyna

- Oda oluştur
- Oda kodu gir
- Davet paylaş
- Arkadaş davet et
- Bekleme odası

### Maç

- Takım havuzu
- Takım seçimi
- Seçim kilitlendi
- Takımlar açıklandı
- 3–2–1
- Cevap alanı
- Reveal
- Bağlantı koptu
- Rakip yeniden bağlanıyor
- Maç sonucu

### Diğer

- Maç geçmişi
- Sonucu Bildir
- Arkadaşlık istekleri
- Kullanıcı profili
- Engellenen kullanıcılar
- Mağaza
- Satın almaları geri yükle
- Dil
- Gizlilik ve kullanım koşulları

---

## 33. MVP kabul kriterleri

MVP aşağıdaki durumlarda temel ürün olarak tamamlanmış kabul edilir:

1. İki gerçek kullanıcı hesap oluşturabilir.
2. Hızlı Maç kuyruğunda birbirleriyle eşleşebilir.
3. Hazır kontrolü düzgün çalışır.
4. İki oyuncuya aynı takım havuzu gösterilir.
5. Takım seçimleri açıklanana kadar gizli kalır.
6. Süre sonunda seçim yapmayana otomatik takım atanır.
7. Aynı takım ve ortak oyuncusuz eşleşme güvenli biçimde yeniden seçime gider.
8. 3–2–1 sırasında cevap yazılamaz.
9. 15 saniyelik cevap phase'i sunucu tarafından yönetilir.
10. Her oyuncu yalnızca bir cevap gönderebilir.
11. Rakibin gönderim durumu Reveal'a kadar gizlidir.
12. İsim normalizasyonu belirlenen kurallarla çalışır.
13. Eksik/fazla/yanlış harf kabul edilmez.
14. Doğru cevaplar arasında sunucuya önce gelen kazanır.
15. İlk 3 puan veya 9 round kuralı doğru çalışır.
16. Eşitlikte ani ölüm devreye girer.
17. Bağlantı kopmasında 10 saniyelik yeniden bağlanma çalışır.
18. Kasıtlı ayrılma hükmen sonuç üretir.
19. Kupa değişimi yalnızca Hızlı Maçta uygulanır.
20. Arkadaş odası, kod ve davet bağlantısı çalışır.
21. Arkadaş maçında rövanş çalışır.
22. Reveal ekranından veri hatası bildirilebilir.
23. Normal maç sonu reklam akışı çalışır.
24. Reklam kaldırma satın alımı hesapta doğrulanır.
25. Maçlar ve round'lar veritabanına güvenli kaydedilir.
26. Yönetici futbolcu, alias ve sözleşme kaydı yönetebilir.
27. Uygulamanın bütün ana metinleri çeviri anahtarlarından gelir.
28. Android kapalı beta paketlenebilir.

---

## 34. Uygulama sırası

### Aşama 1 — Veri ve oyun çekirdeği

- PostgreSQL şeması
- Normalizasyon fonksiyonu
- Futbolcu/alias doğrulaması
- Kulüp çifti ön hesaplaması
- Match state machine
- WebSocket mesaj protokolü
- Unit testler

### Aşama 2 — İki oyunculu dikey prototip

- Geçici hesaplar
- Tek maç odası
- Takım seçimi
- Geri sayım
- Cevap
- Reveal
- Skor
- Yeniden bağlantı

Bu aşamada tasarım ve mağaza özellikleri minimum tutulur.

### Aşama 3 — Gerçek hesap ve sosyal özellikler

- Google/Apple/e-posta
- Profiller
- Oyuncu kodları
- Arkadaşlık
- Davetler
- Oda kodları

### Aşama 4 — Hızlı Maç ve kupa

- Matchmaking
- Hazır kontrolü
- Bölgesel arama
- Kupa sistemi
- Ligler
- Maç geçmişi

### Aşama 5 — Yönetim ve veri operasyonu

- Veri içe aktarma
- Doğrulama paneli
- Sonuç bildirimi
- Aktif takım yönetimi
- Uzak oyun ayarları

### Aşama 6 — Gelir modeli

- Reklam
- Arkadaş maçı reklam sayacı
- Reklam kaldırma
- Kozmetik mağazası
- Satın alma doğrulama

### Aşama 7 — Kapalı Android beta

- Gerçek cihaz testleri
- Bağlantı ve yeniden bağlanma testleri
- Klavye davranışları
- Reklam davranışı
- Futbol verisi itirazları
- Çökme ve performans analizi

### Aşama 8 — Market hazırlığı

- İngilizce
- iOS testleri
- Lisans ve marka değerlendirmesi
- Gizlilik politikası
- Kullanım koşulları
- Yaş derecelendirmesi
- Mağaza görselleri
- Android ve iOS gönderimi

---

## 35. Test planının kritik senaryoları

### Takım seçimi

- İki oyuncu farklı ve geçerli takım seçer.
- İki oyuncu aynı takımı seçer.
- Seçilen takımların ortak oyuncusu yoktur.
- Bir oyuncu süreyi geçirir.
- İki oyuncu da süreyi geçirir.
- Otomatik seçim aynı takıma düşmeye çalışır.
- Aynı takım çifti sonraki round'da tekrar seçilmeye çalışılır.

### Cevap

- İki doğru farklı cevap
- İki doğru aynı cevap
- İlk cevap yanlış, ikinci doğru
- İlk doğru, ikinci yanlış
- İki yanlış
- İki cevapsız
- Biri cevapsız, biri doğru
- Enter ve butonun aynı anda tetiklenmesi
- Aynı submission'ın ağ nedeniyle tekrar gönderilmesi
- Deadline ile aynı anda gelen cevap

### İsim doğrulama

- Büyük/küçük harf
- Türkçe karakter
- Aksan
- Fazla boşluk
- Noktalama
- Eksik harf
- Fazla harf
- Yanlış harf
- Tek kelimelik eksik isim
- Doğrulanmış lakap
- Belirsiz alias
- Tek isimle tanınan oyuncu

### Bağlantı

- Takım seçiminde kopma
- Geri sayımda kopma
- Cevap phase'inde kopma
- Reveal'da kopma
- 10 saniye içinde dönme
- 10 saniye sonrasında dönme
- İki oyuncunun aynı anda kopması
- Uygulamanın arka plana alınması

### Maç sonucu

- 3–0, 3–1 ve 3–2 bitiş
- 9 round sonunda farklı skor
- 9 round sonunda eşitlik
- Birden fazla puansız ani ölüm round'u
- Hükmen galibiyet
- Kupa alt sınırı 0
- Arkadaş maçının kupayı etkilememesi

---

## 36. Açık fakat geliştirmeyi durdurmayan kararlar

Aşağıdaki konular oyun motorunun geliştirilmesini engellemez ve daha sonra belirlenebilir:

- Ürünün kesin adı
- İlk 30–50 kulübün kesin listesi
- Futbol veri sağlayıcısı
- Lig kupa aralıkları
- Kozmetik fiyatları
- Reklam sağlayıcısı
- Reklam kaldırma fiyatı
- Kesin marka tasarımı
- Hazır mesajların son listesi
- Push notification kapsamı
- Lig ikonları ve isimleri

Bu kararlar çekirdek maç sisteminden ayrı yapılandırılmalıdır.

---

## 37. Teknik referans yaklaşımı

Mimari öneri hazırlanırken şu güncel resmî dokümantasyon sınıfları esas alınmıştır:

- Expo ve React Native uygulama/authentication belgeleri
- Supabase Realtime Broadcast, Presence ve authorization belgeleri
- Cloudflare Durable Objects ve WebSocket belgeleri
- PostgreSQL metin işleme ve extension belgeleri

Not: MVP isim doğrulaması yaklaşık benzerlik kullanmadığı için `pg_trgm` zorunlu değildir. Normalleştirilmiş exact-match indeksleri yeterlidir. `pg_trgm`, yalnızca yönetim panelinde olası alias önerileri gibi canlı maç dışında kalan araçlar için ileride değerlendirilebilir.

---

## 38. Football Data Builder ve oyun verisi yayınlama süreci

### 38.1 Temel karar

Üretim ortamında futbol verisinin ana ve yetkili kaynağı PostgreSQL/Supabase veritabanıdır.

Dosyaların rolleri:

| Bileşen | Kullanım amacı |
|---|---|
| Yerel SQLite veritabanı | Veri toplama, kontrol etme ve yönetim aracı geliştirme ortamı |
| `club_pairs.json` | Veriyi staging veya production ortamına aktarmak için taşınabilir export/seed dosyası |
| `club_pairs.csv` | İnsan tarafından inceleme, Excel/Sheets kontrolü ve basit toplu aktarım |
| `quality_report.json` | Eksik, zayıf veya doğrulanması gereken takım çiftlerini raporlama |
| PostgreSQL/Supabase | Canlı oyunun kullandığı tek yetkili veri kaynağı |
| Sunucu önbelleği | Sık kullanılan takım çifti ve cevap eşleşmelerini hızlandırma |

SQLite dosyası mobil uygulamaya eklenmeyecektir. JSON dosyasındaki bütün cevaplar da mobil uygulama paketine gömülmeyecektir.

### 38.2 Neden JSON'u doğrudan mobil uygulamada kullanmıyoruz?

`club_pairs.json` dosyası mobil uygulamanın içine konursa kullanıcı:

- Uygulama paketini açarak bütün doğru cevapları çıkarabilir.
- Takım çiftlerinin cevap listesini çevrim dışı okuyabilir.
- Değiştirilmiş bir istemciyle cevapları otomatik gönderebilir.
- Veri güncellemeleri için yeni uygulama sürümü beklemek zorunda kalabilir.

Bu nedenle mobil istemciye yalnızca ilgili round için gerekli görünen bilgiler gönderilir:

```text
Takım havuzu
Takım adları
Takım görselleri
Seçim süresi
Cevap süresi
Round ve maç kimliği
```

Şunlar istemciye gönderilmez:

```text
Takım çiftinin doğru oyuncuları
Kabul edilen alias listeleri
Normalize edilmiş cevap listeleri
Diğer takım çiftlerinin ilişkileri
Doğrulama sorguları
```

### 38.3 Football Data Builder'ın rolü

Football Data Builder, canlı oyun sunucusu değildir. Ayrı bir veri hazırlama aracıdır.

Görevleri:

1. Kulüpleri tanımlamak.
2. Wikidata veya başka kaynaklardan aday oyuncuları almak.
3. Oyuncu–kulüp ilişkilerini SQLite'a kaydetmek.
4. İlişkileri onaylamak veya reddetmek.
5. Ana oyun adlarını ve alias'ları düzenlemek.
6. Takım çiftlerinin ortak oyuncularını oluşturmak.
7. Veri kalite raporu üretmek.
8. Onaylanan veriyi JSON/CSV veya doğrudan API üzerinden backend'e göndermek.

Önerilen çalışma şekli:

```text
Football Data Builder
        ↓
Yerel SQLite çalışma veritabanı
        ↓
İnsan kontrolü ve doğrulama
        ↓
JSON/CSV export veya güvenli sync komutu
        ↓
Supabase staging tabloları
        ↓
Otomatik veri kontrolleri
        ↓
Production tablolarına yayınlama
        ↓
Match server cache yenileme
```

### 38.4 Production veritabanına aktarım

İlk aşamada en basit yöntem JSON export üzerinden aktarım yapmaktır.

Önerilen komut akışı:

```text
python cli.py import-wikidata
python cli.py approve-cross-club
python cli.py build-pairs
python cli.py export --format json
python cli.py publish-supabase
```

`publish-supabase` komutu sonraki geliştirme aşamasında Football Data Builder'a eklenmelidir.

Bu komut:

- Supabase service-role anahtarını yalnızca sunucu ortamından okur.
- Takımları upsert eder.
- Oyuncuları upsert eder.
- Alias'ları upsert eder.
- Oyuncu–kulüp ilişkilerini upsert eder.
- Takım çifti cevaplarını yeniden oluşturur.
- Veri sürümünü artırır.
- Yayınlama sonucunu raporlar.

Service-role anahtarı hiçbir zaman mobil uygulamada veya Git deposunda bulunmaz.

### 38.5 Önerilen Supabase tabloları

Football Data Builder verisi şu production tablolarına aktarılır:

```text
clubs
players
player_aliases
player_club_contracts
club_pair_players
club_pair_stats
football_data_versions
football_data_import_runs
```

#### `football_data_versions`

```text
id
version_number
status
source_export_hash
published_at
published_by
notes
```

Örnek durumlar:

```text
DRAFT
STAGING
ACTIVE
ROLLED_BACK
ARCHIVED
```

Aynı anda yalnızca bir veri sürümü `ACTIVE` olmalıdır.

#### `football_data_import_runs`

```text
id
source
started_at
finished_at
status
clubs_inserted
players_inserted
memberships_inserted
aliases_inserted
pairs_generated
errors
export_hash
```

Bu kayıt, hangi verinin ne zaman ve hangi dosyadan aktarıldığını izlemek için kullanılır.

### 38.6 JSON export yapısı

JSON export yalnızca sonuç listesinden ibaret olmamalıdır. Veri sürümü ve kaynak bilgisi taşımalıdır.

Önerilen üst seviye yapı:

```json
{
  "schema_version": 1,
  "data_version": "2026.07.11.1",
  "generated_at": "2026-07-11T12:00:00Z",
  "clubs": [],
  "players": [],
  "aliases": [],
  "memberships": [],
  "club_pairs": []
}
```

`club_pairs` örneği:

```json
{
  "club_a_id": "arsenal",
  "club_b_id": "real-madrid",
  "valid_player_count": 2,
  "players": [
    {
      "player_id": "mesut-ozil",
      "game_name": "Mesut Özil",
      "normalized_answers": [
        "mesut ozil"
      ]
    }
  ]
}
```

Bu dosya:

- Seed verisi
- Staging importu
- Yedek
- Veri karşılaştırma
- Geri alma

amacıyla kullanılabilir.

Canlı maç sırasında doğrudan diskten JSON okunması zorunlu değildir.

### 38.7 Canlı oyunda cevap doğrulama

Oyuncu cevap gönderdiğinde mobil istemci yalnızca şu veriyi yollar:

```json
{
  "match_id": "match_123",
  "round_id": "round_4",
  "answer": "Mesut Ozil",
  "client_command_id": "cmd_abc"
}
```

Match server:

1. Cevabı teslim alma sırasına göre kaydeder.
2. Metni sunucuda normalize eder.
3. Round'daki iki kulübün kimliğini alır.
4. `club_pair_players` ve `player_aliases` verisiyle exact-match kontrolü yapar.
5. Sonucu sunucu tarafında kaydeder.
6. İstemciye yalnızca cevabın kabul edildiğini bildirir.
7. Doğru/yanlış bilgisini Reveal phase'inde gönderir.

Örnek sorgu mantığı:

```sql
SELECT cpp.player_id
FROM club_pair_players cpp
JOIN player_aliases pa
  ON pa.player_id = cpp.player_id
WHERE cpp.club_low_id = :club_low_id
  AND cpp.club_high_id = :club_high_id
  AND pa.normalized_alias = :normalized_answer
  AND pa.is_accepted_answer = true
  AND cpp.is_active = true
LIMIT 1;
```

Ana oyun adı da `player_aliases` tablosuna kabul edilen bir alias olarak yazılabilir. Böylece tek sorgu yolu kullanılır.

### 38.8 Önbellek kullanımı

İlk MVP'de PostgreSQL sorgusu yeterlidir. Veri ve trafik büyüdüğünde match server aktif takım çiftlerini belleğe alabilir.

Önerilen cache anahtarı:

```text
football-data:{data_version}:pair:{club_low_id}:{club_high_id}
```

Cache değeri:

```json
{
  "mesut ozil": "player_mesut_ozil",
  "dani ceballos": "player_dani_ceballos"
}
```

Kurallar:

- Cache yalnızca sunucuda bulunur.
- Yeni veri sürümü yayınlandığında yeni cache namespace'i kullanılır.
- Eski aktif maçlar başladıkları veri sürümüyle tamamlanabilir.
- Yeni maçlar son `ACTIVE` veri sürümünü kullanır.
- Cache hatasında PostgreSQL'e geri dönülür.

### 38.9 Maçların veri sürümüne bağlanması

Her maç başlarken aktif futbol veri sürümü kaydedilir:

```text
matches.football_data_version_id
```

Bunun faydaları:

- Bir oyuncunun cevabının o maç tarihinde neden doğru veya yanlış sayıldığını açıklayabiliriz.
- Veri güncellense bile geçmiş maçların sonucu yeniden yorumlanmaz.
- İtiraz incelemesinde kullanılan veri sürümü görülebilir.
- Hatalı yayın geri alınabilir.

### 38.10 Veri güncelleme ve geri alma

Önerilen yayınlama süreci:

1. Builder'da veri hazırlanır.
2. Export hash'i hesaplanır.
3. Veri staging tablolarına aktarılır.
4. Duplicate ve ilişki kontrolleri çalışır.
5. Oynanabilir takım çifti sayısı kontrol edilir.
6. Hatalı kayıt yoksa yeni sürüm `ACTIVE` yapılır.
7. Önceki sürüm `ARCHIVED` durumuna alınır.
8. Sunucu cache'i yeni sürümle yenilenir.

Geri alma gerektiğinde:

- Önceki sürüm tekrar `ACTIVE` yapılır.
- Yeni maçlar eski sağlam sürümü kullanır.
- Devam eden maçlar başladıkları sürümle tamamlanır.

### 38.11 MVP için uygulanacak en basit yol

İlk çalışan sürümde:

```text
Football Data Builder SQLite
        ↓
club_pairs.json export
        ↓
Tek seferlik Supabase import scripti
        ↓
PostgreSQL production tabloları
        ↓
Match server exact-match sorgusu
```

kullanılır.

İkinci aşamada:

```text
publish-supabase komutu
+
veri sürümleme
+
otomatik kalite kontrolü
+
sunucu cache'i
```

eklenir.

### 38.12 Kabul kriterleri

Futbol verisi entegrasyonu tamamlanmış sayılmak için:

1. Builder'daki doğrulanmış veriler JSON olarak dışarı aktarılabilmelidir.
2. JSON aynı kayıtları tekrar oluşturmadan Supabase'e upsert edilebilmelidir.
3. Mobil uygulama doğru cevap listesini alamamalıdır.
4. Match server cevap doğrulamasını yalnızca sunucuda yapmalıdır.
5. İsim normalizasyonu Builder ve match server arasında aynı sonucu üretmelidir.
6. Takım sırası Arsenal–Real Madrid veya Real Madrid–Arsenal olsa da aynı çift kullanılmalıdır.
7. Her maç kullanılan futbol veri sürümünü kaydetmelidir.
8. Yeni veri yayınlandıktan sonra yeni maçlar yeni sürümü kullanmalıdır.
9. Veri importu hata verirse aktif production verisi bozulmamalıdır.
10. Önceki veri sürümüne geri dönülebilmelidir.

---

# Son kapsam özeti

MVP'nin özü yalnızca şudur:

```text
Hızlı Maç
+
Arkadaşla Oyna
+
Gizli takım seçimi
+
İki takımda bulunmuş futbolcuyu 15 saniyede yazma
+
Doğru cevaplar arasında sunucuya önce ulaşanın puan alması
+
İlk 3 puan
```

Diğer bütün özellikler bu çekirdeği desteklemeli; çekirdeği geciktiren veya karmaşıklaştıran özellikler MVP dışına çıkarılmalıdır.
