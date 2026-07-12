from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    country TEXT,
    league TEXT,
    pool TEXT NOT NULL DEFAULT 'EXTENDED',
    priority INTEGER NOT NULL DEFAULT 2,
    wikidata_qid TEXT UNIQUE,
    wikidata_search TEXT,
    api_football_id INTEGER UNIQUE,
    api_football_search TEXT,
    api_id_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
    qid_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
    active INTEGER NOT NULL DEFAULT 1,
    last_imported_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wikidata_qid TEXT UNIQUE,
    api_football_id INTEGER UNIQUE,
    game_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    birth_date TEXT,
    image_url TEXT,
    position TEXT,
    last_seen_current_at TEXT,
    status TEXT NOT NULL DEFAULT 'IMPORTED',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_players_normalized_name
ON players(normalized_name);

CREATE TABLE IF NOT EXISTS player_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    UNIQUE(player_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_aliases_normalized
ON player_aliases(normalized_alias, accepted);

CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    start_date TEXT,
    end_date TEXT,
    membership_type TEXT NOT NULL DEFAULT 'UNKNOWN',
    squad_level TEXT NOT NULL DEFAULT 'FIRST_TEAM',
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IMPORTED',
    source_payload TEXT,
    is_current INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, club_id, start_date, end_date, source)
);

CREATE INDEX IF NOT EXISTS idx_memberships_review
ON memberships(status, club_id);

CREATE INDEX IF NOT EXISTS idx_memberships_player_club
ON memberships(player_id, club_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_identity
ON memberships(
    player_id,
    club_id,
    COALESCE(start_date, ''),
    COALESCE(end_date, ''),
    source
);

CREATE TABLE IF NOT EXISTS club_pair_players (
    club_low_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    club_high_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(club_low_id, club_high_id, player_id)
);

CREATE TABLE IF NOT EXISTS club_pair_stats (
    club_low_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    club_high_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    verified_player_count INTEGER NOT NULL DEFAULT 0,
    candidate_player_count INTEGER NOT NULL DEFAULT 0,
    coverage_status TEXT NOT NULL DEFAULT 'EMPTY',
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(club_low_id, club_high_id)
);

CREATE TABLE IF NOT EXISTS import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);


CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_run_id INTEGER REFERENCES import_runs(id) ON DELETE CASCADE,
    club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row["name"]) for row in conn.execute(f"PRAGMA table_info({table})")}


def _ensure_column(conn: sqlite3.Connection, table: str, definition: str) -> None:
    column = definition.split()[0]
    if column not in _column_names(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def migrate_db(conn: sqlite3.Connection) -> None:
    # Eski prototip veritabanlarını veri kaybetmeden v2 şemasına taşır.
    for definition in [
        "country TEXT",
        "league TEXT",
        "pool TEXT NOT NULL DEFAULT 'EXTENDED'",
        "priority INTEGER NOT NULL DEFAULT 2",
        "wikidata_search TEXT",
        "api_football_id INTEGER",
        "api_football_search TEXT",
        "api_id_status TEXT NOT NULL DEFAULT 'UNRESOLVED'",
        "qid_status TEXT NOT NULL DEFAULT 'UNRESOLVED'",
        "last_imported_at TEXT",
        "wikipedia_title TEXT",
        "wikipedia_category TEXT",
        "updated_at TEXT",
    ]:
        _ensure_column(conn, "clubs", definition)

    for definition in [
        "api_football_id INTEGER",
        "position TEXT",
        "last_seen_current_at TEXT",
        "wikipedia_page_id INTEGER",
        "wikipedia_title TEXT",
        "last_enriched_at TEXT",
    ]:
        _ensure_column(conn, "players", definition)

    for definition in [
        "is_current INTEGER NOT NULL DEFAULT 0",
        "last_seen_at TEXT",
        "confidence INTEGER NOT NULL DEFAULT 50",
    ]:
        _ensure_column(conn, "memberships", definition)

    for definition in [
        "club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL",
        "skipped_count INTEGER NOT NULL DEFAULT 0",
    ]:
        _ensure_column(conn, "import_runs", definition)

    conn.execute(
        "UPDATE clubs SET qid_status='RESOLVED' WHERE wikidata_qid IS NOT NULL AND (qid_status IS NULL OR qid_status='UNRESOLVED')"
    )
    conn.execute("UPDATE clubs SET updated_at=COALESCE(updated_at, CURRENT_TIMESTAMP)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_api_football_id ON clubs(api_football_id) WHERE api_football_id IS NOT NULL")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_players_api_football_id ON players(api_football_id) WHERE api_football_id IS NOT NULL")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memberships_current ON memberships(club_id, is_current, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_players_wikipedia_page_id ON players(wikipedia_page_id) WHERE wikipedia_page_id IS NOT NULL")
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS source_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
        membership_id INTEGER REFERENCES memberships(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        source_url TEXT,
        source_revision TEXT NOT NULL DEFAULT '',
        confidence INTEGER NOT NULL DEFAULT 50,
        payload TEXT,
        payload_hash TEXT,
        collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, club_id, source, evidence_type, source_revision)
    );

    CREATE INDEX IF NOT EXISTS idx_source_evidence_player_club
    ON source_evidence(player_id, club_id, source);

    CREATE TABLE IF NOT EXISTS collection_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        source TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_run_at TEXT,
        last_error TEXT,
        payload TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_type, source, entity_type, entity_key)
    );

    CREATE INDEX IF NOT EXISTS idx_collection_queue_pending
    ON collection_queue(status, priority, next_run_at);

    CREATE TABLE IF NOT EXISTS source_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        revision TEXT,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, entity_type, entity_key, payload_hash)
    );
    """)
    conn.commit()


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    migrate_db(conn)
    conn.commit()


def seed_clubs(conn: sqlite3.Connection, config_path: str | Path) -> int:
    clubs = json.loads(Path(config_path).read_text(encoding="utf-8"))
    for club in clubs:
        qid = club.get("wikidata_qid")
        conn.execute(
            """
            INSERT INTO clubs(
                slug, name, country, league, pool, priority,
                wikidata_qid, wikidata_search, api_football_id, api_football_search,
                wikipedia_title, wikipedia_category,
                qid_status, api_id_status, active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                name=excluded.name,
                country=excluded.country,
                league=excluded.league,
                pool=excluded.pool,
                priority=excluded.priority,
                wikidata_qid=COALESCE(excluded.wikidata_qid, clubs.wikidata_qid),
                wikidata_search=excluded.wikidata_search,
                api_football_id=COALESCE(excluded.api_football_id, clubs.api_football_id),
                api_football_search=excluded.api_football_search,
                wikipedia_title=COALESCE(excluded.wikipedia_title, clubs.wikipedia_title),
                wikipedia_category=COALESCE(excluded.wikipedia_category, clubs.wikipedia_category),
                api_id_status=CASE
                    WHEN COALESCE(excluded.api_football_id, clubs.api_football_id) IS NOT NULL THEN 'RESOLVED'
                    ELSE clubs.api_id_status
                END,
                qid_status=CASE
                    WHEN COALESCE(excluded.wikidata_qid, clubs.wikidata_qid) IS NOT NULL THEN 'RESOLVED'
                    ELSE clubs.qid_status
                END,
                active=excluded.active,
                updated_at=CURRENT_TIMESTAMP
            """,
            (
                club["slug"],
                club["name"],
                club.get("country"),
                club.get("league"),
                club.get("pool", "EXTENDED"),
                int(club.get("priority", 2)),
                qid,
                club.get("wikidata_search") or club["name"],
                club.get("api_football_id"),
                club.get("api_football_search") or club["name"],
                club.get("wikipedia_title"),
                club.get("wikipedia_category"),
                "RESOLVED" if qid else "UNRESOLVED",
                "RESOLVED" if club.get("api_football_id") else "UNRESOLVED",
                int(club.get("active", True)),
            ),
        )
    conn.commit()
    return len(clubs)


def rebuild_pair_stats(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM club_pair_stats")
    conn.execute(
        """
        INSERT INTO club_pair_stats(
            club_low_id, club_high_id,
            verified_player_count, candidate_player_count,
            coverage_status
        )
        SELECT
            a.id,
            b.id,
            COALESCE(v.verified_count, 0),
            COALESCE(c.candidate_count, 0),
            CASE
                WHEN COALESCE(v.verified_count, 0) >= 3 THEN 'GOOD'
                WHEN COALESCE(v.verified_count, 0) >= 1 THEN 'PLAYABLE'
                WHEN COALESCE(c.candidate_count, 0) >= 1 THEN 'NEEDS_REVIEW'
                ELSE 'EMPTY'
            END
        FROM clubs a
        JOIN clubs b ON a.id < b.id
        LEFT JOIN (
            SELECT club_low_id, club_high_id, COUNT(*) verified_count
            FROM club_pair_players
            GROUP BY club_low_id, club_high_id
        ) v ON v.club_low_id=a.id AND v.club_high_id=b.id
        LEFT JOIN (
            SELECT
                CASE WHEN m1.club_id < m2.club_id THEN m1.club_id ELSE m2.club_id END club_low_id,
                CASE WHEN m1.club_id < m2.club_id THEN m2.club_id ELSE m1.club_id END club_high_id,
                COUNT(DISTINCT m1.player_id) candidate_count
            FROM memberships m1
            JOIN memberships m2
              ON m1.player_id=m2.player_id
             AND m1.club_id < m2.club_id
            WHERE m1.status IN ('IMPORTED','VERIFIED')
              AND m2.status IN ('IMPORTED','VERIFIED')
              AND m1.squad_level='FIRST_TEAM'
              AND m2.squad_level='FIRST_TEAM'
            GROUP BY 1,2
        ) c ON c.club_low_id=a.id AND c.club_high_id=b.id
        WHERE a.active=1 AND b.active=1
        """
    )
    conn.commit()
    return int(conn.execute("SELECT COUNT(*) FROM club_pair_stats").fetchone()[0])


def rebuild_pairs(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM club_pair_players")
    conn.execute(
        """
        INSERT INTO club_pair_players(club_low_id, club_high_id, player_id)
        SELECT
            CASE WHEN a.club_id < b.club_id THEN a.club_id ELSE b.club_id END,
            CASE WHEN a.club_id < b.club_id THEN b.club_id ELSE a.club_id END,
            a.player_id
        FROM memberships a
        JOIN memberships b
          ON a.player_id = b.player_id
         AND a.club_id < b.club_id
        JOIN players p ON p.id = a.player_id
        WHERE a.status = 'VERIFIED'
          AND b.status = 'VERIFIED'
          AND a.squad_level = 'FIRST_TEAM'
          AND b.squad_level = 'FIRST_TEAM'
          AND p.status = 'VERIFIED'
        GROUP BY 1, 2, 3
        """
    )
    conn.commit()
    rebuild_pair_stats(conn)
    return int(conn.execute("SELECT COUNT(*) FROM club_pair_players").fetchone()[0])


def insert_aliases(
    conn: sqlite3.Connection,
    player_id: int,
    aliases: Iterable[str],
    normalize,
    source: str = "WIKIDATA",
    accepted: bool = False,
) -> None:
    for alias in aliases:
        normalized = normalize(alias)
        if not normalized:
            continue
        conn.execute(
            """
            INSERT INTO player_aliases
            (player_id, alias, normalized_alias, accepted, source)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(player_id, normalized_alias) DO UPDATE SET
                alias=CASE
                    WHEN player_aliases.source='MANUAL' THEN player_aliases.alias
                    ELSE excluded.alias
                END,
                accepted=MAX(player_aliases.accepted, excluded.accepted)
            """,
            (player_id, alias, normalized, int(accepted), source),
        )
