"""Acronym-to-title expansion for Spanish law short names (#671, gap A).

Users search by the popular acronym of a law ("LOPD", "LGT", "ET") far more
often than by its official title or BOE number. The full-text index
(:mod:`lexflow.core.search`) tokenizes queries and matches with accent-insensitive
AND semantics per token. Acronyms rarely appear in indexed text, so known
tokens are expanded to distinctive title phrases before search runs.

Invariant: every expansion value is a real, verified substring of the law's
title, never a fabricated BOE id. When an acronym-to-title mapping (or its
exact wording) cannot be confirmed with confidence, it is left out — a smaller,
correct map beats a larger, wrong one.
"""

from __future__ import annotations

from lexflow.core.schemas import AliasExpansion
from lexflow.core.search import tokenize_query

LAW_ALIASES: dict[str, str] = {
    "CE": "constitución española",
    "CC": "código civil",
    "CP": "código penal",
    "LOPD": "protección de datos personales",
    "LOPDGDD": "protección de datos personales",
    "LEC": "enjuiciamiento civil",
    "LECRIM": "enjuiciamiento criminal",
    "LGT": "general tributaria",
    "LGSS": "general de la seguridad social",
    "ET": "estatuto de los trabajadores",
    "LOE": "ordenación de la edificación",
    "LRJSP": "régimen jurídico del sector público",
    "LPAC": "procedimiento administrativo común de las administraciones públicas",
    "LOPJ": "poder judicial",
    "LBRL": "bases del régimen local",
    "LSC": "sociedades de capital",
    "LJCA": "jurisdicción contencioso-administrativa",
    "LCSP": "contratos del sector público",
    "LOFAGE": "organización y funcionamiento de la administración general del estado",
    "LOTC": "tribunal constitucional",
    "LOPSC": "protección de la seguridad ciudadana",
    "TRLGDCU": "defensa de los consumidores y usuarios",
    "LAU": "arrendamientos urbanos",
    "LC": "ley concursal",
    "LPI": "propiedad intelectual",
    "LPH": "propiedad horizontal",
    "LMV": "mercado de valores",
    "LGP": "general presupuestaria",
    "LOREG": "régimen electoral general",
    "LOFCS": "fuerzas y cuerpos de seguridad",
    "LODP": "defensor del pueblo",
    "LOLS": "libertad sindical",
    "LISOS": "infracciones y sanciones en el orden social",
    "LO 1/2004": "medidas de protección integral contra la violencia de género",
    "LOVG": "medidas de protección integral contra la violencia de género",
    "LO 3/2007": "igualdad efectiva de mujeres y hombres",
    "LOPIVI": "protección integral a la infancia y la adolescencia frente a la violencia",
}


def _normalise(query: str) -> str:
    """Collapse whitespace and uppercase a raw query for exact acronym lookup."""
    return " ".join(query.split()).upper()


def expand_alias(query: str) -> str | None:
    """Return the title-word expansion for `query` if it is a known acronym.

    Matching is exact (after trimming/collapsing whitespace and
    uppercasing) — no fuzzy or substring matching. "lopd" and "LOPD" both
    match; "lopdd" and "el lopd de 2018" do not. Exact-match keeps this
    strictly additive: it can only help a query that was otherwise a dead
    end, never hijack a normal free-text search.

    Args:
        query: the raw search query as typed by the user.

    Returns:
        The lowercase expansion phrase, or None if `query` is not a known
        acronym.
    """
    return LAW_ALIASES.get(_normalise(query))


def expand_aliases_in_query(query: str) -> tuple[str, list[AliasExpansion]]:
    """Expand known acronym tokens inside a multi-word *query* (#47).

    Each whitespace-separated token is looked up individually. Known acronyms
    are replaced by their title phrase; the returned ``expanded_query`` is
    rejoined for the search index, which tokenizes it into AND terms.

    Args:
        query: Raw user search text.

    Returns:
        ``(expanded_query, expansions)`` where ``expansions`` lists each
        acronym token that was replaced.
    """
    tokens = tokenize_query(query)
    if not tokens:
        return query, []

    if len(tokens) == 1:
        whole = expand_alias(query)
        if whole is not None:
            return whole, [AliasExpansion(token=tokens[0], expansion=whole)]
        return query, []

    expansions: list[AliasExpansion] = []
    expanded_tokens: list[str] = []
    for token in tokens:
        expansion = LAW_ALIASES.get(_normalise(token))
        if expansion is not None:
            expansions.append(AliasExpansion(token=token, expansion=expansion))
            expanded_tokens.append(expansion)
        else:
            expanded_tokens.append(token)

    return " ".join(expanded_tokens), expansions
