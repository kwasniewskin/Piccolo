"""Wzbogaca wyeksportowany katalog out/products.v1.jsonl o dopasowane kody EAN, sol i sklad z OFF."""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
DATA_RAW = ROOT / "data-raw"
OUT_DIR = ROOT / "out"


def main() -> None:
    matches = {}
    with open(OUT_DIR / "ean_matches.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            matches[(r["source"], r["externalId"])] = r["ean"]

    off_by_code = {}
    with open(DATA_RAW / "off_poland.jsonl", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            if r.get("code") in matches.values():
                off_by_code[r["code"]] = r

    in_path = OUT_DIR / "products.v1.jsonl"
    records = [json.loads(l) for l in open(in_path, encoding="utf-8")]

    added_ean = added_salt = added_ing = 0
    for rec in records:
        ean = matches.get((rec["source"], rec["externalId"]))
        if not ean:
            continue
        rec["barcode"] = ean
        added_ean += 1
        off = off_by_code.get(ean)
        if not off:
            continue
        if rec["per100g"].get("salt") is None and off.get("salt_100g") is not None:
            s = float(off["salt_100g"])
            if 0 <= s <= 100:
                rec["per100g"]["salt"] = round(s, 2)
                added_salt += 1
        if not rec.get("ingredients") and off.get("ingredients_pl"):
            ing = off["ingredients_pl"].strip()
            if ing:
                rec["ingredients"] = ing[:1500]
                added_ing += 1

    with open(in_path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Wzbogacono katalog: EAN={added_ean}, salt={added_salt}, ingredients={added_ing} (z {len(records)} produktow)")


if __name__ == "__main__":
    main()
