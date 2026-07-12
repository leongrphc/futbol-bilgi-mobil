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
| A1 | Tutorial bot path | ✅ Lobby + bot MCQ |
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

## Phase 5 — Meta / diff (kodlandı — blitz hariç)

| ID | Özellik | Durum |
|---|---|---|
| D2 | Club mastery | `club_mastery` + competition UI |
| C6 | Opponent card | READY phase cards (trophies + form) |
| C8 | Weekly theme banner | lobby `weekly_theme()` (display only) |
| G1 | Blitz mode | ✅ ayrı kuyruk + `blitz_trophies` (+15/−5), 8s / first-to-2 |
| — | Ranked clarity | ✅ Lobby DERECELİ / BLITZ / DERECESİZ; Lig blitz merdiveni; finish kupa delta |

## Asla (MVP / adalet)

- Serbest sohbet, spectator, pay-for-answer, reveal-all-names IAP, ranked bot, ping compensation
