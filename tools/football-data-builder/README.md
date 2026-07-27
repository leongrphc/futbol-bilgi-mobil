# Football Link Data Builder v4

Football Link mobil oyunu için binlerce tarihî ve güncel oyuncu–takım ilişkisi toplayan, kaynak kanıtlarını saklayan ve oyun için hazır takım çifti cevapları üreten veri aracı.

## V4 neden gerekli?

Önceki paket içindeki 161 oyuncu yalnızca çevrim dışı demo verisiydi. V4, sayıyı sahte oyuncularla büyütmek yerine gerçek kaynaklardan otomatik veri toplar.

Ana hedefler:

- 190 seçili kulüp
- 1990–2026 tarihî kariyerler
- 2026 güncel kadrolar
- En az 5.000 benzersiz gerçek futbolcu
- Kaynak URL'si ve revizyonu tutulmuş doğrulanabilir kayıtlar
- Mobil uygulamaya doğru cevap listesini sızdırmadan backend'e aktarılabilir JSON/SQLite

## Kaynak katmanları

```text
1. Wikidata
   └── Yapılandırılmış oyuncu–kulüp ilişkileri, QID ve alias

2. Wikipedia Action API
   ├── Kulüplerin “players” kategorilerindeki tarihî futbolcular
   ├── Futbolcu infoboxlarındaki senior career kulüpleri
   ├── Sayfa revizyonu ve kaynak URL'si
   └── API anahtarı gerektirmez

3. API-Football (isteğe bağlı)
   ├── Güncel A takım kadroları
   └── Son transferler

4. manual_overrides.json
   └── Kaynaklar güncellenmeden önce acil doğrulanmış düzeltmeler
```

Canlı oyun sırasında hiçbir dış kaynağa istek atılmaz. Bütün veriler önce SQLite/PostgreSQL'e alınır ve takım çiftleri önceden hesaplanır.

## Otomatik olarak taranmayan siteler

Transfermarkt gibi otomatik bot/scraping erişimini kullanım koşullarında yasaklayan siteler bu araca bağlanmaz. Kulüp resmî siteleri yalnızca manuel doğrulama kanıtı olarak kullanılabilir. Farklı HTML yapısına sahip yüzlerce siteyi rastgele kazımak yerine resmî API ve açık veri kaynakları tercih edilir.

---

## Hızlı kurulum

### Windows

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python cli.py init
python cli.py seed-demo --fresh
python cli.py apply-overrides
streamlit run app.py
```

### Ortam değişkenleri

```powershell
$env:WIKIDATA_USER_AGENT="FootballLinkDataBuilder/0.4 (contact: mail@example.com)"
$env:WIKIPEDIA_USER_AGENT="FootballLinkDataBuilder/0.4 (contact: mail@example.com)"
$env:WIKIPEDIA_LANGUAGE="en"
$env:API_FOOTBALL_KEY="API_KEY_BURAYA"
```

`WIKIPEDIA_USER_AGENT` ve `WIKIDATA_USER_AGENT` gerçek bir iletişim adresi içermelidir. API-Football anahtarı yalnızca güncel kadro/transfer katmanı için gereklidir.

---

# 5.000+ oyuncu toplama akışı

## Aşama 1 — Kulüpleri hazırla

```powershell
python cli.py init
python cli.py apply-overrides
```

## Aşama 2 — Wikidata tarihî ilişkileri

Önce kulüp kimliklerini çöz:

```powershell
python cli.py resolve-clubs --continue-on-error
```

Tüm aktif kulüpler için 1990 sonrası ilişkileri çek:

```powershell
python cli.py import-wikidata --min-year 1990 --continue-on-error
```

Wikidata'da iki seçili kulüpte görünen oyuncuları toplu doğrula:

```powershell
python cli.py approve-cross-club --min-clubs 2
```

## Aşama 3 — Wikipedia kategori botu

Kulüplerin tarihî oyuncu kategorilerini otomatik bul:

```powershell
python cli.py resolve-wikipedia-categories --continue-on-error
```

Yanlış veya bulunamayan kategori elle girilebilir:

```powershell
python cli.py set-wikipedia-category `
  --club arsenal `
  --category "Category:Arsenal F.C. players"
```

İlk denemede her kulüpten 100 sayfa al:

```powershell
python cli.py import-wikipedia `
  --max-pages-per-club 100 `
  --min-year 1990 `
  --continue-on-error
```

Sonuçlar doğru görünüyorsa limit olmadan çalıştır:

```powershell
python cli.py import-wikipedia `
  --min-year 1990 `
  --continue-on-error
```

Bot şu işlemleri yapar:

1. `Category:<Club> players` kategorisinin bütün futbolcu sayfalarını listeler.
2. Sayfaları tek tek değil, toplu API çağrılarıyla indirir.
3. `Infobox football biography` içindeki `years1`, `clubs1`, `years2`, `clubs2` alanlarını ayrıştırır.
4. Ana takım kariyerlerini seçili 190 kulüple eşleştirir.
5. Aynı oyuncuyu Wikidata QID veya Wikipedia page ID ile birleştirir.
6. Ana oyun adını ve tam adı alias tablosuna ekler.
7. Kaynak sayfası, revizyon ID'si ve kanıt güven puanını saklar.
8. Genç takım alanlarını (`youthclubs`) oyun verisine katmaz.

## Aşama 4 — Güncel kadrolar

API-Football takım kimliklerini çöz:

```powershell
python cli.py resolve-api-teams --budget 95
```

Güncel kadroları çek:

```powershell
python cli.py sync-current-squads `
  --budget 95 `
  --continue-on-error
```

Son transferleri tamamla:

```powershell
python cli.py sync-transfers `
  --budget 95 `
  --continue-on-error
```

Ücretsiz kota nedeniyle bu komutlar birkaç güne yayılabilir. Çözülmüş veya daha önce senkronize edilmiş kayıtlar korunur.

## Aşama 5 — Kanıt ve takım çiftleri

```powershell
python cli.py backfill-wikidata-evidence --verify

python cli.py auto-verify-evidence `
  --min-confidence 70 `
  --min-sources 1

python cli.py build-pairs
python cli.py collection-report
python cli.py export --format json --output exports/club_pairs.json
```

`backfill-wikidata-evidence`, kanıtsız kalmış eski Wikidata üyeliklerine
`source_evidence` kaydı yazar. Kanıt, üyelikle birlikte saklanan SPARQL
payload'undan üretilir; internete çıkılmaz ve yeni ilişki uydurulmaz. Kanıt
yazıldığı için bu üyelikler güven modelinde 70 puana ulaşır ve
`auto-verify-evidence` tarafından doğrulanabilir.

Tek komutla temel hattı çalıştırmak için:

```powershell
python cli.py collect-scale `
  --min-year 1990 `
  --continue-on-error
```

`collect-scale`, Wikidata + Wikipedia + varsa API-Football adımlarını çalıştırır. Büyük importta ilk olarak tek tek adımların çalıştırılması daha kolay hata takibi sağlar.

---

# Veritabanındaki yeni kanıt yapısı

## `source_evidence`

Her oyuncu–kulüp ilişkisi için:

- Kaynak adı
- Kanıt türü
- Kaynak URL'si
- Wikipedia revizyon ID'si
- Güven puanı
- Ham kaynak payload'u
- Payload hash'i

saklanır.

Örnek güven puanları:

| Kaynak | Kanıt | Puan |
|---|---|---:|
| API-Football | Güncel kadro | 95 |
| Wikipedia | Kariyer infobox'u | 86 |
| Wikipedia | Kulüp oyuncu kategorisi | 72 |
| Wikidata | P54 takım ilişkisi | 70 |
| Manuel | İnsan tarafından doğrulanmış | 100 |

## `source_snapshots`

Wikipedia sayfasının içeriği ve hash'i saklanır. Kaynak daha sonra değişirse hangi revizyona göre karar verildiği görülebilir.

## `collection_queue`

Binlerce sayfalık işlem ileride cron/worker ile çalıştırılacaksa görevler burada sıraya alınabilir:

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`

V4 ilk sürümünde komut satırı toplama çalışır; tablo, kalıcı worker geliştirmesine hazırdır.

---

# Neden bu sistem 5.000+ oyuncuya çıkar?

190 kulübün her bir tarihî oyuncu kategorisinde onlarca veya yüzlerce futbolcu bulunur. Aynı oyuncular QID/page ID üzerinden birleştirildiğinden tekrar kayıt oluşmaz. Wikipedia kategorileri geniş tarihî keşif sağlarken, infobox kariyerleri oyuncunun diğer seçili takımlarını da aynı işlemde ortaya çıkarır.

Kesin sayı kaynak kapsamına bağlıdır. Sistem 5.000 hedefini garanti etmek için sahte veri oluşturmaz; gerçek import sonunda `collection-report` ile sayı ölçülür.

```powershell
python cli.py collection-report
```

Rapor şunları verir:

- Toplam oyuncu
- Doğrulanmış oyuncu
- Toplam üyelik
- Kaynak bazında oyuncu sayısı
- Oynanabilir takım çifti
- En az üç cevabı olan güçlü çiftler
- Wikipedia kategorisi bulunamayan kulüpler

---

# Güncellik planı

Önerilen otomasyon:

```text
Her gece:
- API-Football güncel kadro ve transfer senkronizasyonu

Haftada bir:
- Wikidata importu
- Wikipedia kategorilerindeki yeni sayfaları kontrol
- Takım çiftlerini yeniden üret

Transfer dönemlerinde:
- Günde birden fazla kontrollü sync
- Gerekirse manual_overrides.json
```

Kaynaklar değiştiğinde eski üyelikler silinmez. Güncel kadrodan çıkan oyuncu tarihî kayıt olarak korunur.

---

# Veri doğrulama ilkeleri

- Doğru cevaplar mobil uygulamaya gömülmez.
- Fuzzy isim eşleşmesi yapılmaz.
- Büyük/küçük harf, aksan ve Türkçe karakter normalleştirilir.
- Eksik/fazla/yanlış harf kabul edilmez.
- Wikipedia kategori üyeliği ve infobox kariyeri ayrı kanıt olarak saklanır.
- Çelişen veya eşleşmeyen kulüp isimleri otomatik olarak yanlış kulübe bağlanmaz.
- Transfermarkt veya kullanım koşulları otomatik erişime izin vermeyen kaynaklardan botla veri çekilmez.

---

# Testler

```powershell
pytest -q
```

V4 testleri şunları kapsar:

- İsim normalizasyonu
- Takım çifti oluşturma
- Uğurcan Çakır doğrulaması
- Wikipedia futbolcu infobox ayrıştırma
- Wikipedia kategori importu
- Aynı oyuncunun QID ile birleştirilmesi
- Tam isim alias doğrulaması

---

# Dosyalar

```text
src/wikidata.py       Wikidata istemcisi
src/wikipedia.py      Wikipedia Action API ve infobox parser
src/api_football.py   Güncel kadro/transfer istemcisi
src/collector.py      Çok kaynaklı toplama ve kanıt sistemi
src/current_sync.py   Güncel kadro senkronizasyonu
src/db.py             SQLite şeması ve migration
cli.py                Bütün komutlar
config/clubs.json     190 kulüp
config/manual_overrides.json
exports/collection_report.json
```
