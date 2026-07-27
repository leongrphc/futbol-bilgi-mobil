from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Iterable

from .db import insert_aliases, rebuild_pair_stats
from .normalize import normalize_name
from .wikipedia import WikipediaClient, WikipediaPage, parse_footballer_infobox


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugish(value: str) -> str:
    value = normalize_name(value)
    value = re.sub(r"\b(?:fc|cf|afc|sc|ac|fk|sk|club|football|futbol|calcio)\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _club_lookup(conn: sqlite3.Connection) -> tuple[dict[str, int], dict[int, dict[str, Any]]]:
    by_alias: dict[str, int] = {}
    by_id: dict[int, dict[str, Any]] = {}
    for row in conn.execute("SELECT * FROM clubs WHERE active=1"):
        item = dict(row)
        club_id = int(row["id"])
        by_id[club_id] = item
        candidates = {
            row["name"],
            row["slug"].replace("-", " "),
            row["wikidata_search"],
            row["api_football_search"],
            row["wikipedia_title"],
        }
        for candidate in candidates:
            if not candidate:
                continue
            by_alias[normalize_name(str(candidate))] = club_id
            by_alias[_slugish(str(candidate))] = club_id
    return by_alias, by_id


def _match_club(
    aliases: dict[str, int],
    names: Iterable[str],
    linked_titles: Iterable[str],
) -> int | None:
    matches: set[int] = set()
    for value in [*linked_titles, *names]:
        if not value:
            continue
        for key in {normalize_name(value), _slugish(value)}:
            if key in aliases:
                matches.add(aliases[key])
    return next(iter(matches)) if len(matches) == 1 else None


def _upsert_player_from_wikipedia(
    conn: sqlite3.Connection,
    page: WikipediaPage,
    game_name: str,
    full_name: str | None,
) -> int:
    player = None
    if page.wikidata_qid:
        player = conn.execute(
            "SELECT id FROM players WHERE wikidata_qid=?", (page.wikidata_qid,)
        ).fetchone()
    if player is None:
        player = conn.execute(
            "SELECT id FROM players WHERE wikipedia_page_id=?", (page.page_id,)
        ).fetchone()
    normalized = normalize_name(game_name)
    if player is None:
        same = conn.execute(
            "SELECT id FROM players WHERE normalized_name=? ORDER BY id", (normalized,)
        ).fetchall()
        if len(same) == 1:
            player = same[0]

    if player is None:
        conn.execute(
            """
            INSERT INTO players(
                wikidata_qid, wikipedia_page_id, wikipedia_title,
                game_name, normalized_name, status, last_enriched_at
            ) VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?)
            """,
            (
                page.wikidata_qid,
                page.page_id,
                page.title,
                game_name,
                normalized,
                _utc_now(),
            ),
        )
        player_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    else:
        player_id = int(player["id"])
        conn.execute(
            """
            UPDATE players SET
                wikidata_qid=COALESCE(wikidata_qid, ?),
                wikipedia_page_id=COALESCE(wikipedia_page_id, ?),
                wikipedia_title=COALESCE(wikipedia_title, ?),
                game_name=CASE WHEN game_name LIKE 'DEMO-%' THEN ? ELSE game_name END,
                status='VERIFIED', last_enriched_at=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (
                page.wikidata_qid,
                page.page_id,
                page.title,
                game_name,
                _utc_now(),
                player_id,
            ),
        )

    aliases = [game_name, page.title.split(" (", 1)[0]]
    if full_name:
        aliases.append(full_name)
    insert_aliases(
        conn,
        player_id,
        aliases,
        normalize_name,
        source="WIKIPEDIA",
        accepted=True,
    )
    return player_id


def _insert_evidence(
    conn: sqlite3.Connection,
    *,
    player_id: int,
    club_id: int | None,
    source: str,
    evidence_type: str,
    source_url: str,
    source_revision: str,
    confidence: int,
    payload: dict[str, Any],
    membership_id: int | None = None,
) -> None:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    payload_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    conn.execute(
        """
        INSERT INTO source_evidence(
            player_id, club_id, membership_id, source, evidence_type,
            source_url, source_revision, confidence, payload, payload_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id, club_id, source, evidence_type, source_revision)
        DO UPDATE SET
            membership_id=COALESCE(excluded.membership_id, source_evidence.membership_id),
            confidence=MAX(source_evidence.confidence, excluded.confidence),
            payload=excluded.payload, payload_hash=excluded.payload_hash,
            collected_at=CURRENT_TIMESTAMP
        """,
        (
            player_id,
            club_id,
            membership_id,
            source,
            evidence_type,
            source_url,
            source_revision or "",
            confidence,
            raw,
            payload_hash,
        ),
    )


# Wikidata P54 ilişkisi güven modelinde 70 puandır (DATA_COLLECTION_ARCHITECTURE.md).
WIKIDATA_MEMBERSHIP_CONFIDENCE = 70

# SQLite varsayılan SQLITE_MAX_VARIABLE_NUMBER sınırının altında kalan parça boyutu.
_SQL_BATCH = 500


def insert_wikidata_evidence(
    conn: sqlite3.Connection,
    *,
    player_id: int,
    club_id: int,
    membership_id: int | None,
    player_qid: str,
    club_qid: str | None,
    payload: dict[str, Any],
) -> None:
    """Wikidata P54 üyeliği için kaynak kanıtı yaz.

    Kanıt, SPARQL sonucunun kendisinden üretilir; yeni bir iddia uydurulmaz.
    """
    _insert_evidence(
        conn,
        player_id=player_id,
        club_id=club_id,
        membership_id=membership_id,
        source="WIKIDATA",
        evidence_type="P54_MEMBERSHIP",
        source_url=f"https://www.wikidata.org/wiki/{player_qid}",
        source_revision=club_qid or "",
        confidence=WIKIDATA_MEMBERSHIP_CONFIDENCE,
        payload=payload,
    )


def backfill_wikidata_evidence(conn: sqlite3.Connection) -> dict[str, int]:
    """Kanıtsız kalmış eski Wikidata üyeliklerine kaynak kanıtı üret.

    Üyeliğin `source_payload` alanında saklanan SPARQL satırı kullanılır; ağa
    çıkılmaz ve kayıtta olmayan hiçbir ilişki eklenmez.
    """
    rows = conn.execute(
        """
        SELECT m.id membership_id, m.player_id, m.club_id, m.source_payload,
               p.wikidata_qid player_qid, c.wikidata_qid club_qid
        FROM memberships m
        JOIN players p ON p.id=m.player_id
        JOIN clubs c ON c.id=m.club_id
        LEFT JOIN source_evidence se
               ON se.membership_id=m.id AND se.source='WIKIDATA'
        WHERE m.source='WIKIDATA'
          AND m.status!='REJECTED'
          AND p.wikidata_qid IS NOT NULL
          AND p.wikidata_qid NOT LIKE 'DEMO-%'
          AND se.id IS NULL
        """
    ).fetchall()

    written = 0
    membership_ids: list[int] = []
    for row in rows:
        try:
            payload = json.loads(row["source_payload"]) if row["source_payload"] else {}
        except (TypeError, ValueError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {"raw": payload}
        insert_wikidata_evidence(
            conn,
            player_id=int(row["player_id"]),
            club_id=int(row["club_id"]),
            membership_id=int(row["membership_id"]),
            player_qid=str(row["player_qid"]),
            club_qid=row["club_qid"],
            payload=payload,
        )
        membership_ids.append(int(row["membership_id"]))
        written += 1
        if written % 500 == 0:
            conn.commit()

    for start in range(0, len(membership_ids), _SQL_BATCH):
        batch = membership_ids[start:start + _SQL_BATCH]
        marks = ",".join("?" for _ in batch)
        conn.execute(
            f"""
            UPDATE memberships
            SET confidence=MAX(confidence, ?), updated_at=CURRENT_TIMESTAMP
            WHERE id IN ({marks})
            """,
            [WIKIDATA_MEMBERSHIP_CONFIDENCE, *batch],
        )
    conn.commit()
    return {"evidence_written": written}


def _upsert_membership(
    conn: sqlite3.Connection,
    *,
    player_id: int,
    club_id: int,
    start_date: str | None,
    end_date: str | None,
    source: str,
    confidence: int,
    source_payload: dict[str, Any],
    status: str = "VERIFIED",
) -> int:
    conn.execute(
        """
        INSERT INTO memberships(
            player_id, club_id, start_date, end_date,
            membership_type, squad_level, source, status,
            source_payload, confidence, is_current, last_seen_at
        ) VALUES (?, ?, ?, ?, 'PROFESSIONAL', 'FIRST_TEAM', ?, ?, ?, ?, 0, ?)
        ON CONFLICT DO UPDATE SET
            status=CASE
                WHEN memberships.status='VERIFIED' THEN memberships.status
                ELSE excluded.status
            END,
            confidence=MAX(memberships.confidence, excluded.confidence),
            source_payload=excluded.source_payload,
            last_seen_at=excluded.last_seen_at,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            player_id,
            club_id,
            start_date,
            end_date,
            source,
            status,
            json.dumps(source_payload, ensure_ascii=False),
            confidence,
            _utc_now(),
        ),
    )
    row = conn.execute(
        """
        SELECT id FROM memberships
        WHERE player_id=? AND club_id=?
          AND COALESCE(start_date, '')=COALESCE(?, '')
          AND COALESCE(end_date, '')=COALESCE(?, '')
          AND source=?
        """,
        (player_id, club_id, start_date, end_date, source),
    ).fetchone()
    return int(row["id"])


def resolve_wikipedia_category(
    conn: sqlite3.Connection,
    client: WikipediaClient,
    club_id: int,
    force: bool = False,
) -> dict[str, Any]:
    club = conn.execute("SELECT * FROM clubs WHERE id=?", (club_id,)).fetchone()
    if club is None:
        raise ValueError(f"Kulüp bulunamadı: {club_id}")
    if club["wikipedia_category"] and not force:
        return {"status": "ALREADY_RESOLVED", "category": club["wikipedia_category"]}

    names = [
        club["wikipedia_title"],
        club["wikidata_search"],
        club["api_football_search"],
        club["name"],
    ]
    candidates: list[str] = []
    for name in names:
        if not name:
            continue
        exact = f"Category:{name} players"
        if client.category_exists(exact):
            candidates.insert(0, exact)
            break
        for candidate in client.search_categories(str(name)):
            if candidate not in candidates:
                candidates.append(candidate)

    selected = None
    club_norm = _slugish(str(club["name"]))
    scored: list[tuple[int, str]] = []
    for candidate in candidates:
        norm = _slugish(candidate.replace("Category:", "").replace(" players", ""))
        score = 0
        if norm == club_norm:
            score += 100
        elif club_norm in norm or norm in club_norm:
            score += 60
        if "women" in normalize_name(candidate) or "youth" in normalize_name(candidate):
            score -= 100
        scored.append((score, candidate))
    scored.sort(reverse=True)
    if scored and scored[0][0] >= 60:
        selected = scored[0][1]

    if selected:
        conn.execute(
            "UPDATE clubs SET wikipedia_category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (selected, club_id),
        )
        conn.commit()
        return {"status": "RESOLVED", "category": selected, "candidates": scored}
    return {"status": "NEEDS_REVIEW", "category": None, "candidates": scored}


def import_wikipedia_club_category(
    conn: sqlite3.Connection,
    client: WikipediaClient,
    club_id: int,
    *,
    max_pages: int | None = None,
    min_year: int = 1990,
) -> dict[str, int]:
    club = conn.execute("SELECT * FROM clubs WHERE id=?", (club_id,)).fetchone()
    if club is None:
        raise ValueError(f"Kulüp bulunamadı: {club_id}")
    category = club["wikipedia_category"]
    if not category:
        result = resolve_wikipedia_category(conn, client, club_id)
        category = result.get("category")
    if not category:
        raise RuntimeError(f"Wikipedia kategorisi çözülemedi: {club['name']}")

    run_id = conn.execute(
        "INSERT INTO import_runs(source, club_id) VALUES ('WIKIPEDIA_CATEGORY', ?)",
        (club_id,),
    ).lastrowid
    conn.commit()

    aliases, clubs_by_id = _club_lookup(conn)
    members = list(client.iter_category_members(str(category), limit=max_pages))
    imported_players = 0
    imported_memberships = 0
    skipped = 0
    try:
        titles = [str(row["title"]) for row in members]
        for page in client.fetch_pages(titles):
            parsed = parse_footballer_infobox(page.title, page.wikitext)
            if parsed is None:
                skipped += 1
                continue
            player_id = _upsert_player_from_wikipedia(
                conn, page, parsed.game_name, parsed.full_name
            )
            imported_players += 1
            page_url = client.page_url(page.title, page.revision_id, client.language)
            revision = str(page.revision_id or "")
            snapshot_hash = client.payload_hash(page.wikitext)
            conn.execute(
                """
                INSERT OR IGNORE INTO source_snapshots(
                    source, entity_type, entity_key, revision, payload, payload_hash
                ) VALUES ('WIKIPEDIA', 'PLAYER_PAGE', ?, ?, ?, ?)
                """,
                (str(page.page_id), revision, page.wikitext, snapshot_hash),
            )

            # Category membership itself is useful evidence for the source club.
            category_membership_id = _upsert_membership(
                conn,
                player_id=player_id,
                club_id=club_id,
                start_date=None,
                end_date=None,
                source="WIKIPEDIA_CATEGORY",
                confidence=72,
                source_payload={"category": category, "page": page.title},
                status="VERIFIED",
            )
            _insert_evidence(
                conn,
                player_id=player_id,
                club_id=club_id,
                membership_id=category_membership_id,
                source="WIKIPEDIA",
                evidence_type="CATEGORY_MEMBER",
                source_url=page_url,
                source_revision=revision,
                confidence=72,
                payload={"category": category, "page": page.title},
            )
            imported_memberships += 1

            for career in parsed.memberships:
                target_club_id = _match_club(aliases, career.club_names, career.linked_titles)
                if target_club_id is None:
                    continue
                if career.end_date and int(career.end_date[:4]) < min_year:
                    continue
                membership_id = _upsert_membership(
                    conn,
                    player_id=player_id,
                    club_id=target_club_id,
                    start_date=career.start_date,
                    end_date=career.end_date,
                    source="WIKIPEDIA_INFOBOX",
                    confidence=86,
                    source_payload=asdict(career),
                    status="VERIFIED",
                )
                _insert_evidence(
                    conn,
                    player_id=player_id,
                    club_id=target_club_id,
                    membership_id=membership_id,
                    source="WIKIPEDIA",
                    evidence_type="CAREER_INFOBOX",
                    source_url=page_url,
                    source_revision=revision,
                    confidence=86,
                    payload=asdict(career),
                )
                imported_memberships += 1

            if imported_players % 100 == 0:
                conn.commit()

        conn.execute(
            """
            UPDATE import_runs SET status='COMPLETED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, skipped_count=? WHERE id=?
            """,
            (imported_players, skipped, run_id),
        )
        conn.execute(
            "UPDATE clubs SET last_imported_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (club_id,),
        )
        conn.commit()
        rebuild_pair_stats(conn)
        return {
            "pages": len(members),
            "players": imported_players,
            "memberships": imported_memberships,
            "skipped": skipped,
            "run_id": int(run_id),
        }
    except Exception as exc:
        conn.rollback()
        conn.execute(
            """
            UPDATE import_runs SET status='FAILED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, skipped_count=?, error_message=? WHERE id=?
            """,
            (imported_players, skipped, str(exc), run_id),
        )
        conn.commit()
        raise


def auto_verify_by_evidence(
    conn: sqlite3.Connection,
    min_confidence: int = 70,
    min_sources: int = 1,
) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT m.id,
               MAX(COALESCE(se.confidence, m.confidence, 0)) AS best_confidence,
               COUNT(DISTINCT COALESCE(se.source, m.source)) AS source_count
        FROM memberships m
        LEFT JOIN source_evidence se ON se.membership_id=m.id
        WHERE m.status!='REJECTED'
        GROUP BY m.id
        HAVING best_confidence >= ? AND source_count >= ?
        """,
        (min_confidence, min_sources),
    ).fetchall()
    ids = [int(row["id"]) for row in rows]
    # SQLite'ın parametre sınırı nedeniyle güncellemeler parçalara bölünür.
    player_ids: set[int] = set()
    for start in range(0, len(ids), _SQL_BATCH):
        batch = ids[start:start + _SQL_BATCH]
        marks = ",".join("?" for _ in batch)
        conn.execute(
            f"UPDATE memberships SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id IN ({marks})",
            batch,
        )
        player_ids.update(
            int(row["player_id"])
            for row in conn.execute(
                f"SELECT DISTINCT player_id FROM memberships WHERE id IN ({marks})", batch
            )
        )
    ordered_players = sorted(player_ids)
    for start in range(0, len(ordered_players), _SQL_BATCH):
        batch = ordered_players[start:start + _SQL_BATCH]
        pmarks = ",".join("?" for _ in batch)
        conn.execute(
            f"UPDATE players SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id IN ({pmarks})",
            batch,
        )
    conn.commit()
    rebuild_pair_stats(conn)
    return {"verified_memberships": len(ids)}


def collection_report(conn: sqlite3.Connection) -> dict[str, Any]:
    source_rows = [
        dict(row)
        for row in conn.execute(
            """
            SELECT source,
                   COUNT(DISTINCT player_id) AS players,
                   COUNT(*) AS memberships,
                   SUM(CASE WHEN status='VERIFIED' THEN 1 ELSE 0 END) AS verified
            FROM memberships
            GROUP BY source
            ORDER BY memberships DESC
            """
        )
    ]
    return {
        "generated_at": _utc_now(),
        "summary": {
            "clubs": int(conn.execute("SELECT COUNT(*) FROM clubs WHERE active=1").fetchone()[0]),
            "players": int(conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]),
            "verified_players": int(conn.execute("SELECT COUNT(*) FROM players WHERE status='VERIFIED'").fetchone()[0]),
            "memberships": int(conn.execute("SELECT COUNT(*) FROM memberships").fetchone()[0]),
            "verified_memberships": int(conn.execute("SELECT COUNT(*) FROM memberships WHERE status='VERIFIED'").fetchone()[0]),
            "evidence": int(conn.execute("SELECT COUNT(*) FROM source_evidence").fetchone()[0]),
            "playable_pairs": int(conn.execute("SELECT COUNT(*) FROM club_pair_stats WHERE verified_player_count>0").fetchone()[0]),
            "strong_pairs": int(conn.execute("SELECT COUNT(*) FROM club_pair_stats WHERE verified_player_count>=3").fetchone()[0]),
        },
        "sources": source_rows,
        "clubs_without_wikipedia_category": [
            dict(row)
            for row in conn.execute(
                """
                SELECT slug, name, league FROM clubs
                WHERE active=1 AND wikipedia_category IS NULL
                ORDER BY priority, league, name
                """
            )
        ],
    }
