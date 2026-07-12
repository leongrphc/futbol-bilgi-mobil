from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Iterator

import requests

from .normalize import normalize_name

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
ENTITY_ENDPOINT = "https://www.wikidata.org/w/api.php"


@dataclass(frozen=True)
class WikidataMembership:
    player_qid: str
    player_label: str
    birth_date: str | None
    image_url: str | None
    start_date: str | None
    end_date: str | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class WikidataSearchCandidate:
    qid: str
    label: str
    description: str
    url: str
    score: int


class WikidataClient:
    def __init__(self, user_agent: str, timeout: int = 45, pause_seconds: float = 0.35):
        if not user_agent or "your-email" in user_agent:
            raise ValueError("Gerçek bir WIKIDATA_USER_AGENT değeri girin.")
        self.timeout = timeout
        self.pause_seconds = pause_seconds
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept": "application/sparql-results+json, application/json",
        })

    @staticmethod
    def _qid(uri: str) -> str:
        return uri.rsplit("/", 1)[-1]

    def _request_json(self, url: str, params: dict[str, Any], retries: int = 4) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                response = self.session.get(url, params=params, timeout=self.timeout)
                if response.status_code in {429, 503, 504}:
                    time.sleep(2 ** (attempt + 1))
                    continue
                response.raise_for_status()
                return response.json()
            except (requests.RequestException, ValueError) as exc:
                last_error = exc
                if attempt + 1 < retries:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"Wikidata isteği başarısız: {last_error}")

    def search_club_candidates(self, term: str, limit: int = 8) -> list[WikidataSearchCandidate]:
        payload = self._request_json(
            ENTITY_ENDPOINT,
            {
                "action": "wbsearchentities",
                "search": term,
                "language": "en",
                "uselang": "en",
                "type": "item",
                "limit": limit,
                "format": "json",
                "origin": "*",
            },
        )
        term_norm = normalize_name(term.replace("F.C.", "").replace("FC", ""))
        candidates: list[WikidataSearchCandidate] = []
        for item in payload.get("search", []):
            label = item.get("label", "")
            description = item.get("description", "")
            label_norm = normalize_name(label.replace("F.C.", "").replace("FC", ""))
            description_norm = normalize_name(description)
            score = 0
            if label_norm == term_norm:
                score += 100
            elif term_norm in label_norm or label_norm in term_norm:
                score += 45
            if "football club" in description_norm or "association football" in description_norm:
                score += 35
            if any(word in description_norm for word in ["women", "youth", "reserve", "basketball", "handball"]):
                score -= 80
            candidates.append(
                WikidataSearchCandidate(
                    qid=item["id"],
                    label=label,
                    description=description,
                    url=item.get("concepturi", f"https://www.wikidata.org/wiki/{item['id']}"),
                    score=score,
                )
            )
        candidates.sort(key=lambda candidate: (-candidate.score, candidate.label))
        time.sleep(self.pause_seconds)
        return candidates

    def resolve_club_qid(self, term: str) -> WikidataSearchCandidate | None:
        candidates = self.search_club_candidates(term)
        if not candidates:
            return None
        best = candidates[0]
        # Otomatik seçim yalnızca yüksek güvenliyse yapılır; aksi durumda panelden seçilir.
        return best if best.score >= 100 else None

    def iter_club_memberships(
        self,
        club_qid: str,
        page_size: int = 300,
        min_year: int | None = 1990,
    ) -> Iterator[WikidataMembership]:
        offset = 0
        while True:
            year_filter = ""
            if min_year:
                year_filter = f"FILTER(!BOUND(?endDate) || YEAR(?endDate) >= {int(min_year)})"
            query = f"""
            SELECT DISTINCT ?player ?playerLabel ?birthDate ?image ?startDate ?endDate WHERE {{
              ?player wdt:P31 wd:Q5 ;
                      p:P54 ?membership .
              ?membership ps:P54 wd:{club_qid} .
              OPTIONAL {{ ?membership pq:P580 ?startDate . }}
              OPTIONAL {{ ?membership pq:P582 ?endDate . }}
              OPTIONAL {{ ?player wdt:P569 ?birthDate . }}
              OPTIONAL {{ ?player wdt:P18 ?image . }}
              {year_filter}
              SERVICE wikibase:label {{
                bd:serviceParam wikibase:language "tr,en" .
              }}
            }}
            ORDER BY ?player
            LIMIT {int(page_size)}
            OFFSET {offset}
            """
            payload = self._request_json(
                SPARQL_ENDPOINT,
                {"query": query, "format": "json"},
            )
            rows = payload.get("results", {}).get("bindings", [])
            for row in rows:
                yield WikidataMembership(
                    player_qid=self._qid(row["player"]["value"]),
                    player_label=row.get("playerLabel", {}).get("value", self._qid(row["player"]["value"])),
                    birth_date=row.get("birthDate", {}).get("value"),
                    image_url=row.get("image", {}).get("value"),
                    start_date=row.get("startDate", {}).get("value"),
                    end_date=row.get("endDate", {}).get("value"),
                    raw=row,
                )
            if len(rows) < page_size:
                break
            offset += page_size
            time.sleep(self.pause_seconds)

    def fetch_aliases(self, qids: list[str]) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {qid: [] for qid in qids}
        for start in range(0, len(qids), 50):
            batch = qids[start:start + 50]
            payload = self._request_json(
                ENTITY_ENDPOINT,
                {
                    "action": "wbgetentities",
                    "ids": "|".join(batch),
                    "props": "labels|aliases",
                    "languages": "tr|en",
                    "format": "json",
                    "formatversion": 2,
                    "origin": "*",
                },
            )
            for entity in payload.get("entities", []):
                qid = entity.get("id")
                values: list[str] = []
                for language_data in entity.get("labels", {}).values():
                    if language_data.get("value"):
                        values.append(language_data["value"])
                for aliases in entity.get("aliases", {}).values():
                    values.extend(alias["value"] for alias in aliases if alias.get("value"))
                result[qid] = list(dict.fromkeys(values))
            time.sleep(self.pause_seconds)
        return result
