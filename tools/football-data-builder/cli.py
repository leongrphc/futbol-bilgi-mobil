from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from src.db import connect, init_db, rebuild_pairs, rebuild_pair_stats, seed_clubs
from src.api_football import ApiFootballClient
from src.current_sync import (
    apply_manual_overrides,
    freshness_report,
    resolve_api_club,
    sync_current_squad,
    sync_team_transfers,
)
from src.normalize import normalize_name
from src.service import (
    approve_cross_club_candidates,
    import_club,
    quality_report,
    resolve_club,
)
from src.validate import validate_answer
from src.wikidata import WikidataClient
from src.wikipedia import WikipediaClient
from src.collector import (
    auto_verify_by_evidence,
    backfill_wikidata_evidence,
    collection_report,
    import_wikipedia_club_category,
    resolve_wikipedia_category,
)

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "data" / "football.db"
DEFAULT_CLUBS = ROOT / "config" / "clubs.json"
DEFAULT_SETTINGS = ROOT / "config" / "settings.json"
DEFAULT_DEMO = ROOT / "sample" / "seed_demo.json"
DEFAULT_OVERRIDES = ROOT / "config" / "manual_overrides.json"


def db_path(value: str | None) -> Path:
    return Path(value or os.getenv("FOOTBALL_DB_PATH", DEFAULT_DB))


def load_settings(path: str | Path) -> dict[str, Any]:
    settings_path = Path(path)
    if not settings_path.exists():
        return {}
    return json.loads(settings_path.read_text(encoding="utf-8"))


def get_client() -> WikidataClient:
    user_agent = os.getenv("WIKIDATA_USER_AGENT", "")
    return WikidataClient(user_agent=user_agent)


def get_api_client() -> ApiFootballClient:
    return ApiFootballClient(api_key=os.getenv("API_FOOTBALL_KEY", ""))


def get_wikipedia_client() -> WikipediaClient:
    user_agent = os.getenv("WIKIPEDIA_USER_AGENT") or os.getenv("WIKIDATA_USER_AGENT", "")
    language = os.getenv("WIKIPEDIA_LANGUAGE", "en")
    return WikipediaClient(user_agent=user_agent, language=language)


def select_clubs(conn: sqlite3.Connection, slugs: list[str] | None, priority: int | None = None):
    query = "SELECT * FROM clubs WHERE active=1"
    params: list[Any] = []
    if slugs:
        marks = ",".join("?" for _ in slugs)
        query += f" AND slug IN ({marks})"
        params.extend(slugs)
    if priority is not None:
        query += " AND priority <= ?"
        params.append(priority)
    query += " ORDER BY priority, league, name"
    return conn.execute(query, params).fetchall()


def command_init(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    count = seed_clubs(conn, args.clubs)
    rebuild_pair_stats(conn)
    print(f"Veritabanı hazır. {count} kulüp eklendi/güncellendi.")


def _delete_demo_data(conn: sqlite3.Connection) -> None:
    demo_ids = [
        int(row[0])
        for row in conn.execute("SELECT id FROM players WHERE wikidata_qid LIKE 'DEMO-%'")
    ]
    if demo_ids:
        marks = ",".join("?" for _ in demo_ids)
        conn.execute(f"DELETE FROM players WHERE id IN ({marks})", demo_ids)
        conn.commit()


def command_seed_demo(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    if args.fresh:
        _delete_demo_data(conn)

    data = json.loads(Path(args.file).read_text(encoding="utf-8"))
    club_map = {row["slug"]: row["id"] for row in conn.execute("SELECT id, slug FROM clubs")}
    missing_clubs: set[str] = set()
    for entry in data:
        for club_slug in entry["clubs"]:
            if club_slug not in club_map:
                missing_clubs.add(club_slug)
    if missing_clubs:
        raise RuntimeError(f"Demo veride config içinde olmayan kulüpler var: {sorted(missing_clubs)}")

    for entry in data:
        name = entry["name"]
        normalized = normalize_name(name)
        conn.execute(
            """
            INSERT INTO players(wikidata_qid, game_name, normalized_name, status)
            VALUES (?, ?, ?, 'VERIFIED')
            ON CONFLICT(wikidata_qid) DO UPDATE SET
              game_name=excluded.game_name,
              normalized_name=excluded.normalized_name,
              status='VERIFIED',
              updated_at=CURRENT_TIMESTAMP
            """,
            (entry["qid"], name, normalized),
        )
        player_id = conn.execute(
            "SELECT id FROM players WHERE wikidata_qid=?", (entry["qid"],)
        ).fetchone()[0]
        for alias in entry.get("aliases", []):
            conn.execute(
                """
                INSERT INTO player_aliases
                (player_id, alias, normalized_alias, accepted, source)
                VALUES (?, ?, ?, 1, 'DEMO')
                ON CONFLICT(player_id, normalized_alias) DO UPDATE SET
                    alias=excluded.alias,
                    accepted=1,
                    source='DEMO'
                """,
                (player_id, alias, normalize_name(alias)),
            )
        for club_slug in entry["clubs"]:
            conn.execute(
                """
                INSERT INTO memberships
                (player_id, club_id, membership_type, squad_level, source, status)
                VALUES (?, ?, 'PERMANENT_OR_LOAN', 'FIRST_TEAM', 'DEMO', 'VERIFIED')
                ON CONFLICT DO NOTHING
                """,
                (player_id, club_map[club_slug]),
            )
    conn.commit()
    pair_count = rebuild_pairs(conn)
    print(
        f"Demo veri yüklendi. {len(data)} oyuncu, "
        f"{pair_count} takım-çifti/oyuncu bağlantısı."
    )


def command_resolve_clubs(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    client = get_client()
    clubs = select_clubs(conn, args.club, args.priority)
    resolved = 0
    review = 0
    for club in clubs:
        print(f"Çözülüyor: {club['name']} — arama: {club['wikidata_search']}")
        try:
            result = resolve_club(conn, client, int(club["id"]), force=args.force)
            if result["status"] in {"RESOLVED", "ALREADY_RESOLVED"}:
                resolved += 1
                print(f"  {result['status']}: {result['qid']}")
            else:
                review += 1
                print("  Otomatik seçim yapılmadı. Adaylar:")
                for candidate in result.get("candidates", [])[:5]:
                    print(
                        f"   - {candidate['qid']} | {candidate['label']} | "
                        f"puan={candidate['score']} | {candidate['description']}"
                    )
        except Exception as exc:
            review += 1
            print(f"  HATA: {exc}")
            if not getattr(args, "continue_on_error", False):
                raise
    print(f"Tamamlandı. Çözülmüş: {resolved}, manuel kontrol: {review}")


def command_set_club_qid(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    club = conn.execute("SELECT * FROM clubs WHERE slug=?", (args.club,)).fetchone()
    if club is None:
        raise RuntimeError(f"Kulüp bulunamadı: {args.club}")
    conn.execute(
        """
        UPDATE clubs SET wikidata_qid=?, qid_status='RESOLVED', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (args.qid.upper(), club["id"]),
    )
    conn.commit()
    print(f"{club['name']} için Wikidata QID kaydedildi: {args.qid.upper()}")


def command_import(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    settings = load_settings(args.settings)
    client = get_client()
    min_year = args.min_year if args.min_year is not None else settings.get("min_membership_year", 1990)
    page_size = int(settings.get("wikidata_page_size", 300))
    auto_alias = bool(settings.get("auto_accept_wikidata_aliases", False))

    clubs = select_clubs(conn, args.club, args.priority)
    unresolved = [club["slug"] for club in clubs if not club["wikidata_qid"]]
    if unresolved:
        print(
            "Uyarı: QID bulunmayan kulüpler atlanacak. Önce `resolve-clubs` çalıştırın: "
            + ", ".join(unresolved)
        )

    total_imported = 0
    total_skipped = 0
    failures: list[str] = []
    for club in clubs:
        if not club["wikidata_qid"]:
            continue
        print(f"İçe aktarılıyor: {club['name']} ({club['wikidata_qid']})")
        try:
            result = import_club(
                conn,
                client,
                int(club["id"]),
                str(club["wikidata_qid"]),
                min_year=min_year,
                page_size=page_size,
                auto_accept_aliases=auto_alias,
            )
            total_imported += result["imported"]
            total_skipped += result["skipped"]
            print(f"  {result['imported']} aday işlendi, {result['skipped']} kayıt atlandı.")
        except Exception as exc:
            failures.append(f"{club['slug']}: {exc}")
            print(f"  HATA: {exc}")
            if not args.continue_on_error:
                raise
    print(
        f"İçe aktarma tamamlandı. İşlenen: {total_imported}, "
        f"atlanan: {total_skipped}, hata: {len(failures)}"
    )
    if failures:
        for failure in failures:
            print(f"- {failure}")



def command_apply_overrides(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    result = apply_manual_overrides(conn, args.file)
    pair_count = rebuild_pairs(conn)
    print(
        f"Manuel düzeltmeler uygulandı: {result['players']} oyuncu, "
        f"{result['memberships']} üyelik. Ortak oyuncu matrisi: {pair_count}."
    )


def command_resolve_api_teams(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    client = get_api_client()
    clubs = select_clubs(conn, args.club, args.priority)
    resolved = 0
    review = 0
    budget = max(1, int(args.budget))
    for club in clubs:
        if client.requests_used >= budget:
            print(f"İstek bütçesi doldu ({budget}). Kalan kulüpler sonraki çalıştırmada devam eder.")
            break
        print(f"API-Football takım ID çözülüyor: {club['name']}")
        result = resolve_api_club(conn, client, int(club["id"]), force=args.force)
        if result["status"] in {"RESOLVED", "ALREADY_RESOLVED"}:
            resolved += 1
            print(f"  {result['status']}: {result['api_football_id']}")
        else:
            review += 1
            print("  Otomatik seçim yapılmadı.")
            for candidate in result.get("candidates", [])[:5]:
                print(f"   - {candidate['id']} | {candidate['name']} | {candidate.get('country')}")
    print(
        f"Tamamlandı. Çözülmüş: {resolved}, manuel kontrol: {review}, "
        f"API isteği: {client.requests_used}."
    )


def command_set_api_team_id(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    club = conn.execute("SELECT * FROM clubs WHERE slug=?", (args.club,)).fetchone()
    if club is None:
        raise RuntimeError(f"Kulüp bulunamadı: {args.club}")
    conn.execute(
        """
        UPDATE clubs SET api_football_id=?, api_id_status='RESOLVED',
                         updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (args.api_id, club["id"]),
    )
    conn.commit()
    print(f"{club['name']} için API-Football ID kaydedildi: {args.api_id}")


def _api_sync_clubs(args: argparse.Namespace):
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    clubs = list(select_clubs(conn, args.club, args.priority))
    if getattr(args, "pool", None):
        clubs = [club for club in clubs if club["pool"] == args.pool]
    return conn, clubs


def command_sync_current_squads(args: argparse.Namespace) -> None:
    conn, clubs = _api_sync_clubs(args)
    last_squad_sync = {
        int(row["club_id"]): row["finished_at"]
        for row in conn.execute(
            """SELECT club_id, MAX(finished_at) finished_at FROM import_runs
               WHERE source='API_FOOTBALL_SQUAD' AND status='COMPLETED'
               GROUP BY club_id"""
        )
    }
    clubs.sort(key=lambda club: (int(club["id"]) in last_squad_sync, last_squad_sync.get(int(club["id"])) or "", club["priority"], club["name"]))
    client = get_api_client()
    budget = max(1, int(args.budget))
    total = 0
    failures: list[str] = []
    for club in clubs:
        if client.requests_used >= budget:
            print(f"İstek bütçesi doldu ({budget}). Komutu tekrar çalıştırarak devam edin.")
            break
        if not club["api_football_id"]:
            print(f"Atlandı (API ID yok): {club['name']}")
            continue
        print(f"Güncel kadro: {club['name']} ({club['api_football_id']})")
        try:
            result = sync_current_squad(
                conn, client, int(club["id"]), int(club["api_football_id"])
            )
            total += result["imported"]
            print(f"  {result['imported']} güncel oyuncu işlendi.")
        except Exception as exc:
            failures.append(f"{club['slug']}: {exc}")
            print(f"  HATA: {exc}")
            if not args.continue_on_error:
                raise
    pair_count = rebuild_pairs(conn)
    print(
        f"Güncel kadro senkronizasyonu tamamlandı. Oyuncu satırı: {total}, "
        f"API isteği: {client.requests_used}, hata: {len(failures)}, "
        f"ortak oyuncu matrisi: {pair_count}."
    )


def command_sync_transfers(args: argparse.Namespace) -> None:
    conn, clubs = _api_sync_clubs(args)
    last_transfer_sync = {
        int(row["club_id"]): row["finished_at"]
        for row in conn.execute(
            """SELECT club_id, MAX(finished_at) finished_at FROM import_runs
               WHERE source='API_FOOTBALL_TRANSFERS' AND status='COMPLETED'
               GROUP BY club_id"""
        )
    }
    clubs.sort(key=lambda club: (int(club["id"]) in last_transfer_sync, last_transfer_sync.get(int(club["id"])) or "", club["priority"], club["name"]))
    client = get_api_client()
    budget = max(1, int(args.budget))
    total = 0
    failures: list[str] = []
    for club in clubs:
        if client.requests_used >= budget:
            print(f"İstek bütçesi doldu ({budget}). Komutu tekrar çalıştırarak devam edin.")
            break
        if not club["api_football_id"]:
            continue
        print(f"Transfer geçmişi: {club['name']}")
        try:
            result = sync_team_transfers(
                conn, client, int(club["id"]), int(club["api_football_id"])
            )
            total += result["imported"]
            print(f"  {result['imported']} üyelik bağlantısı işlendi.")
        except Exception as exc:
            failures.append(f"{club['slug']}: {exc}")
            print(f"  HATA: {exc}")
            if not args.continue_on_error:
                raise
    pair_count = rebuild_pairs(conn)
    print(
        f"Transfer senkronizasyonu tamamlandı. Üyelik satırı: {total}, "
        f"API isteği: {client.requests_used}, hata: {len(failures)}, "
        f"ortak oyuncu matrisi: {pair_count}."
    )


def command_freshness_report(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    rebuild_pair_stats(conn)
    report = freshness_report(conn)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for key, value in report["summary"].items():
        print(f"{key}: {value}")
    print(f"Güncellik raporu: {output}")

def command_approve_cross(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    result = approve_cross_club_candidates(conn, min_clubs=args.min_clubs)
    count = rebuild_pairs(conn)
    print(
        f"{result['players']} oyuncu ve {result['memberships']} üyelik doğrulandı. "
        f"Ortak oyuncu matrisi: {count} kayıt."
    )


def command_build_pairs(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    count = rebuild_pairs(conn)
    print(f"Ortak oyuncu matrisi yenilendi: {count} kayıt.")


def command_stats(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    rebuild_pair_stats(conn)
    report = quality_report(conn)
    for key, value in report["summary"].items():
        print(f"{key}: {value}")
    print("\nEn güçlü takım çiftleri:")
    for row in conn.execute(
        """
        SELECT a.name club_a, b.name club_b, s.verified_player_count
        FROM club_pair_stats s
        JOIN clubs a ON a.id=s.club_low_id
        JOIN clubs b ON b.id=s.club_high_id
        WHERE s.verified_player_count > 0
        ORDER BY s.verified_player_count DESC, club_a, club_b
        LIMIT 30
        """
    ):
        print(f"- {row['club_a']} / {row['club_b']}: {row['verified_player_count']}")


def command_quality_report(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    rebuild_pair_stats(conn)
    report = quality_report(conn)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Kalite raporu oluşturuldu: {output}")


def _pair_rows(conn: sqlite3.Connection):
    return conn.execute(
        """
        SELECT a.slug club_a_slug, a.name club_a,
               b.slug club_b_slug, b.name club_b,
               p.id player_id, p.game_name player,
               p.normalized_name normalized_player,
               p.wikidata_qid player_qid,
               p.api_football_id player_api_football_id,
               GROUP_CONCAT(DISTINCT CASE WHEN pa.accepted=1 THEN pa.normalized_alias END) accepted_aliases
        FROM club_pair_players cpp
        JOIN clubs a ON a.id=cpp.club_low_id
        JOIN clubs b ON b.id=cpp.club_high_id
        JOIN players p ON p.id=cpp.player_id
        LEFT JOIN player_aliases pa ON pa.player_id=p.id
        GROUP BY a.slug, a.name, b.slug, b.name, p.id, p.game_name,
                 p.normalized_name, p.wikidata_qid, p.api_football_id
        ORDER BY club_a, club_b, player
        """
    ).fetchall()


def command_export(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    rebuild_pairs(conn)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    rows = _pair_rows(conn)
    if args.format == "json":
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = f"{row['club_a_slug']}__{row['club_b_slug']}"
            grouped.setdefault(
                key,
                {
                    "club_a": {"slug": row["club_a_slug"], "name": row["club_a"]},
                    "club_b": {"slug": row["club_b_slug"], "name": row["club_b"]},
                    "players": [],
                },
            )["players"].append(
                {
                    "id": row["player_id"],
                    "name": row["player"],
                    "normalized_name": row["normalized_player"],
                    "accepted_answers": sorted(set(
                        [row["normalized_player"]]
                        + ([value for value in (row["accepted_aliases"] or "").split(",") if value])
                    )),
                    "wikidata_qid": row["player_qid"],
                    "api_football_id": row["player_api_football_id"],
                }
            )
        payload = {
            "schema_version": 2,
            "data_cutoff_year": 2026,
            "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "club_count": int(conn.execute("SELECT COUNT(*) FROM clubs WHERE active=1").fetchone()[0]),
            "player_count": int(conn.execute("SELECT COUNT(*) FROM players WHERE status='VERIFIED'").fetchone()[0]),
            "club_pairs": list(grouped.values()),
        }
        output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    else:
        with output.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(
                [
                    "club_a_slug",
                    "club_a",
                    "club_b_slug",
                    "club_b",
                    "player",
                    "normalized_player",
                    "player_qid",
                    "player_api_football_id",
                    "accepted_answers",
                ]
            )
            for row in rows:
                answers = sorted(set(
                    [row["normalized_player"]]
                    + ([value for value in (row["accepted_aliases"] or "").split(",") if value])
                ))
                writer.writerow([
                    row["club_a_slug"], row["club_a"],
                    row["club_b_slug"], row["club_b"],
                    row["player"], row["normalized_player"],
                    row["player_qid"], row["player_api_football_id"],
                    ";".join(answers),
                ])
    print(f"{len(rows)} kayıt dışa aktarıldı: {output}")


def command_resolve_wikipedia_categories(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    client = get_wikipedia_client()
    clubs = select_clubs(conn, args.club, args.priority)
    resolved = 0
    review = 0
    for club in clubs:
        print(f"Wikipedia kategorisi çözülüyor: {club['name']}")
        try:
            result = resolve_wikipedia_category(conn, client, int(club["id"]), force=args.force)
            if result["status"] in {"RESOLVED", "ALREADY_RESOLVED"}:
                resolved += 1
                print(f"  {result['status']}: {result['category']}")
            else:
                review += 1
                print("  Manuel kontrol gerekli.")
                for score, candidate in result.get("candidates", [])[:5]:
                    print(f"   - puan={score}: {candidate}")
        except Exception as exc:
            review += 1
            print(f"  HATA: {exc}")
            if not args.continue_on_error:
                raise
    print(f"Tamamlandı. Çözülen: {resolved}, kontrol/hata: {review}")


def command_set_wikipedia_category(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    club = conn.execute("SELECT * FROM clubs WHERE slug=?", (args.club,)).fetchone()
    if club is None:
        raise RuntimeError(f"Kulüp bulunamadı: {args.club}")
    category = args.category
    if not category.startswith("Category:"):
        category = f"Category:{category}"
    conn.execute(
        "UPDATE clubs SET wikipedia_category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (category, club["id"]),
    )
    conn.commit()
    print(f"{club['name']} Wikipedia kategorisi: {category}")


def command_import_wikipedia(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    client = get_wikipedia_client()
    clubs = select_clubs(conn, args.club, args.priority)
    total_players = 0
    total_memberships = 0
    failures: list[str] = []
    for club in clubs:
        print(f"Wikipedia oyuncu kategorisi içe aktarılıyor: {club['name']}")
        try:
            result = import_wikipedia_club_category(
                conn,
                client,
                int(club["id"]),
                max_pages=args.max_pages_per_club,
                min_year=args.min_year,
            )
            total_players += result["players"]
            total_memberships += result["memberships"]
            print(
                f"  sayfa={result['pages']}, oyuncu={result['players']}, "
                f"üyelik={result['memberships']}, atlanan={result['skipped']}"
            )
        except Exception as exc:
            failures.append(f"{club['slug']}: {exc}")
            print(f"  HATA: {exc}")
            if not args.continue_on_error:
                raise
    print(
        f"Wikipedia import tamamlandı. Oyuncu işlemi: {total_players}, "
        f"üyelik: {total_memberships}, hata: {len(failures)}"
    )
    for failure in failures:
        print(f"- {failure}")


def command_auto_verify_evidence(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    result = auto_verify_by_evidence(
        conn,
        min_confidence=args.min_confidence,
        min_sources=args.min_sources,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def command_backfill_wikidata_evidence(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    result = backfill_wikidata_evidence(conn)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.verify:
        verified = auto_verify_by_evidence(conn, min_confidence=70, min_sources=1)
        rebuild_pairs(conn)
        print(json.dumps(verified, ensure_ascii=False, indent=2))


def command_collection_report(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    report = collection_report(conn)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Rapor: {output}")


def command_collect_scale(args: argparse.Namespace) -> None:
    """Run the scalable, free-first collection pipeline.

    Network-dependent steps are intentionally explicit so a failed source does
    not destroy already verified data.
    """
    conn = connect(db_path(args.db))
    init_db(conn)
    seed_clubs(conn, args.clubs)
    print("1/5 Kulüpler ve veritabanı hazır.")

    if not args.skip_wikidata:
        command_import(argparse.Namespace(
            db=args.db, clubs=args.clubs, settings=args.settings,
            club=args.club, priority=args.priority, min_year=args.min_year,
            continue_on_error=True,
        ))
        print("2/5 Wikidata tarihî ilişkileri işlendi.")
    else:
        print("2/5 Wikidata atlandı.")

    if not args.skip_wikipedia:
        command_import_wikipedia(argparse.Namespace(
            db=args.db, clubs=args.clubs, club=args.club,
            priority=args.priority, max_pages_per_club=args.max_pages_per_club,
            min_year=args.min_year, continue_on_error=True,
        ))
        print("3/5 Wikipedia kategori/infobox verileri işlendi.")
    else:
        print("3/5 Wikipedia atlandı.")

    if not args.skip_api_football and os.getenv("API_FOOTBALL_KEY"):
        command_sync_current_squads(argparse.Namespace(
            db=args.db, clubs=args.clubs, club=args.club,
            priority=args.priority, pool=None, budget=args.api_budget,
            continue_on_error=True,
        ))
        print("4/5 Güncel kadrolar işlendi.")
    else:
        print("4/5 API-Football atlandı (anahtar yok veya --skip-api-football).")

    backfill_wikidata_evidence(conn)
    auto_verify_by_evidence(conn, min_confidence=70, min_sources=1)
    rebuild_pairs(conn)
    report = collection_report(conn)
    print("5/5 Matris ve kapsam raporu oluşturuldu.")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


def command_validate(args: argparse.Namespace) -> None:
    conn = connect(db_path(args.db))
    init_db(conn)
    clubs = {
        row["slug"]: int(row["id"])
        for row in conn.execute("SELECT id, slug FROM clubs WHERE active=1")
    }
    for slug in [args.club_a, args.club_b]:
        if slug not in clubs:
            raise RuntimeError(f"Kulüp bulunamadı: {slug}")
    result = validate_answer(conn, clubs[args.club_a], clubs[args.club_b], args.answer)
    print(json.dumps(result.__dict__, ensure_ascii=False, indent=2))


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Football Link ücretsiz veri toplama aracı")
    p.add_argument("--db", help="SQLite veritabanı yolu")
    p.add_argument("--clubs", default=str(DEFAULT_CLUBS), help="Kulüp config JSON")
    p.add_argument("--settings", default=str(DEFAULT_SETTINGS), help="Ayar config JSON")
    subs = p.add_subparsers(dest="command", required=True)

    sub = subs.add_parser("init", help="Veritabanını ve kulüpleri hazırla")
    sub.set_defaults(func=command_init)

    sub = subs.add_parser("seed-demo", help="İnternetsiz geniş örnek veri yükle")
    sub.add_argument("--file", default=str(DEFAULT_DEMO))
    sub.add_argument("--fresh", action="store_true", help="Önce eski DEMO kayıtlarını temizle")
    sub.set_defaults(func=command_seed_demo)

    sub = subs.add_parser("resolve-clubs", help="Kulüp Wikidata QID değerlerini otomatik çöz")
    sub.add_argument("--club", action="append", help="Yalnızca belirtilen slug; tekrarlanabilir")
    sub.add_argument("--priority", type=int, help="Bu öncelik ve üzerindeki kulüpleri çöz (1 veya 2)")
    sub.add_argument("--force", action="store_true")
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_resolve_clubs)

    sub = subs.add_parser("set-club-qid", help="Bir kulübün Wikidata QID değerini elle kaydet")
    sub.add_argument("--club", required=True, help="Kulüp slug")
    sub.add_argument("--qid", required=True, help="Örn. Q12345")
    sub.set_defaults(func=command_set_club_qid)


    sub = subs.add_parser("apply-overrides", help="Elle doğrulanmış güncel/tarihî düzeltmeleri uygula")
    sub.add_argument("--file", default=str(DEFAULT_OVERRIDES))
    sub.set_defaults(func=command_apply_overrides)

    sub = subs.add_parser("resolve-api-teams", help="API-Football takım ID değerlerini çöz")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--budget", type=int, default=95, help="Bu çalıştırmadaki azami API isteği")
    sub.add_argument("--force", action="store_true")
    sub.set_defaults(func=command_resolve_api_teams)

    sub = subs.add_parser("set-api-team-id", help="Bir kulübün API-Football ID değerini elle kaydet")
    sub.add_argument("--club", required=True)
    sub.add_argument("--api-id", type=int, required=True)
    sub.set_defaults(func=command_set_api_team_id)

    sub = subs.add_parser("sync-current-squads", help="2026 güncel A takım kadrolarını senkronize et")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--pool", choices=["MVP", "EXTENDED", "GLOBAL"])
    sub.add_argument("--budget", type=int, default=95)
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_sync_current_squads)

    sub = subs.add_parser("sync-transfers", help="Seçili takımların transfer ilişkilerini senkronize et")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--pool", choices=["MVP", "EXTENDED", "GLOBAL"])
    sub.add_argument("--budget", type=int, default=95)
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_sync_transfers)

    sub = subs.add_parser("import-wikidata", help="Wikidata'dan oyuncu adaylarını çek")
    sub.add_argument("--club", action="append", help="Yalnızca belirtilen slug; tekrarlanabilir")
    sub.add_argument("--priority", type=int, help="Örn. 1: yalnızca ana kulüpler")
    sub.add_argument("--min-year", type=int, help="Bu yıldan eski biten üyelikleri atla")
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_import)

    sub = subs.add_parser(
        "approve-cross-club",
        help="En az iki seçili kulüpte görünen adayları topluca doğrula",
    )
    sub.add_argument("--min-clubs", type=int, default=2)
    sub.set_defaults(func=command_approve_cross)

    sub = subs.add_parser("build-pairs", help="Doğrulanmış kayıtlardan takım çiftleri üret")
    sub.set_defaults(func=command_build_pairs)

    sub = subs.add_parser("stats", help="Veri özetini göster")
    sub.set_defaults(func=command_stats)

    sub = subs.add_parser("quality-report", help="Eksik ve zayıf çiftleri JSON raporla")
    sub.add_argument(
        "--output",
        default=str(ROOT / "exports" / "quality_report.json"),
    )
    sub.set_defaults(func=command_quality_report)

    sub = subs.add_parser("freshness-report", help="Kulüp ve güncel kadro kapsamını raporla")
    sub.add_argument(
        "--output",
        default=str(ROOT / "exports" / "freshness_report.json"),
    )
    sub.set_defaults(func=command_freshness_report)

    sub = subs.add_parser("export", help="Ortak oyuncuları CSV veya JSON'a aktar")
    sub.add_argument("--format", choices=["csv", "json"], default="csv")
    sub.add_argument("--output", default=str(ROOT / "exports" / "club_pairs.csv"))
    sub.set_defaults(func=command_export)

    sub = subs.add_parser("resolve-wikipedia-categories", help="Kulüplerin Wikipedia oyuncu kategorilerini çöz")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--force", action="store_true")
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_resolve_wikipedia_categories)

    sub = subs.add_parser("set-wikipedia-category", help="Bir kulübün Wikipedia oyuncu kategorisini elle kaydet")
    sub.add_argument("--club", required=True)
    sub.add_argument("--category", required=True)
    sub.set_defaults(func=command_set_wikipedia_category)

    sub = subs.add_parser("import-wikipedia", help="Wikipedia oyuncu kategorileri ve kariyer infoboxlarını içe aktar")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--max-pages-per-club", type=int)
    sub.add_argument("--min-year", type=int, default=1990)
    sub.add_argument("--continue-on-error", action="store_true")
    sub.set_defaults(func=command_import_wikipedia)

    sub = subs.add_parser("auto-verify-evidence", help="Kaynak güven puanına göre üyelikleri doğrula")
    sub.add_argument("--min-confidence", type=int, default=70)
    sub.add_argument("--min-sources", type=int, default=1)
    sub.set_defaults(func=command_auto_verify_evidence)

    sub = subs.add_parser(
        "backfill-wikidata-evidence",
        help="Kanıtsız Wikidata üyeliklerine source_evidence yaz (internet gerekmez)",
    )
    sub.add_argument(
        "--verify",
        action="store_true",
        help="Kanıt yazıldıktan sonra auto-verify ve çift matrisini yenile",
    )
    sub.set_defaults(func=command_backfill_wikidata_evidence)

    sub = subs.add_parser("collection-report", help="Kaynak bazlı veri toplama kapsam raporu üret")
    sub.add_argument("--output", default=str(ROOT / "exports" / "collection_report.json"))
    sub.set_defaults(func=command_collection_report)

    sub = subs.add_parser("collect-scale", help="Wikidata + Wikipedia + güncel kadro hattını çalıştır")
    sub.add_argument("--club", action="append")
    sub.add_argument("--priority", type=int)
    sub.add_argument("--min-year", type=int, default=1990)
    sub.add_argument("--max-pages-per-club", type=int)
    sub.add_argument("--api-budget", type=int, default=95)
    sub.add_argument("--skip-wikidata", action="store_true")
    sub.add_argument("--skip-wikipedia", action="store_true")
    sub.add_argument("--skip-api-football", action="store_true")
    sub.add_argument("--continue-on-error", action="store_true", help="Kaynak hatalarında diğer kulüplere devam et")
    sub.set_defaults(func=command_collect_scale)

    sub = subs.add_parser("validate-answer", help="Oyun cevabı doğrulamasını dene")
    sub.add_argument("--club-a", required=True)
    sub.add_argument("--club-b", required=True)
    sub.add_argument("--answer", required=True)
    sub.set_defaults(func=command_validate)
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)
