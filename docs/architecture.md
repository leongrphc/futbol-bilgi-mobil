# Dikey prototip mimarisi

Mobil istemci yalnızca komut yollar ve sunucu olaylarını render eder. Durable Object tek maç odasının otoritesidir; event sırası, sunucu deadline'ı, tek submission ve skor burada belirlenir. Saf `game-engine` UI/transport bağımlılığı taşımaz.

Production futbol verisi sürümlüdür. Match oluşturulurken aktif sürüm `matches.football_data_version_id` alanına sabitlenir. Pair kimliği sıralı UUID biçimindedir. Cevap doğrulama normalized exact-match ve kabul edilmiş alias üzerinden yapılır; fuzzy eşleşme yoktur.

JSON yalnızca yayın girdisidir. Legacy builder export'unda üyelik ve alias ayrıntıları bulunmadığı için importer ana oyun adını kabul edilmiş alias olarak ekler ve pair üyeliğini export'tan kurar. Builder SQLite veritabanı mobil build graph'ının dışındadır.

Uygulama sırası: veri/çekirdek → development dikey dilim → auth ve kalıcılık → arkadaş odası → Hızlı Maç → reconnect sertleştirmesi → sonraki admin/sosyal/gelir katmanları.

Mobil kimlik Supabase Auth oturumundan gelir; maç sunucusuna giden `playerId`, profilin `auth.users.id` ile aynı UUID değeridir. Yeni auth kullanıcısı veritabanı trigger'ıyla benzersiz kısa oyuncu koduna sahip `profiles` kaydını otomatik alır. E-posta ve OAuth dönüşleri `footballlink://auth/callback` deep link'ini kullanır.

WebSocket bağlantısı doğrudan oyuncu kimliği kabul etmez. Mobil istemci Supabase access token ile Worker'ın `/match-token` endpoint'ine başvurur. Worker Supabase JWKS üzerinden oturumu doğrular ve kullanıcı UUID'si ile tek bir maç kimliğine bağlı, 60 saniyelik HMAC bilet üretir. Durable Object bileti yeniden doğrular ve oyuncu kimliğini yalnızca biletin `sub` alanından alır.
