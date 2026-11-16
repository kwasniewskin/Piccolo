"""Adapter zrodla Fitatu (fitatu.json)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Iterator, Tuple

from .common import (
    NormalizedProduct,
    NormalizedUnit,
    infer_prep_state,
    normalize_spaces,
    sanitize_and_validate,
)


def _fitatu_external_id(name: str, brand: str, e, p, f, c) -> str:
    raw = f"{name.lower()}|{brand.lower()}|{e}|{p}|{f}|{c}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def iter_fitatu(
    path: Path,
    cat_map: Dict[Tuple[str, str], str],
    unit_map: Dict[Tuple[str, str], str],
) -> Iterator[NormalizedProduct]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    seen_ids = set()
    for row in data:
        name = normalize_spaces(row.get("name"))
        brand = normalize_spaces(row.get("brand")) or None
        manufacturer = normalize_spaces(row.get("manufacturer")) or None

        ext_id = _fitatu_external_id(
            name, brand or "",
            row.get("energy"), row.get("protein"), row.get("fat"), row.get("carbohydrate")
        )
        if ext_id in seen_ids:
            continue
        seen_ids.add(ext_id)

        cid = str(row.get("categoryId", ""))
        cat_slug = cat_map.get(("FITATU", cid))
        if cat_slug in ("dania-mrozone", "dania-obiadowe", "salatki-i-surowki", "fast-food"):
            kind = "dish"
        elif brand:
            kind = "branded"
        else:
            kind = "generic"

        pkg_weight = None
        def_serving = None
        units = []
        for m in row.get("measures") or []:
            raw_u = normalize_spaces(m.get("name")).lower()
            w = m.get("weightPerUnit")
            if not raw_u or not w or w <= 0:
                continue
            mapped = unit_map.get(("FITATU", raw_u))
            if not mapped or mapped in ("SKIP_GRAMS", "SKIP_UNIVERSAL"):
                continue
            if mapped == "PACKAGE_FIELD":
                if pkg_weight is None and w <= 10000:
                    pkg_weight = round(float(w), 2)
            elif mapped == "PORTION_FIELD":
                if def_serving is None and w <= 5000:
                    def_serving = round(float(w), 2)
            else:
                units.append(NormalizedUnit(mapped, float(w)))

        prod = NormalizedProduct(
            source="FITATU",
            external_id=ext_id,
            original_name=name,
            name_pl=name,
            brand=brand,
            manufacturer=manufacturer,
            category_slug=cat_slug,
            kind=kind,
            prep_state=infer_prep_state(name),
            kcal=row.get("energy"),
            protein=row.get("protein"),
            fat=row.get("fat"),
            carbs=row.get("carbohydrate"),
            saturated_fat=row.get("saturatedFat"),
            sugars=row.get("sugars"),
            fiber=row.get("fiber"),
            salt=None,
            cholesterol_mg=row.get("cholesterol"),
            monounsaturated_fat=row.get("monounsaturatedFat"),
            polyunsaturated_fat=row.get("polyunsaturatedFat"),
            package_weight_grams=pkg_weight,
            default_serving_grams=def_serving,
            units=units,
        )
        yield sanitize_and_validate(prod)
