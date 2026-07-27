from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from .collector import WIKIDATA_MEMBERSHIP_CONFIDENCE, insert_wikidata_evidence
from .db import insert_aliases, rebuild_pair_stats
from .normalize import normalize_name
from .wikidata import WikidataClient


def _date_only(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10]


def _year(value: str | None) -> int | None:
    if not value or len(value) < 4:
        return None
    try:
        return int(value[:4])
    except ValueError:
        return None


def should_keep_membership(start_date: str | None, end_date: str | None, min_year: int | None) -> bool:
    if not min_year:
        return True
    end_year = _year(end_date)
    start_year = _year(start_date)
    if end_year is not None:
        return end_year >= min_year
    if start_year is not None:
        return start_year >= min_year
    # Tarih yoksa otomatik atmayız; inceleme ekranında görülebilsin.
    return True


def resolve_club(
    conn: sqlite3.Connection,
    client: WikidataClient,
    club_id: int,
    force: bool = False,
) -> dict[str, Any]:
    club = conn.execute("SELECT * FROM clubs WHERE id=?", (club_id,)).fetchone()
    if club is None:
        raise ValueError(f"Kulüp bulunamadı: {club_id}")
    if club["wikidata_qid"] and not force:
        return {
            "club_id": club_id,
            "club": club["name"],
            "qid": club["wikidata_qid"],
            "status": "ALREADY_RESOLVED",
        }

    term = club["wikidata_search"] or club["name"]
    candidate = client.resolve_club_qid(term)
    if candidate is None:
        conn.execute(
            "UPDATE clubs SET qid_status='NEEDS_REVIEW', updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (club_id,),
        )
        conn.commit()
        return {
            "club_id": club_id,
            "club": club["name"],
            "qid": None,
            "status": "NEEDS_REVIEW",
            "candidates": [asdict(item) for item in client.search_club_candidates(term)],
        }

    conn.execute(
        """
        UPDATE clubs
        SET wikidata_qid=?, qid_status='RESOLVED', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (candidate.qid, club_id),
    )
    conn.commit()
    return {
        "club_id": club_id,
        "club": club["name"],
        "qid": candidate.qid,
        "status": "RESOLVED",
        "candidate": asdict(candidate),
    }


def import_club(
    conn: sqlite3.Connection,
    client: WikidataClient,
    club_id: int,
    club_qid: str,
    *,
    min_year: int | None = 1990,
    page_size: int = 300,
    auto_accept_aliases: bool = False,
) -> dict[str, int]:
    run_id = conn.execute(
        "INSERT INTO import_runs(source, club_id) VALUES ('WIKIDATA', ?)",
        (club_id,),
    ).lastrowid
    conn.commit()

    imported = 0
    skipped = 0
    try:
        rows = list(client.iter_club_memberships(club_qid, page_size=page_size, min_year=min_year))
        qids = list(dict.fromkeys(row.player_qid for row in rows))
        aliases_by_qid = client.fetch_aliases(qids) if qids else {}

        for item in rows:
            if not should_keep_membership(item.start_date, item.end_date, min_year):
                skipped += 1
                continue

            normalized = normalize_name(item.player_label)
            if not normalized:
                skipped += 1
                continue

            conn.execute(
                """
                INSERT INTO players(wikidata_qid, game_name, normalized_name, birth_date, image_url, status)
                VALUES (?, ?, ?, ?, ?, 'IMPORTED')
                ON CONFLICT(wikidata_qid) DO UPDATE SET
                    game_name=CASE
                        WHEN players.game_name = players.wikidata_qid THEN excluded.game_name
                        ELSE players.game_name
                    END,
                    normalized_name=CASE
                        WHEN players.game_name = players.wikidata_qid THEN excluded.normalized_name
                        ELSE players.normalized_name
                    END,
                    birth_date=COALESCE(players.birth_date, excluded.birth_date),
                    image_url=COALESCE(players.image_url, excluded.image_url),
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    item.player_qid,
                    item.player_label,
                    normalized,
                    _date_only(item.birth_date),
                    item.image_url,
                ),
            )
            player_id = int(
                conn.execute(
                    "SELECT id FROM players WHERE wikidata_qid = ?", (item.player_qid,)
                ).fetchone()[0]
            )
            insert_aliases(
                conn,
                player_id,
                aliases_by_qid.get(item.player_qid, []),
                normalize_name,
                accepted=auto_accept_aliases,
            )
            start_date = _date_only(item.start_date)
            end_date = _date_only(item.end_date)
            conn.execute(
                """
                INSERT INTO memberships(
                    player_id, club_id, start_date, end_date,
                    membership_type, squad_level, source, status, source_payload,
                    confidence, is_current, last_seen_at
                ) VALUES (?, ?, ?, ?, 'UNKNOWN', 'FIRST_TEAM', 'WIKIDATA', 'IMPORTED', ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT DO UPDATE SET
                    confidence=MAX(memberships.confidence, excluded.confidence),
                    source_payload=excluded.source_payload,
                    last_seen_at=CURRENT_TIMESTAMP,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    player_id,
                    club_id,
                    start_date,
                    end_date,
                    json.dumps(asdict(item), ensure_ascii=False),
                    WIKIDATA_MEMBERSHIP_CONFIDENCE,
                    int(item.end_date is None),
                ),
            )
            membership_row = conn.execute(
                """
                SELECT id FROM memberships
                WHERE player_id=? AND club_id=?
                  AND COALESCE(start_date, '')=COALESCE(?, '')
                  AND COALESCE(end_date, '')=COALESCE(?, '')
                  AND source='WIKIDATA'
                """,
                (player_id, club_id, start_date, end_date),
            ).fetchone()
            insert_wikidata_evidence(
                conn,
                player_id=player_id,
                club_id=club_id,
                membership_id=int(membership_row["id"]) if membership_row else None,
                player_qid=item.player_qid,
                club_qid=club_qid,
                payload=asdict(item),
            )
            imported += 1

        conn.execute(
            "UPDATE clubs SET last_imported_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (club_id,),
        )
        conn.execute(
            """
            UPDATE import_runs
            SET status='COMPLETED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, skipped_count=?
            WHERE id=?
            """,
            (imported, skipped, run_id),
        )
        conn.commit()
        rebuild_pair_stats(conn)
        return {"imported": imported, "skipped": skipped, "run_id": int(run_id)}
    except Exception as exc:
        conn.rollback()
        conn.execute(
            """
            UPDATE import_runs
            SET status='FAILED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, skipped_count=?, error_message=?
            WHERE id=?
            """,
            (imported, skipped, str(exc), run_id),
        )
        conn.execute(
            """
            INSERT INTO import_errors(import_run_id, club_id, error_type, message)
            VALUES (?, ?, ?, ?)
            """,
            (run_id, club_id, type(exc).__name__, str(exc)),
        )
        conn.commit()
        raise


def verify_player_and_memberships(conn: sqlite3.Connection, player_id: int) -> None:
    conn.execute(
        "UPDATE players SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (player_id,),
    )
    conn.execute(
        "UPDATE memberships SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE player_id=?",
        (player_id,),
    )
    conn.commit()
    rebuild_pair_stats(conn)


def approve_cross_club_candidates(conn: sqlite3.Connection, min_clubs: int = 2) -> dict[str, int]:
    player_ids = [
        int(row["player_id"])
        for row in conn.execute(
            """
            SELECT player_id
            FROM memberships
            WHERE status='IMPORTED' AND squad_level='FIRST_TEAM'
            GROUP BY player_id
            HAVING COUNT(DISTINCT club_id) >= ?
            """,
            (min_clubs,),
        )
    ]
    if not player_ids:
        return {"players": 0, "memberships": 0}

    marks = ",".join("?" for _ in player_ids)
    conn.execute(
        f"UPDATE players SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id IN ({marks})",
        player_ids,
    )
    cursor = conn.execute(
        f"""
        UPDATE memberships
        SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP
        WHERE player_id IN ({marks}) AND status='IMPORTED'
        """,
        player_ids,
    )
    conn.commit()
    rebuild_pair_stats(conn)
    return {"players": len(player_ids), "memberships": int(cursor.rowcount)}


def quality_report(conn: sqlite3.Connection) -> dict[str, Any]:
    summary = {
        "clubs": int(conn.execute("SELECT COUNT(*) FROM clubs WHERE active=1").fetchone()[0]),
        "resolved_clubs": int(
            conn.execute(
                "SELECT COUNT(*) FROM clubs WHERE active=1 AND wikidata_qid IS NOT NULL"
            ).fetchone()[0]
        ),
        "players": int(conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]),
        "verified_players": int(
            conn.execute("SELECT COUNT(*) FROM players WHERE status='VERIFIED'").fetchone()[0]
        ),
        "memberships": int(conn.execute("SELECT COUNT(*) FROM memberships").fetchone()[0]),
        "verified_memberships": int(
            conn.execute("SELECT COUNT(*) FROM memberships WHERE status='VERIFIED'").fetchone()[0]
        ),
        "pairs": int(conn.execute("SELECT COUNT(*) FROM club_pair_stats").fetchone()[0]),
        "playable_pairs": int(
            conn.execute(
                "SELECT COUNT(*) FROM club_pair_stats WHERE verified_player_count >= 1"
            ).fetchone()[0]
        ),
        "good_pairs": int(
            conn.execute(
                "SELECT COUNT(*) FROM club_pair_stats WHERE verified_player_count >= 3"
            ).fetchone()[0]
        ),
        "needs_review_pairs": int(
            conn.execute(
                "SELECT COUNT(*) FROM club_pair_stats WHERE coverage_status='NEEDS_REVIEW'"
            ).fetchone()[0]
        ),
    }
    unresolved = [
        dict(row)
        for row in conn.execute(
            """
            SELECT slug, name, league, wikidata_search
            FROM clubs
            WHERE active=1 AND wikidata_qid IS NULL
            ORDER BY priority, league, name
            """
        )
    ]
    thin_pairs = [
        dict(row)
        for row in conn.execute(
            """
            SELECT a.name club_a, b.name club_b,
                   s.verified_player_count, s.candidate_player_count, s.coverage_status
            FROM club_pair_stats s
            JOIN clubs a ON a.id=s.club_low_id
            JOIN clubs b ON b.id=s.club_high_id
            WHERE s.coverage_status IN ('PLAYABLE','NEEDS_REVIEW')
            ORDER BY s.verified_player_count, s.candidate_player_count DESC, club_a, club_b
            LIMIT 100
            """
        )
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "unresolved_clubs": unresolved,
        "thin_pairs": thin_pairs,
    }
