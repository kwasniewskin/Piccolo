"""Adapter zrodel USDA FoodData Central (Foundation oraz SR Legacy JSON)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

from .common import (
    NormalizedProduct,
    NormalizedUnit,
    infer_prep_state,
    normalize_spaces,
    sanitize_and_validate,
)

# Priorytety ID skladnikow w FDC (w szczegolnosci 3 warianty Energy kcal w Foundation)
_ENERGY_KCAL_IDS = (2048, 2047, 1008)
_ENERGY_KJ_ID = 1062
_SUGARS_IDS = (2000, 1063)


def _get_nutrient(nutrients: Dict[int, float], *ids: int) -> Optional[float]:
    for nid in ids:
        if nid in nutrients:
            return nutrients[nid]
    return None


def iter_usda(
    path: Path,
    source_code: str,  # "USDA_FND" lub "USDA_SR"
    cat_map: Dict[Tuple[str, str], str],
    unit_map: Dict[Tuple[str, str], str],
) -> Iterator[NormalizedProduct]:
    with open(path, "r", encoding="utf-8") as fh:
        root = json.load(fh)
    foods = next(iter(root.values()))

    for row in foods:
        fdc_id = str(row["fdcId"])
        desc = normalize_spaces(row.get("description"))
        cat_desc = normalize_spaces((row.get("foodCategory") or {}).get("description"))
        cat_slug = cat_map.get(("USDA", cat_desc))

        nutrients: Dict[int, float] = {}
        for fn in row.get("foodNutrients") or []:
            nid = (fn.get("nutrient") or {}).get("id")
            amt = fn.get("amount")
            if nid is not None and amt is not None:
                nutrients[int(nid)] = float(amt)

        kcal = _get_nutrient(nutrients, *_ENERGY_KCAL_IDS)
        if kcal is None and _ENERGY_KJ_ID in nutrients:
            kcal = nutrients[_ENERGY_KJ_ID] / 4.184

        sodium_mg = nutrients.get(1093)
        salt_g = (sodium_mg * 2.5 / 1000.0) if sodium_mg is not None else None

        pkg_weight = None
        def_serving = None
        units = []
        for p in row.get("foodPortions") or []:
            gw = p.get("gramWeight")
            amt = p.get("amount") or 1.0
            if not gw or gw <= 0 or not amt or amt <= 0:
                continue
            per_one = float(gw) / float(amt)

            mu_name = normalize_spaces((p.get("measureUnit") or {}).get("name")).lower()
            mod = normalize_spaces(p.get("modifier")).lower()
            raw_key = mu_name if (mu_name and mu_name != "undetermined") else mod
            # np. "cup, chopped" -> "cup"
            base_key = raw_key.split(",")[0].split("(")[0].strip()

            mapped = unit_map.get(("USDA", raw_key)) or unit_map.get(("USDA", base_key))
            if not mapped:
                # Typowe okreslenia rozmiaru pojedynczego owocu/warzywa w USDA ("medium", "large", "1 banana")
                if base_key in ("medium", "large", "small", "whole") or any(w in raw_key for w in ("whole", "1 fruit", "1 medium")):
                    mapped = "piece"
            if not mapped:
                continue

            if mapped == "PACKAGE_FIELD":
                if pkg_weight is None and per_one <= 10000:
                    pkg_weight = round(per_one, 2)
            elif mapped == "PORTION_FIELD":
                if def_serving is None and per_one <= 5000:
                    def_serving = round(per_one, 2)
            else:
                units.append(NormalizedUnit(mapped, per_one))

        kind = "dish" if cat_slug in ("dania-obiadowe", "fast-food") else "generic"
        prod = NormalizedProduct(
            source=source_code,
            external_id=fdc_id,
            original_name=desc,
            name_pl=None,
            brand=None,
            manufacturer=None,
            category_slug=cat_slug,
            kind=kind,
            prep_state=infer_prep_state(desc),
            kcal=kcal,
            protein=nutrients.get(1003),
            fat=nutrients.get(1004),
            carbs=nutrients.get(1005),
            saturated_fat=nutrients.get(1258),
            sugars=_get_nutrient(nutrients, *_SUGARS_IDS),
            fiber=nutrients.get(1079),
            salt=salt_g,
            cholesterol_mg=nutrients.get(1253),
            monounsaturated_fat=nutrients.get(1292),
            polyunsaturated_fat=nutrients.get(1293),
            package_weight_grams=pkg_weight,
            default_serving_grams=def_serving,
            units=units,
        )
        yield sanitize_and_validate(prod)
