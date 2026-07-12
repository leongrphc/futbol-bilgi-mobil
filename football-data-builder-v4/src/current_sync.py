from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .api_football import ApiFootballClient, ApiSquadPlayer, ApiTeamCandidate
from .db import insert_aliases, rebuild_pair_stats
from .normalize import normalize_name


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _safe_slug(value: str) -> str:
    value = normalize_name(value).replace(" ", "-")
    return re.sub(r"[^a-z0-9-]", "", value).strip("-") or "player"


def _select_api_team_candidate(
    club: sqlite3.Row,
    candidates: list[ApiTeamCandidate],
) -> ApiTeamCandidate | None:
    if not candidates:
        return None
    wanted = normalize_name(club["api_football_search"] or club["name"])
    country = normalize_name(club["country"] or "")
    scored: list[tuple[int, ApiTeamCandidate]] = []
    for candidate in candidates:
        candidate_name = normalize_name(candidate.name)
        candidate_country = normalize_name(candidate.country or "")
        score = 0
        if candidate_name == wanted:
            score += 100
        elif candidate_name in wanted or wanted in candidate_name:
            score += 50
        if country and candidate_country and country == candidate_country:
            score += 20
        scored.append((score, candidate))
    scored.sort(key=lambda item: (-item[0], item[1].name))
    return scored[0][1] if scored and scored[0][0] >= 50 else None


def resolve_api_club(
    conn: sqlite3.Connection,
    client: ApiFootballClient,
    club_id: int,
    *,
    force: bool = False,
) -> dict[str, Any]:
    club = conn.execute("SELECT * FROM clubs WHERE id=?", (club_id,)).fetchone()
    if club is None:
        raise ValueError(f"Kulüp bulunamadı: {club_id}")
    if club["api_football_id"] and not force:
        return {
            "club_id": club_id,
            "club": club["name"],
            "api_football_id": int(club["api_football_id"]),
            "status": "ALREADY_RESOLVED",
        }
    candidates = client.search_teams(club["api_football_search"] or club["name"])
    selected = _select_api_team_candidate(club, candidates)
    if selected is None:
        conn.execute(
            "UPDATE clubs SET api_id_status='NEEDS_REVIEW', updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (club_id,),
        )
        conn.commit()
        return {
            "club_id": club_id,
            "club": club["name"],
            "api_football_id": None,
            "status": "NEEDS_REVIEW",
            "candidates": [asdict(item) for item in candidates],
        }
    conn.execute(
        """
        UPDATE clubs
        SET api_football_id=?, api_id_status='RESOLVED', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (selected.id, club_id),
    )
    conn.commit()
    return {
        "club_id": club_id,
        "club": club["name"],
        "api_football_id": selected.id,
        "status": "RESOLVED",
        "candidate": asdict(selected),
    }


def _find_or_create_api_player(
    conn: sqlite3.Connection,
    player: ApiSquadPlayer,
) -> int:
    existing = conn.execute(
        "SELECT id FROM players WHERE api_football_id=?", (player.id,)
    ).fetchone()
    normalized = normalize_name(player.name)
    if existing is None:
        same_name = conn.execute(
            "SELECT id FROM players WHERE normalized_name=? ORDER BY id", (normalized,)
        ).fetchall()
        if len(same_name) == 1:
            player_id = int(same_name[0]["id"])
            conn.execute(
                """
                UPDATE players
                SET api_football_id=?, image_url=COALESCE(image_url, ?),
                    position=COALESCE(?, position), status='VERIFIED',
                    last_seen_current_at=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (player.id, player.photo, player.position, _utc_now(), player_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO players(
                    api_football_id, game_name, normalized_name, image_url,
                    position, last_seen_current_at, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED')
                """,
                (player.id, player.name, normalized, player.photo, player.position, _utc_now()),
            )
            player_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    else:
        player_id = int(existing["id"])
        conn.execute(
            """
            UPDATE players
            SET image_url=COALESCE(image_url, ?), position=COALESCE(?, position),
                last_seen_current_at=?, status='VERIFIED', updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (player.photo, player.position, _utc_now(), player_id),
        )

    # The display/game name is always a valid answer. Additional API names can
    # also be accepted because API-Football returns the normal football name.
    insert_aliases(
        conn,
        player_id,
        [player.name],
        normalize_name,
        source="API_FOOTBALL",
        accepted=True,
    )
    return player_id


def sync_current_squad(
    conn: sqlite3.Connection,
    client: ApiFootballClient,
    club_id: int,
    api_team_id: int,
) -> dict[str, int]:
    run_id = conn.execute(
        "INSERT INTO import_runs(source, club_id) VALUES ('API_FOOTBALL_SQUAD', ?)",
        (club_id,),
    ).lastrowid
    conn.commit()
    imported = 0
    try:
        players = client.current_squad(api_team_id)
        now = _utc_now()
        # A player missing from a later snapshot remains a valid historical
        # membership, but is no longer marked as current.
        conn.execute(
            """
            UPDATE memberships
            SET is_current=0, updated_at=CURRENT_TIMESTAMP
            WHERE club_id=? AND source='API_FOOTBALL_SQUAD'
            """,
            (club_id,),
        )
        for player in players:
            player_id = _find_or_create_api_player(conn, player)
            conn.execute(
                """
                INSERT INTO memberships(
                    player_id, club_id, membership_type, squad_level,
                    source, status, source_payload, is_current, last_seen_at
                ) VALUES (?, ?, 'CURRENT_SQUAD', 'FIRST_TEAM',
                          'API_FOOTBALL_SQUAD', 'VERIFIED', ?, 1, ?)
                ON CONFLICT DO UPDATE SET
                    status='VERIFIED', is_current=1, last_seen_at=excluded.last_seen_at,
                    source_payload=excluded.source_payload, updated_at=CURRENT_TIMESTAMP
                """,
                (player_id, club_id, json.dumps(player.raw, ensure_ascii=False), now),
            )
            imported += 1
        conn.execute(
            """
            UPDATE import_runs
            SET status='COMPLETED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?
            WHERE id=?
            """,
            (imported, run_id),
        )
        conn.execute(
            "UPDATE clubs SET last_imported_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (club_id,),
        )
        conn.commit()
        rebuild_pair_stats(conn)
        return {"imported": imported, "run_id": int(run_id)}
    except Exception as exc:
        conn.rollback()
        conn.execute(
            """
            UPDATE import_runs SET status='FAILED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, error_message=? WHERE id=?
            """,
            (imported, str(exc), run_id),
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


def _api_player_identity(conn: sqlite3.Connection, api_id: int, name: str) -> int:
    row = conn.execute("SELECT id FROM players WHERE api_football_id=?", (api_id,)).fetchone()
    if row:
        return int(row["id"])
    normalized = normalize_name(name)
    candidates = conn.execute(
        "SELECT id FROM players WHERE normalized_name=? ORDER BY id", (normalized,)
    ).fetchall()
    if len(candidates) == 1:
        player_id = int(candidates[0]["id"])
        conn.execute(
            "UPDATE players SET api_football_id=?, status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (api_id, player_id),
        )
    else:
        conn.execute(
            """
            INSERT INTO players(api_football_id, game_name, normalized_name, status)
            VALUES (?, ?, ?, 'VERIFIED')
            """,
            (api_id, name, normalized),
        )
        player_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    insert_aliases(conn, player_id, [name], normalize_name, source="API_FOOTBALL", accepted=True)
    return player_id


def sync_team_transfers(
    conn: sqlite3.Connection,
    client: ApiFootballClient,
    club_id: int,
    api_team_id: int,
) -> dict[str, int]:
    """Import transfer relations involving selected clubs.

    API-Football transfer rows are used as a supplemental source. They do not
    need to provide a complete career: any selected in/out team relation is
    enough to make that club a valid historical membership.
    """
    run_id = conn.execute(
        "INSERT INTO import_runs(source, club_id) VALUES ('API_FOOTBALL_TRANSFERS', ?)",
        (club_id,),
    ).lastrowid
    conn.commit()
    imported = 0
    try:
        response = client.team_transfers(api_team_id)
        club_by_api_id = {
            int(row["api_football_id"]): int(row["id"])
            for row in conn.execute(
                "SELECT id, api_football_id FROM clubs WHERE api_football_id IS NOT NULL"
            )
        }
        for item in response:
            player_data = item.get("player") or {}
            if not player_data.get("id") or not player_data.get("name"):
                continue
            player_id = _api_player_identity(
                conn, int(player_data["id"]), str(player_data["name"])
            )
            for transfer in item.get("transfers") or []:
                transfer_date = transfer.get("date")
                transfer_type = str(transfer.get("type") or "UNKNOWN")
                membership_type = "LOAN" if "loan" in transfer_type.casefold() else "TRANSFER"
                teams = transfer.get("teams") or {}
                for direction in ("in", "out"):
                    team = teams.get(direction) or {}
                    team_api_id = team.get("id")
                    if not team_api_id or int(team_api_id) not in club_by_api_id:
                        continue
                    selected_club_id = club_by_api_id[int(team_api_id)]
                    start_date = transfer_date if direction == "in" else None
                    end_date = transfer_date if direction == "out" else None
                    conn.execute(
                        """
                        INSERT INTO memberships(
                            player_id, club_id, start_date, end_date,
                            membership_type, squad_level, source, status,
                            source_payload, is_current, last_seen_at
                        ) VALUES (?, ?, ?, ?, ?, 'FIRST_TEAM',
                                  'API_FOOTBALL_TRANSFERS', 'VERIFIED', ?, 0, ?)
                        ON CONFLICT DO UPDATE SET
                            status='VERIFIED', source_payload=excluded.source_payload,
                            last_seen_at=excluded.last_seen_at, updated_at=CURRENT_TIMESTAMP
                        """,
                        (
                            player_id,
                            selected_club_id,
                            start_date,
                            end_date,
                            membership_type,
                            json.dumps(transfer, ensure_ascii=False),
                            _utc_now(),
                        ),
                    )
                    imported += 1
        conn.execute(
            """
            UPDATE import_runs SET status='COMPLETED', finished_at=CURRENT_TIMESTAMP,
                imported_count=? WHERE id=?
            """,
            (imported, run_id),
        )
        conn.commit()
        rebuild_pair_stats(conn)
        return {"imported": imported, "run_id": int(run_id)}
    except Exception as exc:
        conn.rollback()
        conn.execute(
            """
            UPDATE import_runs SET status='FAILED', finished_at=CURRENT_TIMESTAMP,
                imported_count=?, error_message=? WHERE id=?
            """,
            (imported, str(exc), run_id),
        )
        conn.commit()
        raise


def apply_manual_overrides(conn: sqlite3.Connection, file_path: str | Path) -> dict[str, int]:
    data = json.loads(Path(file_path).read_text(encoding="utf-8"))
    players_count = 0
    memberships_count = 0
    clubs = {
        str(row["slug"]): int(row["id"])
        for row in conn.execute("SELECT id, slug FROM clubs")
    }
    for entry in data:
        name = str(entry["name"])
        normalized = normalize_name(name)
        qid = entry.get("wikidata_qid")
        api_id = entry.get("api_football_id")
        player = None
        if qid:
            player = conn.execute("SELECT id FROM players WHERE wikidata_qid=?", (qid,)).fetchone()
        if player is None and api_id:
            player = conn.execute("SELECT id FROM players WHERE api_football_id=?", (api_id,)).fetchone()
        if player is None:
            same = conn.execute(
                "SELECT id FROM players WHERE normalized_name=? ORDER BY id", (normalized,)
            ).fetchall()
            if len(same) == 1:
                player = same[0]
        if player is None:
            synthetic_qid = qid or f"MANUAL-{_safe_slug(name)}"
            conn.execute(
                """
                INSERT INTO players(
                    wikidata_qid, api_football_id, game_name, normalized_name,
                    birth_date, position, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED')
                """,
                (
                    synthetic_qid,
                    api_id,
                    name,
                    normalized,
                    entry.get("birth_date"),
                    entry.get("position"),
                ),
            )
            player_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        else:
            player_id = int(player["id"])
            conn.execute(
                """
                UPDATE players SET
                    wikidata_qid=COALESCE(wikidata_qid, ?),
                    api_football_id=COALESCE(api_football_id, ?),
                    game_name=?, normalized_name=?, birth_date=COALESCE(birth_date, ?),
                    position=COALESCE(?, position), status='VERIFIED',
                    updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (
                    qid,
                    api_id,
                    name,
                    normalized,
                    entry.get("birth_date"),
                    entry.get("position"),
                    player_id,
                ),
            )
        insert_aliases(
            conn,
            player_id,
            [name, *entry.get("aliases", [])],
            normalize_name,
            source="MANUAL",
            accepted=True,
        )
        players_count += 1
        for membership in entry.get("memberships", []):
            slug = membership["club"]
            if slug not in clubs:
                raise ValueError(f"Override içinde bilinmeyen kulüp: {slug}")
            conn.execute(
                """
                INSERT INTO memberships(
                    player_id, club_id, start_date, end_date,
                    membership_type, squad_level, source, status,
                    source_payload, is_current, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, 'FIRST_TEAM', 'MANUAL', 'VERIFIED', ?, ?, ?)
                ON CONFLICT DO UPDATE SET
                    status='VERIFIED', membership_type=excluded.membership_type,
                    is_current=excluded.is_current, last_seen_at=excluded.last_seen_at,
                    source_payload=excluded.source_payload, updated_at=CURRENT_TIMESTAMP
                """,
                (
                    player_id,
                    clubs[slug],
                    membership.get("start_date"),
                    membership.get("end_date"),
                    membership.get("membership_type", "PERMANENT"),
                    json.dumps(membership, ensure_ascii=False),
                    int(bool(membership.get("is_current"))),
                    _utc_now(),
                ),
            )
            memberships_count += 1
    conn.commit()
    rebuild_pair_stats(conn)
    return {"players": players_count, "memberships": memberships_count}


def freshness_report(conn: sqlite3.Connection) -> dict[str, Any]:
    summary = {
        "clubs": int(conn.execute("SELECT COUNT(*) FROM clubs WHERE active=1").fetchone()[0]),
        "players": int(conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]),
        "verified_players": int(conn.execute("SELECT COUNT(*) FROM players WHERE status='VERIFIED'").fetchone()[0]),
        "current_players": int(conn.execute("SELECT COUNT(DISTINCT player_id) FROM memberships WHERE is_current=1 AND status='VERIFIED'").fetchone()[0]),
        "memberships": int(conn.execute("SELECT COUNT(*) FROM memberships").fetchone()[0]),
        "playable_pairs": int(conn.execute("SELECT COUNT(*) FROM club_pair_stats WHERE verified_player_count>0").fetchone()[0]),
    }
    stale = [dict(row) for row in conn.execute(
        """
        SELECT slug, name, league, pool, api_football_id, last_imported_at
        FROM clubs
        WHERE active=1
        ORDER BY CASE WHEN last_imported_at IS NULL THEN 0 ELSE 1 END,
                 last_imported_at, priority, name
        """
    )]
    return {"generated_at": _utc_now(), "summary": summary, "clubs": stale}
