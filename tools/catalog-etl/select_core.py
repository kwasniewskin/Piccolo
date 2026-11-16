"""Faza 3: Szybkie automatyczne dopasowanie core_list.csv do kandydatow w staging.db."""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
from pathlib import Path
from typing import List, Optional, Set

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "out"
STAGING_DB = OUT_DIR / "staging.db"

SOURCE_PRIORITY = {"USDA_FND": 30, "CIQUAL": 20, "USDA_SR": 10}
GLOBAL_EXCLUDES = {"babyfood", "infant", "toddler"}
_WORD_RE = re.compile(r"[a-z0-9%.-]+")


def tokenize(s: str) -> Set[str]:
    return set(_WORD_RE.findall(s.lower()))


def score_candidate(
    row: sqlite3.Row,
    name_low: str,
    tokens_set: Set[str],
    phrases: List[List[str]],
    excludes: List[str],
    core: dict,
) -> Optional[float]:
    if tokens_set & GLOBAL_EXCLUDES:
        return None
    for ex in excludes:
        if " " in ex:
            if ex in name_low:
                return None
        elif ex in tokens_set:
            return None

    best_phrase_score = -1.0
    for idx, p_tokens in enumerate(phrases):
        if all(t in tokens_set for t in p_tokens):
            s = 100.0 - idx * 8.0
            if name_low.startswith(p_tokens[0]):
                s += 25.0
            if " ".join(p_tokens) in name_low:
                s += 15.0
            s -= len(name_low) * 0.25
            if s > best_phrase_score:
                best_phrase_score = s

    if best_phrase_score < 0:
        return None

    kcal = row["kcal"]
    kmin, kmax = float(core["kcal_min"]), float(core["kcal_max"])
    if kcal is None or not (kmin <= kcal <= kmax):
        return None

    score = best_phrase_score + SOURCE_PRIORITY.get(row["source"], 0)
    if core["prep_state"] and row["prep_state"] == core["prep_state"]:
        score += 18.0
    elif core["prep_state"] and row["prep_state"] and row["prep_state"] != core["prep_state"]:
        score -= 35.0
    if core["category_slug"] and row["category_slug"] == core["category_slug"]:
        score += 12.0
    if row["salt"] is not None:
        score += 3.0
    return round(score, 2)


def main() -> None:
    con = sqlite3.connect(STAGING_DB)
    con.row_factory = sqlite3.Row

    rows = con.execute(
        "SELECT * FROM staging_products WHERE source IN ('USDA_FND', 'CIQUAL', 'USDA_SR') AND rejected=0"
    ).fetchall()
    pool = [(r, r["original_name"].lower(), tokenize(r["original_name"])) for r in rows]

    unit_counts = dict(con.execute(
        "SELECT staging_product_id, count(*) FROM staging_units GROUP BY staging_product_id"
    ).fetchall())

    with open(DATA_DIR / "core_list.csv", encoding="utf-8", newline="") as f:
        cores = list(csv.DictReader(f))

    mapping_rows = []
    review_rows = []
    counts = {"AUTO": 0, "REVIEW": 0, "MISSING": 0}

    for core in cores:
        excludes = [e.strip().lower() for e in core["exclude_en"].split("|") if e.strip()]
        phrases = [
            [t for t in _WORD_RE.findall(ph.lower()) if t]
            for ph in core["search_en"].split("|") if ph.strip()
        ]
        scored = []
        for r, name_low, tok_set in pool:
            sc = score_candidate(r, name_low, tok_set, phrases, excludes, core)
            if sc is not None:
                if unit_counts.get(r["id"], 0) > 0:
                    sc += 4.0
                scored.append((sc, r))
        scored.sort(key=lambda x: -x[0])

        if not scored:
            counts["MISSING"] += 1
            mapping_rows.append({
                "core_id": core["core_id"], "name_pl": core["name_pl"], "status": "MISSING",
                "source": "", "external_id": "", "original_name": "",
                "kcal": "", "protein": "", "fat": "", "carbs": "", "salt": "",
                "unit_source": "", "unit_external_id": "", "score": 0,
            })
            review_rows.append({
                "core_id": core["core_id"], "name_pl": core["name_pl"], "status": "MISSING",
                "search_en": core["search_en"], "cand_1": "", "cand_2": "", "cand_3": "",
            })
            continue

        best_sc, best = scored[0]
        unit_src = best["source"] if unit_counts.get(best["id"], 0) > 0 else ""
        unit_ext = best["external_id"] if unit_src else ""
        if not unit_src:
            for _, r2 in scored:
                if r2["source"] in ("USDA_FND", "USDA_SR") and unit_counts.get(r2["id"], 0) > 0:
                    unit_src = r2["source"]
                    unit_ext = r2["external_id"]
                    break

        gap = best_sc - scored[1][0] if len(scored) > 1 else 99.0
        kcal_diff = abs((best["kcal"] or 0) - (scored[1][1]["kcal"] or 0)) if len(scored) > 1 else 0
        status = "AUTO" if (best_sc >= 110 and not (gap < 5 and kcal_diff > 25)) else "REVIEW"
        counts[status] += 1

        mapping_rows.append({
            "core_id": core["core_id"], "name_pl": core["name_pl"], "status": status,
            "source": best["source"], "external_id": best["external_id"], "original_name": best["original_name"],
            "kcal": best["kcal"], "protein": best["protein"], "fat": best["fat"], "carbs": best["carbs"],
            "salt": best["salt"] if best["salt"] is not None else "",
            "unit_source": unit_src, "unit_external_id": unit_ext, "score": best_sc,
        })
        if status != "AUTO":
            top3 = [
                f"{r['source']}:{r['external_id']} | {r['original_name']} ({r['kcal']} kcal, B:{r['protein']} T:{r['fat']} W:{r['carbs']})"
                for _, r in scored[:3]
            ] + ["", "", ""]
            review_rows.append({
                "core_id": core["core_id"], "name_pl": core["name_pl"], "status": status,
                "search_en": core["search_en"], "cand_1": top3[0], "cand_2": top3[1], "cand_3": top3[2],
            })

    with open(OUT_DIR / "core_mapping.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(mapping_rows[0].keys()))
        w.writeheader()
        w.writerows(mapping_rows)

    with open(OUT_DIR / "review.csv", "w", encoding="utf-8", newline="") as f:
        fields = ["core_id", "name_pl", "status", "search_en", "cand_1", "cand_2", "cand_3"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(review_rows)

    print(f"=== Dopasowanie core_list ({len(cores)} pozycji): {counts} ===")
    for r in review_rows:
        print(f"  [{r['status']:7}] {r['core_id']:26} -> {r['cand_1'][:85]}")
    con.close()


if __name__ == "__main__":
    main()
