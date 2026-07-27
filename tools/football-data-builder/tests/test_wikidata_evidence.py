from __future__ import annotations

import json
from pathlib import Path

from src.collector import (
    WIKIDATA_MEMBERSHIP_CONFIDENCE,
    auto_verify_by_evidence,
    backfill_wikidata_evidence,
)
from src.db import connect, init_db, seed_clubs


CLUBS = [
    {"slug": "arsenal", "name": "Arsenal", "wikidata_qid": "Q9617"},
    {"slug": "real-madrid", "name": "Real Madrid", "wikidata_qid": "Q8682"},
]


def _prepare(tmp_path: Path):
    config = tmp_path / "clubs.json"
    config.write_text(json.dumps(CLUBS), encoding="utf-8")
    conn = connect(tmp_path / "football.db")
    init_db(conn)
    seed_clubs(conn, config)
    conn.execute(
        """
        INSERT INTO players(wikidata_qid, game_name, normalized_name, status)
        VALUES ('Q1000', 'Test Player', 'test player', 'IMPORTED')
        """
    )
    player_id = int(conn.execute("SELECT id FROM players").fetchone()[0])
    for slug in ("arsenal", "real-madrid"):
        club_id = int(conn.execute("SELECT id FROM clubs WHERE slug=?", (slug,)).fetchone()[0])
        conn.execute(
            """
            INSERT INTO memberships(
                player_id, club_id, start_date, end_date, source, status, source_payload
            ) VALUES (?, ?, '2010-01-01', '2015-01-01', 'WIKIDATA', 'IMPORTED', ?)
            """,
            (player_id, club_id, json.dumps({"player_qid": "Q1000"})),
        )
    conn.commit()
    return conn, player_id


def test_backfill_writes_evidence_and_raises_confidence(tmp_path: Path) -> None:
    conn, player_id = _prepare(tmp_path)

    result = backfill_wikidata_evidence(conn)
    assert result["evidence_written"] == 2

    rows = conn.execute(
        "SELECT source, evidence_type, confidence, source_url FROM source_evidence"
    ).fetchall()
    assert len(rows) == 2
    for row in rows:
        assert row["source"] == "WIKIDATA"
        assert row["evidence_type"] == "P54_MEMBERSHIP"
        assert row["confidence"] == WIKIDATA_MEMBERSHIP_CONFIDENCE
        assert row["source_url"].endswith("Q1000")

    confidences = [
        int(row[0])
        for row in conn.execute("SELECT confidence FROM memberships WHERE player_id=?", (player_id,))
    ]
    assert confidences == [WIKIDATA_MEMBERSHIP_CONFIDENCE] * 2


def test_backfill_is_idempotent(tmp_path: Path) -> None:
    conn, _ = _prepare(tmp_path)
    assert backfill_wikidata_evidence(conn)["evidence_written"] == 2
    assert backfill_wikidata_evidence(conn)["evidence_written"] == 0
    assert int(conn.execute("SELECT COUNT(*) FROM source_evidence").fetchone()[0]) == 2


def test_auto_verify_promotes_backfilled_memberships(tmp_path: Path) -> None:
    conn, player_id = _prepare(tmp_path)
    backfill_wikidata_evidence(conn)

    result = auto_verify_by_evidence(conn, min_confidence=70, min_sources=1)
    assert result["verified_memberships"] == 2

    statuses = {
        row[0]
        for row in conn.execute("SELECT status FROM memberships WHERE player_id=?", (player_id,))
    }
    assert statuses == {"VERIFIED"}
    assert conn.execute("SELECT status FROM players WHERE id=?", (player_id,)).fetchone()[0] == "VERIFIED"


def test_auto_verify_handles_more_rows_than_sql_variable_limit(tmp_path: Path) -> None:
    """SQLite parametre sınırı aşıldığında toplu güncelleme parçalanmalı."""
    conn, _ = _prepare(tmp_path)
    club_id = int(conn.execute("SELECT id FROM clubs WHERE slug='arsenal'").fetchone()[0])
    for index in range(1200):
        conn.execute(
            """
            INSERT INTO players(wikidata_qid, game_name, normalized_name, status)
            VALUES (?, ?, ?, 'IMPORTED')
            """,
            (f"Q{index + 5000}", f"Bulk {index}", f"bulk {index}"),
        )
        bulk_player_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        conn.execute(
            """
            INSERT INTO memberships(
                player_id, club_id, start_date, end_date, source, status, source_payload, confidence
            ) VALUES (?, ?, '2001-01-01', '2002-01-01', 'WIKIDATA', 'IMPORTED', '{}', 70)
            """,
            (bulk_player_id, club_id),
        )
    conn.commit()

    result = auto_verify_by_evidence(conn, min_confidence=70, min_sources=1)
    assert result["verified_memberships"] == 1200
    remaining = int(
        conn.execute("SELECT COUNT(*) FROM memberships WHERE status!='VERIFIED'").fetchone()[0]
    )
    assert remaining == 2  # kanıtsız iki Wikidata üyeliği confidence=50 ile bekler
