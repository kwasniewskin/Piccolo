"""Faza 5: Eksport kanonicznego pliku out/products.v1.jsonl ze staging.db + core_mapping.csv."""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "out"
STAGING_DB = OUT_DIR / "staging.db"


def load_overrides() -> Dict[str, dict]:
    p = DATA_DIR / "core_overrides.csv"
    if not p.exists():
        return {}
    with open(p, encoding="utf-8", newline="") as f:
        return {r["core_id"]: r for r in csv.DictReader(f)}


def fetch_units(con: sqlite3.Connection, staging_id: int) -> List[dict]:
    rows = con.execute(
        "SELECT unit_key, grams_per_unit FROM staging_units WHERE staging_product_id = ?",
        (staging_id,),
    ).fetchall()
    return [{"key": r[0], "grams": r[1]} for r in rows]


def build_record(
    row: sqlite3.Row,
    name_pl: str,
    category_slug: Optional[str],
    kind: str,
    prep_state: Optional[str],
    is_verified: bool,
    units: List[dict],
    extra_refs: Optional[List[dict]] = None,
) -> dict:
    per100 = {
        "kcal": row["kcal"],
        "protein": row["protein"],
        "fat": row["fat"],
        "carbs": row["carbs"],
    }
    for col, key in (
        ("saturated_fat", "saturatedFat"),
        ("sugars", "sugars"),
        ("fiber", "fiber"),
        ("salt", "salt"),
        ("cholesterol_mg", "cholesterolMg"),
        ("monounsaturated_fat", "monounsaturatedFat"),
        ("polyunsaturated_fat", "polyunsaturatedFat"),
    ):
        if row[col] is not None:
            per100[key] = row[col]

    rec = {
        "source": row["source"],
        "externalId": row["external_id"],
        "name": name_pl,
        "originalName": row["original_name"],
        "brand": row["brand"],
        "manufacturer": row["manufacturer"],
        "category": category_slug,
        "kind": kind,
        "state": prep_state,
        "isVerified": is_verified,
        "packageWeightGrams": row["package_weight_grams"],
        "defaultServingGrams": row["default_serving_grams"],
        "per100g": per100,
        "units": units,
    }
    if extra_refs:
        rec["extraRefs"] = extra_refs
    return rec


def main() -> None:
    con = sqlite3.connect(STAGING_DB)
    con.row_factory = sqlite3.Row

    by_key: Dict[Tuple[str, str], sqlite3.Row] = {}
    for r in con.execute("SELECT * FROM staging_products WHERE rejected=0").fetchall():
        by_key[(r["source"], r["external_id"])] = r

    overrides = load_overrides()
    manual_replaces: Dict[str, dict] = {}
    manual_extras: List[dict] = []
    manual_path = DATA_DIR / "manual_polish.jsonl"
    if manual_path.exists():
        with open(manual_path, encoding="utf-8") as mf:
            for line in mf:
                if not line.strip():
                    continue
                mrec = json.loads(line)
                rep = mrec.pop("replacesCoreId", None)
                if rep:
                    manual_replaces[rep] = mrec
                else:
                    manual_extras.append(mrec)

    with open(DATA_DIR / "core_list.csv", encoding="utf-8", newline="") as f:
        core_meta = {r["core_id"]: r for r in csv.DictReader(f)}

    out_path = OUT_DIR / "products.v1.jsonl"
    records: List[dict] = []
    exported_keys = set()
    core_count = 0

    with open(OUT_DIR / "core_mapping.csv", encoding="utf-8", newline="") as f:
        for m in csv.DictReader(f):
            cid = m["core_id"]
            if cid in manual_replaces:
                mrec = manual_replaces[cid]
                records.append(mrec)
                exported_keys.add((mrec["source"], mrec["externalId"]))
                core_count += 1
                continue
            meta = core_meta[cid]
            ov = overrides.get(cid)
            src = ov["source"] if ov and ov.get("source") else m["source"]
            ext = ov["external_id"] if ov and ov.get("external_id") else m["external_id"]
            if not src or not ext:
                continue
            row = by_key.get((src, ext))
            if not row:
                print(f"UWAGA: brak rekordu w staging dla core_id={cid} ({src}:{ext})")
                continue

            # Jednostki z rekordu podstawowego albo z powiazanego rekordu USDA
            unit_src = ov["unit_source"] if ov and ov.get("unit_source") else m["unit_source"]
            unit_ext = ov["unit_external_id"] if ov and ov.get("unit_external_id") else m["unit_external_id"]
            unit_row = by_key.get((unit_src, unit_ext)) if unit_src and unit_ext else row
            units = fetch_units(con, unit_row["id"]) if unit_row else []

            extra_refs = []
            if unit_row and (unit_row["source"], unit_row["external_id"]) != (src, ext):
                extra_refs.append({
                    "source": unit_row["source"],
                    "externalId": unit_row["external_id"],
                    "originalName": unit_row["original_name"],
                })

            rec = build_record(
                row=row,
                name_pl=meta["name_pl"],
                category_slug=meta["category_slug"] or row["category_slug"],
                kind="generic",
                prep_state=meta["prep_state"] or row["prep_state"],
                is_verified=True,
                units=units,
                extra_refs=extra_refs,
            )
            # Jesli jednostkowy rekord ma package/portion a glowny nie ma - uzupelnij
            if rec["defaultServingGrams"] is None and unit_row and unit_row["default_serving_grams"] is not None:
                rec["defaultServingGrams"] = unit_row["default_serving_grams"]
            records.append(rec)
            exported_keys.add((row["source"], row["external_id"]))
            core_count += 1

    for mrec in manual_extras:
        records.append(mrec)
        exported_keys.add((mrec["source"], mrec["externalId"]))
        core_count += 1

    # Warstwa 2: Fitatu (z deduplikacja po znormalizowanej nazwie + marce -> zostawiamy pelniejszy)
    fitatu_rows = con.execute(
        "SELECT * FROM staging_products WHERE source='FITATU' AND rejected=0 ORDER BY id"
    ).fetchall()
    unit_map: Dict[int, List[dict]] = {}
    for sid, uk, g in con.execute(
        "SELECT staging_product_id, unit_key, grams_per_unit FROM staging_units"
    ).fetchall():
        unit_map.setdefault(sid, []).append({"key": uk, "grams": g})

    seen_nb: Dict[Tuple[str, str], int] = {}
    fitatu_dedup: List[sqlite3.Row] = []

    def richness(r: sqlite3.Row) -> int:
        return sum(1 for c in ("saturated_fat", "sugars", "fiber", "cholesterol_mg") if r[c] is not None) + len(unit_map.get(r["id"], []))

    for r in fitatu_rows:
        if (r["source"], r["external_id"]) in exported_keys:
            continue
        nb = (r["search_name"], (r["brand"] or "").lower())
        if nb in seen_nb:
            idx = seen_nb[nb]
            if richness(r) > richness(fitatu_dedup[idx]):
                fitatu_dedup[idx] = r
        else:
            seen_nb[nb] = len(fitatu_dedup)
            fitatu_dedup.append(r)

    for r in fitatu_dedup:
        records.append(
            build_record(
                row=r,
                name_pl=r["name_pl"] or r["original_name"],
                category_slug=r["category_slug"],
                kind=r["kind"],
                prep_state=r["prep_state"],
                is_verified=False,
                units=unit_map.get(r["id"], []),
            )
        )

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    summary = {
        "core_verified": core_count,
        "fitatu_before_dedup": len(fitatu_rows),
        "fitatu_after_dedup": len(fitatu_dedup),
        "total_exported": len(records),
        "output_file": str(out_path),
    }
    with open(OUT_DIR / "export_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("Eksport zakonczony:", summary)
    con.close()


if __name__ == "__main__":
    main()
