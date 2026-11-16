"""Adapter zrodla ANSES CIQUAL (pliki XML)."""
from __future__ import annotations

import collections
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

from .common import (
    NormalizedProduct,
    infer_prep_state,
    normalize_spaces,
    sanitize_and_validate,
)


def _parse_teneur(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    s = raw.strip().lower()
    if s in ("", "-", "na", "nd"):
        return None
    if s == "traces":
        return 0.0
    m = re.match(r"^<\s*([0-9]+(?:[.,][0-9]+)?)$", s)
    if m:
        val = float(m.group(1).replace(",", "."))
        return round(val / 2.0, 3)
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _pick_xml(ciqual_dir: Path, prefix: str) -> Path:
    matches = sorted(ciqual_dir.glob(f"{prefix}*.xml"))
    if not matches:
        raise FileNotFoundError(f"Brak pliku {prefix}*.xml w {ciqual_dir}")
    return matches[0]


def iter_ciqual(
    ciqual_dir: Path,
    cat_map: Dict[Tuple[str, str], str],
) -> Iterator[NormalizedProduct]:
    alim_path = _pick_xml(ciqual_dir, "alim_")
    compo_path = _pick_xml(ciqual_dir, "compo_")

    # Budujemy indeks wartosci: alim_code -> {const_code: float}
    compo_by_alim: Dict[str, Dict[int, float]] = collections.defaultdict(dict)
    for _, elem in ET.iterparse(compo_path, events=("end",)):
        if elem.tag == "COMPO":
            ac = (elem.findtext("alim_code") or "").strip()
            cc_raw = (elem.findtext("const_code") or "").strip()
            val = _parse_teneur(elem.findtext("teneur"))
            if ac and cc_raw and val is not None:
                compo_by_alim[ac][int(cc_raw)] = val
            elem.clear()

    tree = ET.parse(alim_path)
    for row in tree.getroot():
        ac = (row.findtext("alim_code") or "").strip()
        nom_eng = normalize_spaces(row.findtext("alim_nom_eng"))
        nom_fr = normalize_spaces(row.findtext("alim_nom_fr"))
        ssgrp = (row.findtext("alim_ssgrp_code") or "").strip()
        cat_slug = cat_map.get(("CIQUAL", ssgrp))

        c = compo_by_alim.get(ac, {})
        kcal = c.get(328)
        if kcal is None:
            kcal = c.get(333)
        if kcal is None and 327 in c:
            kcal = c[327] / 4.184

        protein = c.get(25000) if 25000 in c else c.get(25003)
        salt = c.get(10004)
        if salt is None and 10110 in c:
            salt = c[10110] * 2.5 / 1000.0

        name = nom_eng or nom_fr
        kind = "dish" if cat_slug in ("dania-obiadowe", "fast-food", "salatki-i-surowki") else "generic"
        prod = NormalizedProduct(
            source="CIQUAL",
            external_id=ac,
            original_name=name,
            name_pl=None,
            brand=None,
            manufacturer=None,
            category_slug=cat_slug,
            kind=kind,
            prep_state=infer_prep_state(name),
            kcal=kcal,
            protein=protein,
            fat=c.get(40000),
            carbs=c.get(31000),
            saturated_fat=c.get(40302),
            sugars=c.get(32000),
            fiber=c.get(34100),
            salt=salt,
            cholesterol_mg=c.get(75100),
            monounsaturated_fat=c.get(40303),
            polyunsaturated_fat=c.get(40304),
        )
        yield sanitize_and_validate(prod)
