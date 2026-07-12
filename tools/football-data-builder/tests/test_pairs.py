import json
from pathlib import Path

from src.db import connect, init_db, rebuild_pairs, seed_clubs
from src.normalize import normalize_name

ROOT = Path(__file__).resolve().parents[1]


def test_verified_memberships_create_pair(tmp_path):
    conn = connect(tmp_path / "test.db")
    init_db(conn)
    seed_clubs(conn, ROOT / "config" / "clubs.json")
    clubs = {r["slug"]: r["id"] for r in conn.execute("SELECT id, slug FROM clubs")}
    conn.execute(
        "INSERT INTO players(wikidata_qid, game_name, normalized_name, status) VALUES ('X1','Mesut Özil',?,'VERIFIED')",
        (normalize_name("Mesut Özil"),),
    )
    player_id = conn.execute("SELECT id FROM players WHERE wikidata_qid='X1'").fetchone()[0]
    for slug in ["arsenal", "real-madrid"]:
        conn.execute(
            """INSERT INTO memberships(player_id, club_id, source, status, squad_level)
            VALUES (?, ?, 'TEST', 'VERIFIED', 'FIRST_TEAM')""",
            (player_id, clubs[slug]),
        )
    conn.commit()
    assert rebuild_pairs(conn) == 1
