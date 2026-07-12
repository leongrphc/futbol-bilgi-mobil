from pathlib import Path

from src.db import connect, init_db, rebuild_pairs, seed_clubs
from src.normalize import normalize_name
from src.validate import validate_answer

ROOT = Path(__file__).resolve().parents[1]


def build_db(tmp_path):
    conn = connect(tmp_path / "validate.db")
    init_db(conn)
    seed_clubs(conn, ROOT / "config" / "clubs.json")
    clubs = {row["slug"]: int(row["id"]) for row in conn.execute("SELECT id, slug FROM clubs")}
    conn.execute(
        "INSERT INTO players(wikidata_qid, game_name, normalized_name, status) VALUES ('P1','Mesut Özil',?,'VERIFIED')",
        (normalize_name("Mesut Özil"),),
    )
    player_id = int(conn.execute("SELECT id FROM players WHERE wikidata_qid='P1'").fetchone()[0])
    conn.execute(
        "INSERT INTO player_aliases(player_id, alias, normalized_alias, accepted, source) VALUES (?,?,?,?,?)",
        (player_id, "Mesut Ozil", normalize_name("Mesut Ozil"), 1, "TEST"),
    )
    for slug in ["arsenal", "real-madrid"]:
        conn.execute(
            "INSERT INTO memberships(player_id, club_id, source, status, squad_level) VALUES (?,?,'TEST','VERIFIED','FIRST_TEAM')",
            (player_id, clubs[slug]),
        )
    conn.commit()
    rebuild_pairs(conn)
    return conn, clubs


def test_answer_accepts_turkish_character_normalization(tmp_path):
    conn, clubs = build_db(tmp_path)
    result = validate_answer(conn, clubs["arsenal"], clubs["real-madrid"], "Mesut Ozıl")
    assert result.is_correct
    assert result.player_name == "Mesut Özil"


def test_answer_does_not_fix_typo(tmp_path):
    conn, clubs = build_db(tmp_path)
    result = validate_answer(conn, clubs["arsenal"], clubs["real-madrid"], "Mesutt Ozil")
    assert not result.is_correct
    assert result.reason == "NO_MATCH"
