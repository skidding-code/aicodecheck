from aiprojectdetector.utils.text import (
    coefficient_of_variation,
    compressibility,
    naming_convention,
    ngram_repetition,
    normalized_entropy,
    scale_between,
    split_identifier,
    type_token_ratio,
)


def test_entropy_bounds():
    assert normalized_entropy([]) == 0.0
    assert normalized_entropy(["a", "a", "a"]) == 0.0
    # two equally-likely symbols => normalized entropy 1.0
    assert abs(normalized_entropy(["a", "b", "a", "b"]) - 1.0) < 1e-9


def test_ngram_repetition():
    assert ngram_repetition(list("abcabcabc"), n=3) > 0.0
    assert ngram_repetition(list("abcdef"), n=3) == 0.0


def test_compressibility_repetitive_is_low():
    repetitive = compressibility("ab" * 500)
    varied = compressibility("the quick brown fox jumps over the lazy dog 12345 zyxwv")
    assert repetitive < varied


def test_cv_uniform_is_low():
    assert coefficient_of_variation([10, 10, 10, 10]) == 0.0
    assert coefficient_of_variation([1, 50, 3, 99, 2]) > 0.5


def test_naming_convention():
    assert naming_convention("snake_case_name") == "snake_case"
    assert naming_convention("camelCaseName") == "camelCase"
    assert naming_convention("PascalCase") == "PascalCase"
    assert naming_convention("UPPER_CASE") == "UPPER_CASE"
    assert naming_convention("kebab-case") == "kebab-case"


def test_split_identifier():
    assert split_identifier("calculateSumOfTwoNumbers") == ["calculate", "Sum", "Of", "Two", "Numbers"]
    assert split_identifier("result_of_addition") == ["result", "of", "addition"]


def test_type_token_ratio():
    assert type_token_ratio(["a", "a", "a"]) < type_token_ratio(["a", "b", "c"])


def test_scale_between():
    assert scale_between(5, 0, 10) == 0.5
    assert scale_between(-5, 0, 10) == 0.0
    assert scale_between(99, 0, 10) == 1.0
    assert scale_between(5, 5, 5) == 0.5
