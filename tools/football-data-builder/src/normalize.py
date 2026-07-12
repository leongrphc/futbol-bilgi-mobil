from __future__ import annotations

import re
import unicodedata

_SPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^a-z0-9 ]+")

# NFKD'nin tek başına Latin ASCII'ye çevirmediği yaygın futbolcu adı harfleri.
_TRANSLITERATION = str.maketrans(
    {
        "ı": "i",
        "æ": "ae",
        "ǽ": "ae",
        "œ": "oe",
        "ø": "o",
        "ł": "l",
        "đ": "d",
        "ð": "d",
        "þ": "th",
        "ß": "ss",
    }
)


def normalize_name(value: str) -> str:
    """Normalize names for strict, accent-insensitive exact matching.

    Bu fonksiyon typo düzeltmez. Yalnızca büyük/küçük harf, aksan, Türkçe
    karakter, bazı Latin harfleri, gereksiz boşluk ve noktalama farklarını
    kaldırır.
    """
    if not value:
        return ""

    value = value.strip().casefold().translate(_TRANSLITERATION)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("-", " ").replace("'", " ").replace("’", " ")
    value = _PUNCT_RE.sub(" ", value)
    return _SPACE_RE.sub(" ", value).strip()
