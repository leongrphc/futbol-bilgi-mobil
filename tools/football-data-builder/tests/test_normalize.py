from src.normalize import normalize_name


def test_turkish_and_accents_are_normalized():
    assert normalize_name("  MESUT  ÖZİL ") == "mesut ozil"
    assert normalize_name("Mesut Ozıl") == "mesut ozil"


def test_typo_is_not_fixed():
    assert normalize_name("Mesutt Ozil") != normalize_name("Mesut Özil")


def test_punctuation_is_harmless():
    assert normalize_name("Thiago-Alcântara") == "thiago alcantara"


def test_extended_latin_letters_are_transliterated():
    assert normalize_name("Simon Kjær") == "simon kjaer"
    assert normalize_name("Søren Łukasz") == "soren lukasz"
