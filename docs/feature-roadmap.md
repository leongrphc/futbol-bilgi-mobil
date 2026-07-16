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
| C2 | Abandon cancel cooldown 45s (kupa yok) | MatchQueue + lobby UI |
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

## Asla (MVP / adalet)

- Serbest sohbet, spectator, pay-for-answer, reveal-all-names IAP, ranked bot, ping compensation
