from __future__ import annotations

import json
from pathlib import Path

from src.collector import import_wikipedia_club_category
from src.db import connect, init_db, rebuild_pairs, seed_clubs
from src.wikipedia import WikipediaPage, parse_footballer_infobox
from src.validate import validate_answer


SAMPLE_WIKITEXT = r"""
{{Infobox football biography
| name = Test Player
| fullname = Test Full Player
| birth_date = {{birth date and age|1990|1|1}}
| years1 = 2010–2015
| clubs1 = [[Arsenal F.C.|Arsenal]]
| years2 = 2015–2020
| clubs2 = [[Real Madrid CF|Real Madrid]]
| years3 = 2020–present
| clubs3 = [[Galatasaray S.K.|Galatasaray]]
}}
"""


def test_parse_footballer_infobox() -> None:
    parsed = parse_footballer_infobox("Test Player", SAMPLE_WIKITEXT)
    assert parsed is not None
    assert parsed.game_name == "Test Player"
    assert parsed.full_name == "Test Full Player"
    assert len(parsed.memberships) == 3
    assert parsed.memberships[0].linked_titles == ("Arsenal F.C.",)
    assert parsed.memberships[0].start_date == "2010-01-01"
    assert parsed.memberships[2].end_date is None


class FakeWikipediaClient:
    language = "en"

    def iter_category_members(self, category_title: str, limit=None):
        yield {"pageid": 11, "title": "Test Player"}

    def fetch_pages(self, titles):
        yield WikipediaPage(
            page_id=11,
            title="Test Player",
            revision_id=99,
            wikidata_qid="QTESTPLAYER",
            wikitext=SAMPLE_WIKITEXT,
        )

    @staticmethod
    def page_url(title, revision_id=None, language="en"):
        return f"https://example.test/{title}?oldid={revision_id}"

    @staticmethod
    def payload_hash(value):
        return "hash"


def test_import_wikipedia_category_builds_pairs(tmp_path: Path) -> None:
    config = tmp_path / "clubs.json"
    config.write_text(
        json.dumps(
            [
                {
                    "slug": "arsenal",
                    "name": "Arsenal",
                    "wikidata_search": "Arsenal F.C.",
                    "wikipedia_title": "Arsenal F.C.",
                    "wikipedia_category": "Category:Arsenal F.C. players",
                },
                {
                    "slug": "real-madrid",
                    "name": "Real Madrid",
                    "wikidata_search": "Real Madrid CF",
                    "wikipedia_title": "Real Madrid CF",
                },
                {
                    "slug": "galatasaray",
                    "name": "Galatasaray",
                    "wikidata_search": "Galatasaray S.K.",
                    "wikipedia_title": "Galatasaray S.K.",
                },
            ]
        ),
        encoding="utf-8",
    )
    conn = connect(tmp_path / "football.db")
    init_db(conn)
    seed_clubs(conn, config)
    arsenal_id = int(conn.execute("SELECT id FROM clubs WHERE slug='arsenal'").fetchone()[0])

    result = import_wikipedia_club_category(
        conn,
        FakeWikipediaClient(),
        arsenal_id,
        min_year=1990,
    )
    assert result["players"] == 1
    assert result["memberships"] >= 3

    rebuild_pairs(conn)
    clubs = {
        row["slug"]: int(row["id"])
        for row in conn.execute("SELECT id, slug FROM clubs")
    }
    answer = validate_answer(
        conn,
        clubs["arsenal"],
        clubs["real-madrid"],
        "Test Full Player",
    )
    assert answer.is_correct is True
