# Feature roadmap

Kaynak brainstorm + PRD hizası. P0 ship (iki cihaz smoke, AAB) paralel izlenir; bu dosya ürün özellik fazlarıdır.

## Phase 1 — Sticky (kodlandı + prod migration)

| ID | Özellik | Durum |
|---|---|---|
| D1 | Player album (doğru cevap → kart) | Migration + `/album` + lobby CTA |
| D4 | Daily quests (3 görev, UTC gün) | Migration + lobby kart |
| C5 | Match share (metin) | FINISHED ekranı Share |

Kurallar: bot maçları album/quest yazmaz; cevap listesi istemciye gitmez; claim ekonomisi yok (sadece işaret).

## Phase 2 — Spectacle (kodlandı, client-only)

| ID | Özellik | Durum |
|---|---|---|
| B7 | Sudden-death stinger + SD strip/badge | `SUDDEN_DEATH_STARTED` UI |
| — | Commentator one-liners | reveal reason/margin’e bağlı |
| C5+ | Share card preview + zengin metin | image capture yok (sonra) |

## Phase 3 — Always something

| ID | Özellik | Durum |
|---|---|---|
| G3 | Solo daily board | ❌ kaldırıldı (web aramayla kolay hile) |
| A1 | Zorunlu ilk giriş tutorial bot path | ✅ İlk girişte doğrudan bot MCQ; bitiş profilde tek seferlik saklanır |
| E1 | Light difficulty tiers | ❌ solo ile gitti |

Eğitim: bot/tutorial 3 şıklı cevap.

## Phase 4 — Fairness (kodlandı — Worker deploy gerekir)

| ID | Özellik | Durum |
|---|---|---|
| C1 | Cup-band ±50 → ±100 → global (wait-based) | MatchQueue |
| C2 | İlk 9 kuyruk iptali ücretsiz; 10 dakikada 10. iptale 45s cooldown | ✅ MatchQueue Durable state + production smoke |
| C4 | Coarse region TR/EU preference | client locale → queue |
| F6 | Answer paste soft-block | match answer field |

Trophy lookup server-side from `profiles`; client cannot spoof cups.

## Phase 5 — Üç rekabetçi tempo (kodlandı — deploy gerekir)

| ID | Özellik | Durum |
|---|---|---|
| D2 | Club mastery | `club_mastery` + competition UI |
| C6 | Opponent card | READY phase cards (trophies + form) |
| C8 | Weekly theme banner | lobby `weekly_theme()` (display only) |
| G0 | Quick Match | ✅ 4 zor şık, 15 sn, ilk 3; ayrı Quick kupası (+20/−8) ve ladder |
| G1 | Blitz | ✅ 4 zor şık, 8 sn, ilk 2; ayrı `blitz_trophies` (+15/−5) ve ladder |
| G2 | Ranked | ✅ yazılı exact-match, 20 sn, ilk 3; ayrı `ranked_trophies` (+25/−15) ve ladder |
| G3 | Ranked unlock | ✅ 5 tamamlanmış Quick maç; UI + Worker/RPC enforcement |
| — | Üç mod kimliği | ✅ Lobby'de üç ayrı kart; Lig ekranında QUICK / BLITZ / RANKED sekmeleri |

## Phase 6 — Match reacts (kodlandı)

| ID | Özellik | Durum |
|---|---|---|
| D1 | Free 4 match emoji + toggle tray | ✅ maç UI `MatchReactBar` |
| D1+ | Premium emojiler mağaza | ✅ `EMOTE` kind + `cosmetics_purchase` soft unlock |
| — | Server ownership check | ✅ free allowlist + `player_owns_emote` |

Kurallar: serbest metin chat yok; canned text + emoji only; 1.5s cooldown; premium ownership server-side.

## Phase 7 — Event Week (kodlandı)

| ID | Özellik | Durum |
|---|---|---|
| E1 | Admin draft / go-live / end | ✅ control room + RPCs |
| E2 | Tek lig filtresi (tüm kulüpler o ligden) | ✅ bootstrap + pick_pair `league_filter` |
| E3 | Ayrı event kuyruk, kupa yok | ✅ `/event-match` + mode `EVENT` |
| E4 | Lobby empty / live kart | ✅ `event_current()` |

Kurallar: classic/blitz kupa dokunulmaz; aynı anda tek LIVE; süre admin start/end.

## Phase 8 — Audio polish (kodlandı, placeholder clip)

| ID | Özellik | Durum |
|---|---|---|
| A1 | Match UI SFX (correct/wrong/tick/SD/finish/emote) | ✅ `expo-audio` + `src/audio` |
| A2 | SFX / lobby music mute (AsyncStorage) | ✅ hesap menüsü toggle |
| A3 | Lobby loop music | ✅ soft pad, focus start / blur stop |

Kurallar: müzik maça girince kesilir; SFX mute haptic’i bozmaz; clip’ler placeholder WAV — prod asset sonra.

## Phase 9 — Başarımlar ve profil vitrini (backend production'da)

| ID | Özellik | Durum |
|---|---|---|
| H1 | Altı sunucu hesaplı başarım | ✅ Son Saniye, Gezgin, Yenilmez, Derbi Uzmanı, Geri Dönüş, Kusursuz Maç |
| H2 | Üç yuvalı profil vitrini | ✅ Kazanılmış başarım FK + authenticated RPC |
| H3 | Rakip kartında vitrin | ✅ READY aşamasında yalnızca seçilmiş rozetler |
| H4 | TR/EN başarım ekranı | ✅ İlerleme, unvan ve askılı dolap vitrini |

Kurallar: bot ve arkadaş maçları ilerleme yazmaz; istemci başarım ilerlemesi yazamaz; ödüller yalnızca unvan/rozet kimliğidir; cevap ve alias verisi açılmaz.

Production doğrulama: `20260718122859_achievements_profile_showcase.sql` uygulandı; 6 başarım, 8 derbi çifti, RLS/izin matrisi, authenticated okuma, vitrin yazma ve maç değerlendirme RPC zinciri rollback'li canlı smoke testini geçti. Worker production'a dağıtıldı; imzalı biletle üç turluk bot maçı ve bağlantı kesilip devam etme smoke testleri geçti. Mobil release ve iki cihaz görsel smoke testi bekliyor.

## Phase 10 — Oyuncu kariyer profili (backend production'da)

| ID | Özellik | Durum |
|---|---|---|
| P1 | Lobi oyuncu adından profil erişimi | ✅ İsim profile, üç nokta hesap menüsüne gider |
| P2 | Rekabetçi kariyer özeti | ✅ Maç, G/M, kazanma oranı, cevap ve tur doğruluğu |
| P3 | Form, seri ve mod karnesi | ✅ Son 10 form, güncel/en iyi seri, Quick/Blitz/Ranked/Event dökümü |
| P4 | Kişisel rekor ve futbol hafızası | ✅ Son saniye, tek fark, gol yemeden galibiyet, albüm ve kulüp ustalığı |
| P5 | Başarım vitrini entegrasyonu | ✅ Profil özeti ve mevcut vitrin düzenleme ekranına geçiş |

İstatistikler tek authenticated RPC çağrısında, yalnızca `auth.uid()` sahibine ait sunucu kayıtlarından hesaplanır. Ham cevap ve alias verisi döndürülmez. `20260718191941_player_profile_stats.sql` production'a uygulandı ve migration geçmişine işlendi; gerçek authenticated kullanıcıyla canlı RPC smoke testi geçti. Mobil release ve cihaz görsel smoke testi bekliyor.

## Phase 11 — Detaylı maç tutanağı (yerelde kodlandı)

| ID | Özellik | Durum |
|---|---|---|
| M1 | Son Maçlar'dan açılan skor/rakip/mod özeti | ✅ Mobil akış + TR/EN |
| M2 | Tur bazlı kulüp çifti ve puan akışı | ✅ Normal + ani ölüm tutanağı |
| M3 | İki taraf için cevap verdi/doğru/son saniye durumu | ✅ Ham cevap metni açılmaz |
| M4 | Geçmiş turdan Sonucu Bildir | ✅ Katılımcı doğrulamalı yazma + admin inceleme bağlamı |
| M5 | Eski/eksik ve 50+ turlu maç dayanıklılığı | ✅ Boş/kısmi durum + parser testleri |

Özet okuma, exposed şema dışında çalışan `SECURITY DEFINER` implementasyonu ve authenticated `SECURITY INVOKER` wrapper üzerinden yapılır. Yalnız bitmiş maçın iki katılımcısı erişebilir; yetkisiz ve bulunamayan maç aynı genel hatayı verir. `submissions` için istemci politikası açılmaz. Sonuç bildiriminin maç/tur, kulüp çifti, raporlayanın cevabı ve yeniden doğrulama bağlamı ayrı bir service-role RPC ile yalnız admin sunucusuna açılır; accepted alias listesi sözleşmeye girmez. Yeni tablo veya bağımlılık eklenmez. `20260726093404_competition_match_summary.sql` production'a uygulandı; iki hesaplı erişim ve cihaz smoke testi bekliyor.

## Phase 12 — Haftalık Arkadaş Ligi (yerelde kodlandı)

| ID | Özellik | Durum |
|---|---|---|
| L1 | Arkadaşlar sekmesinde haftalık lig kartı | ✅ Sıra, G/M ve haftalık kupa farkı; kendi satırı vurgulu |
| L2 | Sunucu hesaplı haftalık delta | ✅ `matches.trophy_delta_*` toplamı; QUICK/BLITZ/RANKED, pazartesi (UTC) sıfırlanır |
| L3 | Satırdan rakip profil kartına geçiş | ✅ `player-card` yönlendirmesi |
| L4 | Boş/hata durumları | ✅ Arkadaşsız boş mesaj, yüklenemezse dokunarak yeniden dene |

Kurallar: yalnız çağıran + ACCEPTED arkadaşlar döner; EVENT ve arkadaş maçı sayılmaz; yalnız toplamlar döner (cevap/maç kimliği açılmaz); istemci yazamaz. `20260726114500_friends_weekly_league.sql` production'a uygulandı ve gerçek hesapla canlı RPC smoke testi geçti; cihaz görsel smoke testi bekliyor.

## Phase 13 — Engagement paketi (production'da)

| ID | Özellik | Durum |
|---|---|---|
| K1 | Günlük giriş serisi | ✅ 7 günlük coin döngüsü (10→60), lobi kartı, UTC gün, ledger `LOGIN_STREAK` |
| K2 | Haftalık lig şampiyon ödülü | ✅ Geçen haftanın 1.'sine +100 coin; `weekly_league_claims` + Friends kartı |
| K3 | H2H rakip kartı | ✅ READY kartı ve oyuncu profili "Aranızda X-Y"; yalnız toplam W/L |
| K4 | Kulüp ustalığı seviyeleri | ✅ 10/25/60 doğru → Bronz/Gümüş/Altın; profilde ilerleme çubuğu |
| K5 | Albüm lig koleksiyonları | ✅ 6 lig hedefi, contract join'li ilerleme, `ALBUM_COLLECTION` ödülü |
| K6 | Sistem push tetikleri | ✅ 17:00 UTC seri hatırlatması + Pazartesi 09:00 şampiyon hatırlatması; Worker cron + idempotent enqueue RPC |
| K7 | Arkadaş turnuvası | ✅ 4 kişilik bracket; FRIEND odaları, `match_persist_finish` hook'u, şampiyona +150 coin, TOURNAMENT_INVITE bildirimi |

Kurallar: bütün ödüller wallet ledger'dan geçer (unique player/reason/reference); istemci streak/claim/bracket tablolarına yazamaz; bracket oda anahtarı yalnız o maçın iki katılımcısına döner; turnuva maçları FRIEND modudur, kupa etkilemez. Migration'lar (`20260726150000`–`20260726154500`) production'da; rollback'li canlı RPC smoke zinciri geçti. Cihaz görsel smoke testi bekliyor.

## Asla (MVP / adalet)

- Serbest sohbet, spectator, pay-for-answer, reveal-all-names IAP, ranked bot, ping compensation
