"""Faza 2: Buduje baze stagingowa out/staging.db ze wszystkich 4 zrodel i drukuje raport walidacji."""
from __future__ import annotations

import collections
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "data-raw"
OUT_DIR = ROOT / "out"
OUT_DIR.mkdir(parents=True, exist_ok=True)
STAGING_DB = OUT_DIR / "staging.db"

from sources.ciqual import iter_ciqual
from sources.common import load_category_map, load_unit_map, make_search_name, sha256_file
from sources.fitatu import iter_fitatu
from sources.usda import iter_usda


SCHEMA = """
DROP TABLE IF EXISTS staging_units;
DROP TABLE IF EXISTS staging_issues;
DROP TABLE IF EXISTS staging_products;
DROP TABLE IF EXISTS source_files;

CREATE TABLE source_files (
    source TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    accepted_rows INTEGER NOT NULL,
    rejected_rows INTEGER NOT NULL
);

CREATE TABLE staging_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    name_pl TEXT,
    search_name TEXT NOT NULL,
    brand TEXT,
    manufacturer TEXT,
    category_slug TEXT,
    kind TEXT NOT NULL,
    prep_state TEXT,
    kcal REAL,
    protein REAL,
    fat REAL,
    carbs REAL,
    saturated_fat REAL,
    sugars REAL,
    fiber REAL,
    salt REAL,
    cholesterol_mg REAL,
    monounsaturated_fat REAL,
    polyunsaturated_fat REAL,
    package_weight_grams REAL,
    default_serving_grams REAL,
    rejected INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source, external_id)
);

CREATE INDEX idx_sp_source ON staging_products(source);
CREATE INDEX idx_sp_search ON staging_products(search_name);
CREATE INDEX idx_sp_cat ON staging_products(category_slug);

CREATE TABLE staging_units (
    staging_product_id INTEGER NOT NULL,
    unit_key TEXT NOT NULL,
    grams_per_unit REAL NOT NULL,
    FOREIGN KEY(staging_product_id) REFERENCES staging_products(id) ON DELETE CASCADE
);

CREATE TABLE staging_issues (
    staging_product_id INTEGER NOT NULL,
    severity TEXT NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY(staging_product_id) REFERENCES staging_products(id) ON DELETE CASCADE
);
"""


def main() -> None:
    cat_map = load_category_map()
    unit_map = load_unit_map()

    if STAGING_DB.exists():
        STAGING_DB.unlink()

    con = sqlite3.connect(STAGING_DB)
    con.executescript(SCHEMA)

    sources = [
        ("FITATU", RAW_DIR / "fitatu.json", lambda: iter_fitatu(RAW_DIR / "fitatu.json", cat_map, unit_map)),
        ("USDA_FND", RAW_DIR / "usda_foundation.json", lambda: iter_usda(RAW_DIR / "usda_foundation.json", "USDA_FND", cat_map, unit_map)),
        ("USDA_SR", RAW_DIR / "usda_sr_legacy.json", lambda: iter_usda(RAW_DIR / "usda_sr_legacy.json", "USDA_SR", cat_map, unit_map)),
        ("CIQUAL", RAW_DIR / "ciqual" / "alim_2025_11_03.xml", lambda: iter_ciqual(RAW_DIR / "ciqual", cat_map)),
    ]

    issue_summary = collections.Counter()
    unit_summary = collections.Counter()

    with con:
        for src_code, file_path, it_fn in sources:
            sha = sha256_file(file_path)
            total = accepted = rejected = 0
            for p in it_fn():
                total += 1
                if p.rejected:
                    rejected += 1
                else:
                    accepted += 1
                cur = con.execute(
                    """INSERT INTO staging_products (
                        source, external_id, original_name, name_pl, search_name,
                        brand, manufacturer, category_slug, kind, prep_state,
                        kcal, protein, fat, carbs, saturated_fat, sugars, fiber, salt,
                        cholesterol_mg, monounsaturated_fat, polyunsaturated_fat,
                        package_weight_grams, default_serving_grams, rejected
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        p.source, p.external_id, p.original_name, p.name_pl,
                        make_search_name(p.name_pl or p.original_name),
                        p.brand, p.manufacturer, p.category_slug, p.kind, p.prep_state,
                        p.kcal, p.protein, p.fat, p.carbs, p.saturated_fat, p.sugars,
                        p.fiber, p.salt, p.cholesterol_mg, p.monounsaturated_fat,
                        p.polyunsaturated_fat, p.package_weight_grams, p.default_serving_grams,
                        1 if p.rejected else 0,
                    ),
                )
                pid = cur.lastrowid
                if p.units:
                    con.executemany(
                        "INSERT INTO staging_units (staging_product_id, unit_key, grams_per_unit) VALUES (?,?,?)",
                        [(pid, u.unit_key, u.grams_per_unit) for u in p.units],
                    )
                    for u in p.units:
                        unit_summary[u.unit_key] += 1
                if p.issues:
                    con.executemany(
                        "INSERT INTO staging_issues (staging_product_id, severity, code) VALUES (?,?,?)",
                        [(pid, sev, code) for sev, code in p.issues],
                    )
                    for sev, code in p.issues:
                        issue_summary[(src_code, sev, code)] += 1

            con.execute(
                "INSERT INTO source_files (source, file_path, sha256, total_rows, accepted_rows, rejected_rows) VALUES (?,?,?,?,?,?)",
                (src_code, str(file_path.name), sha, total, accepted, rejected),
            )
            print(f"[{src_code:8}] total={total:5} accepted={accepted:5} rejected={rejected:3} sha={sha[:12]}...")

    print("\n=== Błędy i ostrzeżenia walidacji ===")
    for (src, sev, code), cnt in sorted(issue_summary.items()):
        print(f"  {src:8} {sev:5} {code:28} -> {cnt}")

    print("\n=== Zmapowane jednostki w staging_units ===")
    for k, cnt in unit_summary.most_common():
        print(f"  {k:14} -> {cnt}")

    unmapped_cats = con.execute("SELECT source, count(*) FROM staging_products WHERE category_slug IS NULL GROUP BY source").fetchall()
    print("\n=== Brak mapowania kategorii ===", unmapped_cats)
    con.close()


if __name__ == "__main__":
    main()
