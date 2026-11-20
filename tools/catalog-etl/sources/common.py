"""Wspolne funkcje normalizacji, walidacji i mapowania dla adapterow ETL."""
from __future__ import annotations

import csv
import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_PL_MAP = str.maketrans({
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "a", "Ć": "c", "Ę": "e", "Ł": "l", "Ń": "n",
    "Ó": "o", "Ś": "s", "Ź": "z", "Ż": "z",
})


def normalize_spaces(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def make_search_name(s: str) -> str:
    """Zamienia nazwe na lowercase bez znakow diakrytycznych do szybkiego wyszukiwania."""
    s = normalize_spaces(s).translate(_PL_MAP).lower()
    nfkd = unicodedata.normalize("NFKD", s)
    stripped = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_category_map() -> Dict[Tuple[str, str], str]:
    out: Dict[Tuple[str, str], str] = {}
    with open(DATA_DIR / "category_map.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            out[(row["source"], row["source_key"])] = row["target_slug"]
    return out


def load_unit_map() -> Dict[Tuple[str, str], str]:
    out: Dict[Tuple[str, str], str] = {}
    with open(DATA_DIR / "unit_map.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            out[(row["source"], row["raw_unit"].lower())] = row["unit_key"]
    return out


def infer_prep_state(name_en_or_pl: str) -> Optional[str]:
    low = name_en_or_pl.lower()
    if re.search(r"\b(raw|surow[yae]|śwież[yae]|uncooked)\b", low):
        return "raw"
    if re.search(r"\b(cooked|boiled|baked|roasted|fried|grilled|steamed|stewed|braised|gotowan[yae]|pieczon[yae]|smażon[yae]|duszon[yae]|grillowan[yae])\b", low):
        return "cooked"
    if re.search(r"\b(canned|smoked|dried|pickled|cured|frozen|wędzon[yae]|kiszon[yae]|konserwow[yae]|mrożon[yae]|suszon[yae])\b", low):
        return "processed"
    return None


@dataclass
class NormalizedUnit:
    unit_key: str
    grams_per_unit: float


@dataclass
class NormalizedProduct:
    source: str
    external_id: str
    original_name: str
    name_pl: Optional[str]
    brand: Optional[str]
    manufacturer: Optional[str]
    category_slug: Optional[str]
    kind: str  # generic | branded | dish
    prep_state: Optional[str]
    kcal: Optional[float]
    protein: Optional[float]
    fat: Optional[float]
    carbs: Optional[float]
    saturated_fat: Optional[float] = None
    sugars: Optional[float] = None
    fiber: Optional[float] = None
    salt: Optional[float] = None
    cholesterol_mg: Optional[float] = None
    monounsaturated_fat: Optional[float] = None
    polyunsaturated_fat: Optional[float] = None
    package_weight_grams: Optional[float] = None
    default_serving_grams: Optional[float] = None
    units: List[NormalizedUnit] = field(default_factory=list)
    issues: List[Tuple[str, str]] = field(default_factory=list)  # (severity, code)
    rejected: bool = False


def sanitize_and_validate(p: NormalizedProduct) -> NormalizedProduct:
    """Validates macro consistency and flags data-quality issues."""
    if not p.original_name:
        p.issues.append(("error", "empty_name"))
        p.rejected = True
        return p

    if None in (p.kcal, p.protein, p.fat, p.carbs):
        p.issues.append(("error", "null_macros"))
        p.rejected = True
        return p

    # Zaokraglenie do 2 miejsc, korekta wartosci ujemnych
    for attr in ("kcal", "protein", "fat", "carbs", "saturated_fat", "sugars",
                 "fiber", "salt", "cholesterol_mg", "monounsaturated_fat", "polyunsaturated_fat"):
        v = getattr(p, attr)
        if v is not None:
            if v < 0:
                p.issues.append(("warn", f"negative_{attr}"))
                v = 0.0
            setattr(p, attr, round(float(v), 2))

    if p.protein + p.fat + p.carbs > 102.0:
        p.issues.append(("error", "macro_sum_over_100"))
        p.rejected = True
        return p

    if p.kcal > 920:
        p.issues.append(("error", "kcal_over_920"))
        p.rejected = True
        return p

    if p.sugars is not None and p.sugars > p.carbs + 0.5:
        p.issues.append(("warn", "sugars_gt_carbs_nulled"))
        p.sugars = None

    if p.saturated_fat is not None and p.saturated_fat > p.fat + 0.5:
        p.issues.append(("warn", "satfat_gt_fat_nulled"))
        p.saturated_fat = None

    if p.salt is not None and p.salt > 100.5:
        p.issues.append(("warn", "salt_gt_100_clamped"))
        p.salt = 100.0

    if p.kcal > 20:
        atwater = 4.0 * p.protein + 4.0 * p.carbs + 9.0 * p.fat
        if abs(atwater - p.kcal) / p.kcal > 0.25:
            p.issues.append(("warn", "atwater_dev_gt_25pct"))

    # Deduplikacja jednostek per produkt (w granicach (0, 5000] jak wymaga ProductsController)
    dedup_units: Dict[str, float] = {}
    for u in p.units:
        if 0 < u.grams_per_unit <= 5000 and u.unit_key not in dedup_units:
            dedup_units[u.unit_key] = round(float(u.grams_per_unit), 2)
    p.units = [NormalizedUnit(k, v) for k, v in dedup_units.items()]

    return p
