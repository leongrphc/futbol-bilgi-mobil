# Football Link MVP

PRD v1.1'i kaynak kabul eden iki oyunculu gerçek zamanlı dikey prototip. Doğru cevaplar yalnızca match server/Supabase tarafındadır; mobil pakete SQLite, JSON cevap listesi veya alias listesi eklenmez.

## Mimari

- `apps/mobile`: Expo Router + TypeScript development istemcisi
- `apps/admin`: sonraki aşama için ayrılmış yönetim uygulaması
- `services/match-server`: Cloudflare Durable Object ve WebSocket otoritesi
- `packages/game-engine`: UI ve Cloudflare'dan bağımsız deterministik maç kuralları
- `packages/answer-normalizer`: strict exact-match normalizasyonu
- `packages/shared`: protokol ve ortak tipler
- `tools/football-data-builder`: V4 Python/SQLite builder ve doğrulanmış üretim verisi
- `tools/data-import`: legacy ve sürümlü JSON'u atomik Supabase RPC ile yayınlar
- `supabase/migrations`: PostgreSQL şeması, RLS ve atomik yayın RPC'si

Detaylı kararlar: [docs/architecture.md](docs/architecture.md). Kesin ürün gereksinimi: [football_link_mvp_prd_v1.1.md](football_link_mvp_prd_v1.1.md). Güncel tamamlanma matrisi: [docs/implementation-status.md](docs/implementation-status.md).

## Kurulum ve test

```bash
pnpm install
pnpm test
pnpm typecheck
cd tools/football-data-builder
python -m pip install -r requirements.txt
python -m pytest
```

Supabase CLI ile `supabase start` ve `supabase db reset` çalıştırarak migration'ları uygulayın.

## İki oyunculu development akışı

1. Supabase migration'larını, özellikle `202607110007_auth_profiles.sql` dosyasını uygulayın. Authentication URL ayarlarına `footballlink://auth/callback` ekleyin; Google ve Apple kullanacaksanız ilgili provider anahtarlarını Dashboard'da tanımlayın.
2. `services/match-server/.dev.vars.example` dosyasını `.dev.vars` olarak kopyalayın. Supabase Dashboard → Project Settings → API Keys altındaki `service_role` değerini yalnızca bu Git-ignored dosyaya yazın.
3. `pnpm dev:match` çalıştırın.
4. `apps/mobile/.env.example` dosyasını `.env` olarak kopyalayın. Fiziksel cihazda `localhost` yerine bilgisayarın LAN IP adresini kullanın.
5. `pnpm dev:mobile` çalıştırın ve iki cihazda farklı gerçek hesaplarla giriş yapıp aynı `dev-room` odasına girin.
6. İki istemcide Hazırım → gizli takım seçimi → Onayla → 3–2–1 → cevap → reveal/skor akışını izleyin.

Production Worker: `wss://football-link-match-server.franklimewood.workers.dev`. Mobil `.env` varsayılan olarak bu adrese bağlıdır. Yerel geliştirme için URL'yi tekrar `ws://localhost:8787` yapın.

Production canlı smoke testi:

```powershell
$env:MATCH_URL='wss://football-link-match-server.franklimewood.workers.dev'
node services/match-server/test/live-smoke.mjs
```

Takım havuzu ve cevap doğrulaması production Supabase RPC'lerinden gelir. Worker her maçta aktif `football_data_version_id` değerini sabitler; doğru cevap veya alias listesi istemciye gönderilmez. Durable Object state'i SQLite storage'a kaydeder ve hibernation sonrasında aynı veri sürümüyle geri yükler.

## Futbol verisi yayınlama

Mevcut V4 üretim verisi 131 kulüp, 59.712 oyuncu, 186.218 oyuncu-kulüp
üyeliği ve 7.326 oynanabilir kulüp çifti içerir. Oyun sunucusuna aktarılacak
schema v2 çıktısı `tools/football-data-builder/exports/club_pairs.json` dosyasıdır;
SQLite veya cevap listeleri mobil uygulamaya eklenmez.

Service-role anahtarı yalnızca güvenli sunucu ortamında kullanılmalıdır:

```bash
pnpm data:import -- --file ./tools/football-data-builder/exports/club_pairs.json --version 2026.07.12.1
```

Importer SHA-256 hash tutar. Aynı başarılı export tekrar yayınlanırsa mevcut sürümü döndürür. Yayın RPC'si tek transaction'dır; hata halinde yeni sürüm ACTIVE yapılmaz. Legacy kök-dizi export geriye uyumlu dönüştürülür.

## Güvenlik sınırı

- Expo'da yalnızca public URL/anon ayarları bulunur; service-role bulunmaz.
- Alias, contract ve pair tablolarında authenticated client SELECT politikası yoktur.
- Cevap, sıra, deadline, skor ve phase yalnızca Durable Object tarafından belirlenir.
- Reconnect snapshot'ı seçim aşamasında rakip seçimini içermez.

## İlk teslimatta açık kalanlar

- İmzalı WebSocket token doğrulaması
- İki oyuncunun aynı anda bağlantı kaybetmesi için ek sertleştirme
- İki cihazlı Worker persistence smoke testi ve korelasyon logları
- Hızlı Maç, arkadaş daveti cihaz smoke testi ve rövanş akışı
- Admin UI, reklam, mağaza, kupa ve sosyal özellikler

Sonraki işler [docs/next-tasks.md](docs/next-tasks.md) dosyasındadır.
