"""Strumieniowe pobieranie polskich produktow z oficjalnego zrzutu Open Food Facts (TSV.GZ, 1 polaczenie HTTP)."""
from __future__ import annotations

import json
import sys
import urllib.request
import zlib
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
OUT_JSONL = Path(__file__).resolve().parent / "data-raw" / "off_poland.jsonl"


def _f(val: str) -> float | None:
    if not val:
        return None
    try:
        return float(val)
    except ValueError:
        return None


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": "PiccoloCatalogETL/1.0"})
    decomp = zlib.decompressobj(16 + zlib.MAX_WBITS)

    buf = b""
    header_map: dict[str, int] | None = None
    total = 0
    kept = 0

    with urllib.request.urlopen(req, timeout=120) as resp, open(OUT_JSONL, "w", encoding="utf-8") as out:
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            data = buf + decomp.decompress(chunk)
            lines = data.split(b"\n")
            buf = lines.pop()  # niekompletna ostatnia linia

            for raw_line in lines:
                line = raw_line.rstrip(b"\r").decode("utf-8", errors="replace")
                if header_map is None:
                    cols = line.split("\t")
                    header_map = {c: i for i, c in enumerate(cols)}
                    i_code = header_map["code"]
                    i_name = header_map["product_name"]
                    i_brands = header_map["brands"]
                    i_qty = header_map["quantity"]
                    i_srv = header_map.get("serving_quantity", -1)
                    i_ctry = header_map["countries_tags"]
                    i_ing = header_map.get("ingredients_text", -1)
                    i_kcal = header_map.get("energy-kcal_100g", -1)
                    i_prot = header_map.get("proteins_100g", -1)
                    i_fat = header_map.get("fat_100g", -1)
                    i_carb = header_map.get("carbohydrates_100g", -1)
                    i_salt = header_map.get("salt_100g", -1)
                    i_sat = header_map.get("saturated-fat_100g", -1)
                    i_sug = header_map.get("sugars_100g", -1)
                    i_fib = header_map.get("fiber_100g", -1)
                    print(f"Naglowek OFF TSV OK ({len(cols)} kolumn)")
                    continue

                total += 1
                parts = line.split("\t")
                if len(parts) <= max(i_code, i_name, i_brands, i_ctry):
                    continue

                code = parts[i_code].strip()
                if not (8 <= len(code) <= 14):
                    continue

                ctry = parts[i_ctry]
                if "poland" not in ctry and not code.startswith("590"):
                    continue

                name = parts[i_name].strip()
                if not name:
                    continue

                def get(idx: int) -> str:
                    return parts[idx].strip() if 0 <= idx < len(parts) else ""

                rec = {
                    "code": code,
                    "name_pl": name,
                    "name_main": name,
                    "brands": get(i_brands) or None,
                    "quantity": get(i_qty) or None,
                    "product_quantity": None,
                    "serving_quantity": _f(get(i_srv)),
                    "ingredients_pl": get(i_ing) or None,
                    "kcal_100g": _f(get(i_kcal)),
                    "protein_100g": _f(get(i_prot)),
                    "fat_100g": _f(get(i_fat)),
                    "carbs_100g": _f(get(i_carb)),
                    "salt_100g": _f(get(i_salt)),
                    "satfat_100g": _f(get(i_sat)),
                    "sugars_100g": _f(get(i_sug)),
                    "fiber_100g": _f(get(i_fib)),
                }
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                kept += 1

                if total % 500000 == 0:
                    print(f"  przeskanowano {total:,} wierszy, zapisano PL: {kept:,}")

    print(f"Gotowe! Przeskanowano {total:,} rekordow OFF, zapisano polskich: {kept:,} -> {OUT_JSONL}")


if __name__ == "__main__":
    main()
