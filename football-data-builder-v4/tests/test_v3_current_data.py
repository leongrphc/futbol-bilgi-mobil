from __future__ import annotations

import json
from pathlib import Path

from src.api_football import ApiSquadPlayer
from src.current_sync import apply_manual_overrides, sync_current_squad
from src.db import connect, init_db, rebuild_pairs, seed_clubs
from src.validate import validate_answer

ROOT = Path(__file__).resolve().parents[1]


class FakeApiClient:
    def __init__(self, players):
        self.players = players
        self.requests_used = 0

    def current_squad(self, team_id: int):
        self.requests_used += 1
        return self.players


def make_db(tmp_path):
    conn = connect(tmp_path / "football.db")
    init_db(conn)
    seed_clubs(conn, ROOT / "config" / "clubs.json")
    return conn


def test_extended_club_pool_has_more_than_100_clubs(tmp_path):
    conn = make_db(tmp_path)
    count = conn.execute("SELECT COUNT(*) FROM clubs WHERE active=1").fetchone()[0]
    assert count >= 100


def test_ugurcan_override_is_valid_for_trabzonspor_galatasaray(tmp_path):
    conn = make_db(tmp_path)
    result = apply_manual_overrides(conn, ROOT / "config" / "manual_overrides.json")
    assert result == {"players": 3, "memberships": 2}
    accepted_aliases = {
        row["normalized_alias"]
        for row in conn.execute(
            """
            SELECT pa.normalized_alias
            FROM player_aliases pa
            JOIN players p ON p.id=pa.player_id
            WHERE p.wikidata_qid IN ('Q507815', 'Q75857')
              AND pa.accepted=1
            """
        )
    }
    assert {"alex", "alex de souza", "sahin"} <= accepted_aliases
    assert "nuri" not in accepted_aliases
    rebuild_pairs(conn)
    clubs = {
        row["slug"]: row["id"]
        for row in conn.execute("SELECT id, slug FROM clubs")
    }
    answer = validate_answer(
        conn,
        clubs["trabzonspor"],
        clubs["galatasaray"],
        "Ugurcan Cakir",
    )
    assert answer.is_correct is True
    typo = validate_answer(
        conn,
        clubs["trabzonspor"],
        clubs["galatasaray"],
        "Ugurcann Cakir",
    )
    assert typo.is_correct is False


def test_current_squad_sync_creates_verified_current_membership(tmp_path):
    conn = make_db(tmp_path)
    club = conn.execute("SELECT * FROM clubs WHERE slug='galatasaray'").fetchone()
    player = ApiSquadPlayer(
        id=999001,
        name="Test Current Player",
        age=25,
        number=10,
        position="Midfielder",
        photo=None,
        raw={"id": 999001, "name": "Test Current Player"},
    )
    result = sync_current_squad(conn, FakeApiClient([player]), club["id"], 645)
    assert result["imported"] == 1
    membership = conn.execute(
        """
        SELECT m.status, m.is_current, p.api_football_id, p.position
        FROM memberships m JOIN players p ON p.id=m.player_id
        WHERE m.club_id=? AND p.api_football_id=999001
        """,
        (club["id"],),
    ).fetchone()
    assert membership["status"] == "VERIFIED"
    assert membership["is_current"] == 1
    assert membership["position"] == "Midfielder"
