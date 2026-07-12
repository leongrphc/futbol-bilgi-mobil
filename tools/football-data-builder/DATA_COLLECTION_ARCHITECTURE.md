# Football Link — Ölçeklenebilir Oyuncu Veri Toplama Mimarisi

## Karar

Rastgele web scraping botu yerine kaynak adaptörlerinden oluşan bir ETL sistemi kullanılacaktır.

```text
Discover → Fetch → Parse → Resolve Entity → Store Evidence → Verify → Build Pairs → Export
```

## Kaynak adaptörleri

### WikidataAdapter

- Kulüp QID çözümü
- `P54` takım üyelikleri
- Başlangıç/bitiş tarihleri
- Oyuncu QID ve alias'ları

### WikipediaCategoryAdapter

- Kulüp oyuncu kategorisinden tarihî sayfa keşfi
- Sayfa içeriklerini toplu Action API çağrılarıyla alma
- Futbolcu infobox kariyerini ayrıştırma
- Revizyon ve kaynak URL'si saklama

### ApiFootballAdapter

- Güncel A takım kadrosu
- Son transfer ilişkileri
- Günlük istek bütçesi ve devam edebilme

### ManualOverrideAdapter

- Kaynaklara henüz düşmeyen doğrulanmış transferler
- Yanlış isim/alias düzeltmeleri

## Entity resolution

Bir oyuncu aşağıdaki öncelikle birleştirilir:

1. Wikidata QID
2. API-Football player ID
3. Wikipedia page ID
4. Normalize edilmiş tam ad + tek aday kontrolü
5. Belirsizse yeni kayıt ve inceleme kuyruğu

Sadece isim benzerliğiyle otomatik birleştirme yapılmaz.

## Kulüp eşleştirme

Wikipedia kariyer alanlarında kulüp eşleştirme sırası:

1. Wiki link başlığı ↔ `clubs.wikipedia_title`
2. Kulüp ana adı
3. `wikidata_search`
4. `api_football_search`
5. Normalize edilmiş ve FC/CF/AFC gibi ekleri çıkarılmış tam eşleşme

Bir alan birden fazla kulübe eşleşiyorsa otomatik kayıt yapılmaz.

## Güven modeli

```text
100 Manuel doğrulanmış
95  Güncel API kadrosu
90  Resmî kulüp/federasyon kanıtı (gelecekte)
86  Wikipedia kariyer infobox'u
72  Wikipedia oyuncu kategorisi
70  Wikidata P54 ilişkisi
<70 İnceleme gerekli
```

## Worker tasarımı

Gelecekte komut satırı yerine sürekli worker kullanılabilir:

```text
Scheduler
  ├── discover_club_players
  ├── fetch_player_pages
  ├── sync_current_squad
  ├── sync_transfers
  ├── resolve_entities
  ├── verify_evidence
  └── rebuild_pairs
```

Her görev `collection_queue` tablosunda idempotent tutulur. Hatalar exponential backoff ile yeniden denenir.

## Veri kaybını engelleme

- Yeni import önce staging'e yazılır.
- Eski doğrulanmış üyelik doğrudan silinmez.
- Kaynakta artık görünmeyen güncel oyuncu `is_current=0` olur.
- Her snapshot hash ve revizyonla saklanır.
- Takım çiftleri yalnızca doğrulanmış üyeliklerden üretilir.

## Lisans ve erişim sınırı

- Wikidata yapılandırılmış verileri temel açık veri kaynağıdır.
- Wikipedia, resmî Action API ile alınır; kaynak/revizyon bilgisi saklanır ve gerekli atıf sağlanır.
- Transfermarkt'ın otomatik bot/scraping yasağı nedeniyle adaptör yazılmaz.
- TheSportsDB ücretsiz katmanı market yayını için ana production kaynağı yapılmaz.
