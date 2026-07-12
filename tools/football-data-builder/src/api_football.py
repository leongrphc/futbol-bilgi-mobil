from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

BASE_URL = "https://v3.football.api-sports.io"


@dataclass(frozen=True)
class ApiTeamCandidate:
    id: int
    name: str
    country: str | None
    logo: str | None


@dataclass(frozen=True)
class ApiSquadPlayer:
    id: int
    name: str
    age: int | None
    number: int | None
    position: str | None
    photo: str | None
    raw: dict[str, Any]


class ApiFootballClient:
    """Minimal API-Football v3 client.

    The free plan is rate-limited, so callers should pass a request budget and
    persist resolved team IDs between runs.
    """

    def __init__(self, api_key: str, timeout: int = 45, pause_seconds: float = 0.25):
        if not api_key:
            raise ValueError("API_FOOTBALL_KEY ortam değişkenini tanımlayın.")
        self.timeout = timeout
        self.pause_seconds = pause_seconds
        self.session = requests.Session()
        self.session.headers.update({
            "x-apisports-key": api_key,
            "Accept": "application/json",
        })
        self.requests_used = 0

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        response = self.session.get(f"{BASE_URL}{path}", params=params, timeout=self.timeout)
        self.requests_used += 1
        if response.status_code == 429:
            raise RuntimeError("API-Football günlük/dakikalık istek kotası doldu.")
        response.raise_for_status()
        payload = response.json()
        errors = payload.get("errors")
        if errors:
            raise RuntimeError(f"API-Football hata döndürdü: {errors}")
        time.sleep(self.pause_seconds)
        return payload

    def search_teams(self, term: str) -> list[ApiTeamCandidate]:
        payload = self._get("/teams", {"search": term})
        result: list[ApiTeamCandidate] = []
        for item in payload.get("response", []):
            team = item.get("team", {})
            if not team.get("id") or not team.get("name"):
                continue
            result.append(ApiTeamCandidate(
                id=int(team["id"]),
                name=str(team["name"]),
                country=item.get("country") or team.get("country"),
                logo=team.get("logo"),
            ))
        return result

    def current_squad(self, team_id: int) -> list[ApiSquadPlayer]:
        payload = self._get("/players/squads", {"team": int(team_id)})
        response = payload.get("response", [])
        if not response:
            return []
        players = response[0].get("players", [])
        result: list[ApiSquadPlayer] = []
        for player in players:
            if not player.get("id") or not player.get("name"):
                continue
            result.append(ApiSquadPlayer(
                id=int(player["id"]),
                name=str(player["name"]),
                age=int(player["age"]) if player.get("age") is not None else None,
                number=int(player["number"]) if player.get("number") is not None else None,
                position=player.get("position"),
                photo=player.get("photo"),
                raw=player,
            ))
        return result

    def team_transfers(self, team_id: int) -> list[dict[str, Any]]:
        payload = self._get("/transfers", {"team": int(team_id)})
        return list(payload.get("response", []))
