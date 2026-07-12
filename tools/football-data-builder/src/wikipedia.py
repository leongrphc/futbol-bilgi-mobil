from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass
from typing import Any, Iterable, Iterator
from urllib.parse import quote

import requests

from .normalize import normalize_name


@dataclass(frozen=True)
class WikipediaPage:
    page_id: int
    title: str
    revision_id: int | None
    wikidata_qid: str | None
    wikitext: str


@dataclass(frozen=True)
class CareerMembership:
    club_names: tuple[str, ...]
    linked_titles: tuple[str, ...]
    years: str | None
    start_date: str | None
    end_date: str | None
    raw_club: str


@dataclass(frozen=True)
class ParsedFootballer:
    game_name: str
    full_name: str | None
    birth_date_text: str | None
    memberships: tuple[CareerMembership, ...]


class WikipediaClient:
    """Read-only MediaWiki Action API client.

    The collector deliberately uses Wikimedia's official API rather than
    scraping rendered pages. Calls are serial, throttled and use a meaningful
    User-Agent.
    """

    def __init__(
        self,
        user_agent: str,
        language: str = "en",
        timeout: int = 45,
        pause_seconds: float = 0.2,
    ) -> None:
        if not user_agent or "your-email" in user_agent:
            raise ValueError("Gerçek bir WIKIPEDIA_USER_AGENT değeri girin.")
        self.language = language
        self.api_url = f"https://{language}.wikipedia.org/w/api.php"
        self.timeout = timeout
        self.pause_seconds = pause_seconds
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
            }
        )

    def _get(self, params: dict[str, Any], retries: int = 4) -> dict[str, Any]:
        params = {**params, "format": "json", "formatversion": 2}
        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                response = self.session.get(self.api_url, params=params, timeout=self.timeout)
                if response.status_code in {429, 503, 504}:
                    time.sleep(2 ** (attempt + 1))
                    continue
                response.raise_for_status()
                payload = response.json()
                if "error" in payload:
                    raise RuntimeError(str(payload["error"]))
                time.sleep(self.pause_seconds)
                return payload
            except (requests.RequestException, ValueError, RuntimeError) as exc:
                last_error = exc
                if attempt + 1 < retries:
                    time.sleep(2**attempt)
        raise RuntimeError(f"Wikipedia API isteği başarısız: {last_error}")

    def search_categories(self, club_name: str, limit: int = 8) -> list[str]:
        found: list[str] = []
        for search in [
            f'intitle:"{club_name} players"',
            f'intitle:"{club_name} footballers"',
        ]:
            payload = self._get(
                {
                    "action": "query",
                    "list": "search",
                    "srsearch": search,
                    "srnamespace": 14,
                    "srlimit": limit,
                }
            )
            for row in payload.get("query", {}).get("search", []):
                title = row.get("title")
                if title and title not in found:
                    found.append(title)
        return found[:limit]

    def category_exists(self, title: str) -> bool:
        if not title.startswith("Category:"):
            title = f"Category:{title}"
        payload = self._get({"action": "query", "titles": title})
        pages = payload.get("query", {}).get("pages", [])
        return bool(pages and not pages[0].get("missing"))

    def iter_category_members(
        self,
        category_title: str,
        limit: int | None = None,
    ) -> Iterator[dict[str, Any]]:
        if not category_title.startswith("Category:"):
            category_title = f"Category:{category_title}"
        continuation: str | None = None
        emitted = 0
        while True:
            params: dict[str, Any] = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": category_title,
                "cmnamespace": 0,
                "cmlimit": "max",
                "cmsort": "sortkey",
                "cmdir": "ascending",
            }
            if continuation:
                params["cmcontinue"] = continuation
            payload = self._get(params)
            for row in payload.get("query", {}).get("categorymembers", []):
                yield row
                emitted += 1
                if limit is not None and emitted >= limit:
                    return
            continuation = payload.get("continue", {}).get("cmcontinue")
            if not continuation:
                return

    def fetch_pages(self, titles: Iterable[str], batch_size: int = 40) -> Iterator[WikipediaPage]:
        clean = list(dict.fromkeys(title for title in titles if title))
        for start in range(0, len(clean), batch_size):
            batch = clean[start : start + batch_size]
            payload = self._get(
                {
                    "action": "query",
                    "prop": "revisions|pageprops",
                    "titles": "|".join(batch),
                    "redirects": 1,
                    "rvprop": "ids|content",
                    "rvslots": "main",
                }
            )
            for page in payload.get("query", {}).get("pages", []):
                if page.get("missing"):
                    continue
                revisions = page.get("revisions") or []
                revision = revisions[0] if revisions else {}
                slots = revision.get("slots") or {}
                main = slots.get("main") or {}
                content = main.get("content") or ""
                yield WikipediaPage(
                    page_id=int(page["pageid"]),
                    title=str(page["title"]),
                    revision_id=int(revision["revid"]) if revision.get("revid") else None,
                    wikidata_qid=(page.get("pageprops") or {}).get("wikibase_item"),
                    wikitext=str(content),
                )

    @staticmethod
    def page_url(title: str, revision_id: int | None = None, language: str = "en") -> str:
        base = f"https://{language}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"
        if revision_id:
            return f"{base}?oldid={revision_id}"
        return base

    @staticmethod
    def payload_hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()


_WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")


def _strip_wikicode(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = _WIKILINK_RE.sub(lambda match: match.group(2) or match.group(1), value)
    value = re.sub(r"\{\{(?:nowrap|small|abbr|flagicon|sortname|sort)\|([^{}]*)\}\}", r"\1", value, flags=re.I)
    # Remove remaining simple templates iteratively. We only need names/years.
    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>", "", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", value).strip()


def _extract_template(wikitext: str, names: set[str]) -> str | None:
    for match in re.finditer(r"\{\{\s*([^|}\n]+)", wikitext):
        name = normalize_name(match.group(1))
        if name not in names:
            continue
        start = match.start()
        depth = 0
        index = start
        while index < len(wikitext) - 1:
            pair = wikitext[index : index + 2]
            if pair == "{{":
                depth += 1
                index += 2
                continue
            if pair == "}}":
                depth -= 1
                index += 2
                if depth == 0:
                    return wikitext[start:index]
                continue
            index += 1
    return None


def _split_top_level_params(template: str) -> dict[str, str]:
    body = template[2:-2]
    first_pipe = body.find("|")
    if first_pipe < 0:
        return {}
    body = body[first_pipe + 1 :]
    parts: list[str] = []
    start = 0
    brace_depth = 0
    link_depth = 0
    index = 0
    while index < len(body):
        pair = body[index : index + 2]
        if pair == "{{":
            brace_depth += 1
            index += 2
            continue
        if pair == "}}" and brace_depth:
            brace_depth -= 1
            index += 2
            continue
        if pair == "[[":
            link_depth += 1
            index += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            index += 2
            continue
        if body[index] == "|" and brace_depth == 0 and link_depth == 0:
            parts.append(body[start:index])
            start = index + 1
        index += 1
    parts.append(body[start:])

    result: dict[str, str] = {}
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = normalize_name(key).replace(" ", "")
        result[key] = value.strip()
    return result


def _clean_markup(value: str) -> tuple[list[str], list[str]]:
    links: list[str] = []
    labels: list[str] = []
    for match in _WIKILINK_RE.finditer(value):
        title = match.group(1).strip().split("#", 1)[0]
        label = (match.group(2) or match.group(1)).strip()
        if title:
            links.append(title)
        if label:
            labels.append(_strip_wikicode(label))
    plain = _strip_wikicode(value)
    plain = re.sub(r"\([^)]*(?:loan|on loan|kiralık)[^)]*\)", "", plain, flags=re.I)
    plain = re.sub(r"\s+", " ", plain).strip(" –—-,")
    if plain:
        labels.append(plain)
    return list(dict.fromkeys(filter(None, labels))), list(dict.fromkeys(links))


def _parse_year_range(raw: str | None) -> tuple[str | None, str | None]:
    if not raw:
        return None, None
    plain = _strip_wikicode(raw)
    years = [int(value) for value in re.findall(r"(?:19|20)\d{2}", plain)]
    if not years:
        return None, None
    start = f"{years[0]:04d}-01-01"
    end = None if any(token in plain.casefold() for token in ["present", "günümüz", "current"]) else f"{years[-1]:04d}-12-31"
    return start, end


def parse_footballer_infobox(page_title: str, wikitext: str) -> ParsedFootballer | None:
    template = _extract_template(
        wikitext,
        {"infobox football biography", "infobox footballer"},
    )
    if template is None:
        return None
    params = _split_top_level_params(template)
    game_name = _strip_wikicode(params.get("name") or page_title.split(" (", 1)[0])
    full_name = _strip_wikicode(params.get("fullname", "")) or None
    birth_date = params.get("birthdate")

    memberships: list[CareerMembership] = []
    for index in range(1, 60):
        club_raw = params.get(f"clubs{index}")
        if not club_raw:
            continue
        years = params.get(f"years{index}")
        names, links = _clean_markup(club_raw)
        start_date, end_date = _parse_year_range(years)
        memberships.append(
            CareerMembership(
                club_names=tuple(names),
                linked_titles=tuple(links),
                years=_strip_wikicode(years) if years else None,
                start_date=start_date,
                end_date=end_date,
                raw_club=club_raw,
            )
        )

    return ParsedFootballer(
        game_name=game_name or page_title,
        full_name=full_name,
        birth_date_text=birth_date,
        memberships=tuple(memberships),
    )
