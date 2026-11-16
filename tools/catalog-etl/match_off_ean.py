"""Precyzyjne dopasowanie kodow EAN, soli i skladu z Open Food Facts (off_poland.jsonl) do produktow Fitatu."""
from __future__ import annotations

import collections
import csv
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from rapidfuzz import fuzz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
DATA_RAW = ROOT / "data-raw"
OUT_DIR = ROOT / "out"

sys.path.insert(0, str(ROOT))
from sources.common import make_search_name

_MULTI_WEIGHT_RE = re.compile(r"\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|l)\b", re.I)
_WEIGHT_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|l)\b", re.I)
_PCT_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*%")
_WORD_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "w", "z", "ze", "i", "do", "na", "o", "od", "po", "bez", "dla", "a", "the", "and",
    "g", "gr", "kg", "ml", "l", "szt", "opakowanie", "produkt", "smaku", "smak", "typu",
    "extra", "klasyczny", "oryginalny", "tradycyjny",
}

# Krytyczne cechy produktu - rozbieznosc oznacza inny wariant smakowy/tluszczowy
_VARIANT_ROOTS = (
    "lagodn", "pikantn", "ostr", "slodk", "gorzk", "mleczn", "bial", "deserow",
    "naturaln", "truskawk", "malin", "wisni", "jagod", "borowk", "wanili", "czekolad",
    "brzoskwini", "cytryn", "jablk", "pomarancz", "banan", "anan", "kokos", "karmel",
    "orzech", "migdal", "szczypior", "czosn", "ziol", "papryk", "cebul", "pomidor",
    "zero", "light", "fit", "laktoz", "gazowan", "niegazowan", "pelnoziarn", "pszenn",
    "zytn", "kebab", "pizza", "chili", "wedzon", "solon", "niesolon", "chud", "poltlust", "tlust",
    "mojito", "bakali", "chrupk", "rababar", "rabarbar", "serek", "mus", "sok", "nektar",
    "drobiow", "wieprzow", "wolow", "indycz", "kurcz", "lososi", "tunczyk", "bezgluten",
)


def extract_weight_grams(text: Optional[str]) -> Optional[float]:
    if not text:
        return None
    mm = _MULTI_WEIGHT_RE.search(text)
    if mm:
        cnt = int(mm.group(1))
        val = float(mm.group(2).replace(",", "."))
        if mm.group(3).lower() in ("kg", "l"):
            val *= 1000.0
        tot = cnt * val
        return tot if 1 < tot <= 50000 else None
    m = _WEIGHT_RE.search(text)
    if not m:
        return None
    val = float(m.group(1).replace(",", "."))
    if m.group(2).lower() in ("kg", "l"):
        val *= 1000.0
    return val if 1 < val <= 50000 else None


def variant_signature(norm_text: str) -> Tuple[Set[str], Set[str]]:
    words = _WORD_RE.findall(norm_text)
    roots = set()
    for w in words:
        for r in _VARIANT_ROOTS:
            if w.startswith(r):
                roots.add(r)
    pcts = {p.replace(",", ".").replace(" ", "") for p in _PCT_RE.findall(norm_text)}
    return roots, pcts


def clean_name_tokens(s: str) -> Tuple[str, List[str]]:
    norm = make_search_name(s)
    s_no_w = _MULTI_WEIGHT_RE.sub(" ", norm)
    s_no_w = _WEIGHT_RE.sub(" ", s_no_w)
    toks = [t for t in _WORD_RE.findall(s_no_w) if t not in _STOPWORDS and len(t) >= 2]
    return " ".join(toks), toks


def brand_tokens(b: Optional[str]) -> Set[str]:
    if not b:
        return set()
    norm = make_search_name(b)
    if norm == "k classic":
        return {"kclassic"}
    if norm == "dobra nasza":
        return {"dobranasza"}
    generic_b = {"sa", "sp", "zoo", "polska", "pl", "classic", "selection", "premium", "bio", "extra", "menu"}
    toks = {t for t in _WORD_RE.findall(norm) if len(t) >= 2 and t not in generic_b}
    return toks or {norm.replace(" ", "")}


def load_off() -> Tuple[List[dict], Dict[str, List[int]], Dict[str, List[int]]]:
    off_path = DATA_RAW / "off_poland.jsonl"
    items: List[dict] = []
    by_brand: Dict[str, List[int]] = collections.defaultdict(list)
    by_word: Dict[str, List[int]] = collections.defaultdict(list)

    with open(off_path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            name = r.get("name_pl") or r.get("name_main")
            code = r.get("code")
            if not name or not code:
                continue
            clean_nm, toks = clean_name_tokens(name)
            if not toks:
                continue
            btoks = brand_tokens(r.get("brands"))
            pkg = r.get("product_quantity") or extract_weight_grams(r.get("quantity")) or extract_weight_grams(name)
            v_roots, v_pcts = variant_signature(make_search_name(name))
            # Usun nazwe marki z clean_name jesli zaczyna nazwe, zeby porownywac czysty opis produktu
            idx = len(items)
            items.append({
                "code": code,
                "name": name,
                "clean_name": clean_nm,
                "tokens": set(toks),
                "brands": r.get("brands") or "",
                "brand_tokens": btoks,
                "pkg": float(pkg) if pkg else None,
                "v_roots": v_roots,
                "v_pcts": v_pcts,
                "kcal": r.get("kcal_100g"),
                "protein": r.get("protein_100g"),
                "fat": r.get("fat_100g"),
                "carbs": r.get("carbs_100g"),
                "salt": r.get("salt_100g"),
                "ingredients": r.get("ingredients_pl"),
            })
            for bt in btoks:
                by_brand[bt].append(idx)
            for wt in toks[:4]:
                if len(wt) >= 3:
                    by_word[wt].append(idx)

    return items, by_brand, by_word


def macro_compatible(fit: dict, off: dict) -> Tuple[bool, float]:
    fk = fit["per100g"]["kcal"]
    ok = off["kcal"]
    if ok is not None:
        if ok < 0 or ok > 950:
            return False, 0.0
        tol = max(12.0, 0.10 * max(fk, ok))
        if abs(fk - ok) > tol:
            return False, 0.0

    macro_pen = 0.0
    for fk_key, ok_key in (("protein", "protein"), ("fat", "fat"), ("carbs", "carbs")):
        fv = fit["per100g"][fk_key]
        ov = off[ok_key]
        if ov is not None:
            tol = max(2.5, 0.22 * max(fv, ov))
            diff = abs(fv - ov)
            if diff > tol:
                return False, 0.0
            macro_pen += diff * 0.5
    return True, macro_pen


def main() -> None:
    print("Ladowanie Open Food Facts (PL)...")
    off_items, by_brand, by_word = load_off()
    print(f"Zaladowano OFF PL: {len(off_items)} produktow, indeks marek: {len(by_brand)}")

    fit_records = [json.loads(l) for l in open(OUT_DIR / "products.v1.jsonl", encoding="utf-8")]
    raw_matches = []

    for f_idx, fit in enumerate(fit_records):
        if fit["source"] != "FITATU":
            continue
        if not (fit.get("brand") or fit.get("kind") == "branded" or fit.get("packageWeightGrams")):
            continue

        f_clean, f_toks = clean_name_tokens(fit["name"])
        if not f_toks:
            continue
        f_tok_set = set(f_toks)
        f_btoks = brand_tokens(fit.get("brand"))
        f_pkg = fit.get("packageWeightGrams") or extract_weight_grams(fit["name"])
        f_v_roots, f_v_pcts = variant_signature(make_search_name(fit["name"]))

        # Nazwa bez powtarzania marki (czestsza rozbieznosc: Fitatu ma "Piątnica Serek...", OFF "Serek...")
        f_no_brand_toks = [t for t in f_toks if t not in f_btoks] or f_toks
        f_no_brand = " ".join(f_no_brand_toks)
        f_nb_set = set(f_no_brand_toks)

        cand_ids: Set[int] = set()
        for bt in f_btoks:
            cand_ids.update(by_brand.get(bt, []))
        if not f_btoks or not cand_ids:
            for wt in f_no_brand_toks:
                lst = by_word.get(wt, [])
                if 0 < len(lst) <= 2500:
                    cand_ids.update(lst)

        if not cand_ids:
            continue

        scored: List[Tuple[float, int]] = []
        for oid in cand_ids:
            off = off_items[oid]

            # 1. Zgodnosc marki (twarda)
            if f_btoks and off["brand_tokens"]:
                if not (f_btoks & off["brand_tokens"]) and not (f_btoks & off["tokens"]) and not (off["brand_tokens"] & f_tok_set):
                    continue
            elif f_btoks and not off["brand_tokens"]:
                if not (f_btoks & off["tokens"]):
                    continue

            # 2. Procenty tluszczu i warianty smakowe musza sie zgadzac
            if f_v_pcts and off["v_pcts"] and f_v_pcts != off["v_pcts"]:
                continue
            if f_v_roots and off["v_roots"] and f_v_roots != off["v_roots"]:
                continue
            # Jesli Fitatu ma wyrazny smak/wariant, a OFF nie ma zadnego -> odrzuc (np. "Ketchup pikantny" vs "Ketchup")
            if len(f_v_roots) >= 1 and not off["v_roots"] and len(off["tokens"]) <= 2:
                continue

            # 3. Bezpiecznik makro/kcal
            ok_macro, macro_pen = macro_compatible(fit, off)
            if not ok_macro:
                continue

            # 4. Bezpiecznik gramatury opakowania
            if f_pkg and off["pkg"]:
                ratio = max(f_pkg, off["pkg"]) / max(min(f_pkg, off["pkg"]), 1.0)
                if ratio > 1.15:
                    continue

            o_no_brand_toks = [t for t in off["clean_name"].split() if t not in off["brand_tokens"]] or off["clean_name"].split()
            o_no_brand = " ".join(o_no_brand_toks)
            o_nb_set = set(o_no_brand_toks)

            # Pokrycie tokenow z obu stron (chroni przed podzbiorami typu "serek" vs "serek wiejski lekki ze szczypiorkiem")
            inter = len(f_nb_set & o_nb_set)
            if inter == 0:
                continue
            recall_f = inter / len(f_nb_set)
            prec_o = inter / len(o_nb_set)
            f1 = 2 * recall_f * prec_o / (recall_f + prec_o)

            if recall_f < 0.6 or prec_o < 0.5:
                continue

            sim_sort = fuzz.token_sort_ratio(f_no_brand, o_no_brand)
            sim = sim_sort * 0.65 + (f1 * 100.0) * 0.35

            bonus = 0.0
            if f_btoks and (f_btoks & off["brand_tokens"]):
                bonus += 6.0
            if f_pkg and off["pkg"] and abs(f_pkg - off["pkg"]) <= 5:
                bonus += 6.0
            if off["kcal"] is not None:
                bonus += 3.0
            if off["salt"] is not None:
                bonus += 2.0

            final_sc = round(sim + bonus - macro_pen, 2)
            if sim >= 74:
                scored.append((final_sc, oid, f1, sim_sort))

        if not scored:
            continue
        scored.sort(key=lambda x: -x[0])
        best_sc, best_oid, best_f1, best_sort = scored[0]
        best_off = off_items[best_oid]
        has_kcal = best_off["kcal"] is not None
        brand_match = bool(f_btoks and (f_btoks & best_off["brand_tokens"]))
        # Jesli produkt Fitatu nie ma osobnego pola Brand, wymagamy prawie idealnego pokrycia calej nazwy
        min_auto_sc = 88 if f_btoks else 96
        exact_no_kcal = (not has_kcal) and brand_match and best_f1 >= 0.85 and best_sort >= 90 and best_sc >= 98
        status = "AUTO" if ((best_sc >= min_auto_sc and has_kcal) or exact_no_kcal) else "REVIEW"
        raw_matches.append((best_sc, f_idx, best_oid, status))

    # Gwarancja 1:1
    raw_matches.sort(key=lambda x: -x[0])
    used_codes: Set[str] = set()
    used_fit: Set[int] = set()
    auto_rows = []
    review_rows = []

    for sc, f_idx, oid, status in raw_matches:
        off = off_items[oid]
        code = off["code"]
        if f_idx in used_fit:
            continue
        if status == "AUTO":
            if code in used_codes:
                continue
            used_codes.add(code)
            used_fit.add(f_idx)
            fit = fit_records[f_idx]
            auto_rows.append({
                "source": fit["source"],
                "externalId": fit["externalId"],
                "fitatu_name": fit["name"],
                "fitatu_brand": fit.get("brand") or "",
                "fitatu_kcal": fit["per100g"]["kcal"],
                "ean": code,
                "off_name": off["name"],
                "off_brand": off["brands"],
                "off_kcal": off["kcal"],
                "off_pkg": off["pkg"] or "",
                "fit_pkg": fit.get("packageWeightGrams") or "",
                "salt_100g": off["salt"] if off["salt"] is not None else "",
                "has_ingredients": 1 if off["ingredients"] else 0,
                "score": sc,
            })
        elif len(review_rows) < 400:
            fit = fit_records[f_idx]
            review_rows.append({
                "fitatu_name": fit["name"],
                "fitatu_brand": fit.get("brand") or "",
                "fitatu_kcal": fit["per100g"]["kcal"],
                "ean": code,
                "off_name": off["name"],
                "off_brand": off["brands"],
                "off_kcal": off["kcal"] if off["kcal"] is not None else "",
                "score": sc,
            })

    with open(OUT_DIR / "ean_matches.csv", "w", encoding="utf-8", newline="") as f:
        if auto_rows:
            w = csv.DictWriter(f, fieldnames=list(auto_rows[0].keys()))
            w.writeheader()
            w.writerows(auto_rows)

    with open(OUT_DIR / "ean_review.csv", "w", encoding="utf-8", newline="") as f:
        if review_rows:
            w = csv.DictWriter(f, fieldnames=list(review_rows[0].keys()))
            w.writeheader()
            w.writerows(review_rows)

    print(f"Wynik dopasowania EAN (po zaostrzeniu): AUTO={len(auto_rows)}, REVIEW={len(review_rows)}")
    for r in auto_rows[:15]:
        print(f"  [AUTO {r['score']:5}] {r['fitatu_name'][:34]:34} ({r['fitatu_brand'][:12]:12}, {r['fitatu_kcal']} kcal) == {r['ean']} | {r['off_name'][:34]} ({r['off_brand'][:12]}, {r['off_kcal']} kcal)")
    print("  ...")
    for r in auto_rows[-8:]:
        print(f"  [AUTO {r['score']:5}] {r['fitatu_name'][:34]:34} ({r['fitatu_brand'][:12]:12}, {r['fitatu_kcal']} kcal) == {r['ean']} | {r['off_name'][:34]} ({r['off_brand'][:12]}, {r['off_kcal']} kcal)")


if __name__ == "__main__":
    main()
