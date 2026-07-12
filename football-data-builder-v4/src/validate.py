from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from .normalize import normalize_name


@dataclass(frozen=True)
class AnswerValidation:
    is_correct: bool
    normalized_answer: str
    player_id: int | None = None
    player_name: str | None = None
    matched_by: str | None = None
    reason: str = "NO_MATCH"


def validate_answer(
    conn: sqlite3.Connection,
    club_a_id: int,
    club_b_id: int,
    answer: str,
) -> AnswerValidation:
    normalized = normalize_name(answer)
    if not normalized:
        return AnswerValidation(False, normalized, reason="EMPTY")

    low, high = sorted((int(club_a_id), int(club_b_id)))
    rows = conn.execute(
        """
        SELECT p.id, p.game_name, p.normalized_name,
               CASE WHEN p.normalized_name=? THEN 'GAME_NAME' ELSE 'ALIAS' END matched_by
        FROM club_pair_players cpp
        JOIN players p ON p.id=cpp.player_id
        LEFT JOIN player_aliases pa
          ON pa.player_id=p.id
         AND pa.accepted=1
         AND pa.normalized_alias=?
        WHERE cpp.club_low_id=?
          AND cpp.club_high_id=?
          AND (p.normalized_name=? OR pa.id IS NOT NULL)
        GROUP BY p.id, p.game_name, p.normalized_name
        """,
        (normalized, normalized, low, high, normalized),
    ).fetchall()

    if len(rows) == 1:
        row = rows[0]
        return AnswerValidation(
            True,
            normalized,
            player_id=int(row["id"]),
            player_name=str(row["game_name"]),
            matched_by=str(row["matched_by"]),
            reason="MATCH",
        )
    if len(rows) > 1:
        return AnswerValidation(False, normalized, reason="AMBIGUOUS")
    return AnswerValidation(False, normalized, reason="NO_MATCH")
