#!/usr/bin/env python3
"""
tests/test_step1_load.py
========================
Step 1 control: NCCN taxonomy JSON models load correctly.

Tests that every expected taxonomy file is present, valid JSON,
and contains the required top-level keys before any classification runs.

Run:
    python3 tests/test_step1_load.py
    # or: python3 -m pytest tests/test_step1_load.py -v
"""

import sys
import json
from pathlib import Path

# ── Make repo root importable ─────────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

# ── Test helpers ──────────────────────────────────────────────────────────────

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results: list[tuple[bool, str]] = []

def check(condition: bool, description: str) -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {description}")
    _results.append((condition, description))


# ── Step 1a: Files exist ──────────────────────────────────────────────────────

def test_files_exist() -> None:
    print("\n[Step 1a] Expected taxonomy files are present")
    models_dir = REPO / "nccn_input" / "models"
    expected = [
        "bladder_v3_2025.json",
        "prostate_v5_2026.json",
        "kidney_v1_2026.json",
        "testicular_v1_2026.json",
    ]
    for fname in expected:
        path = models_dir / fname
        check(path.exists(), f"{fname} exists at {path.relative_to(REPO)}")


# ── Step 1b: Files are valid JSON ─────────────────────────────────────────────

def test_files_valid_json() -> None:
    print("\n[Step 1b] Taxonomy files parse as valid JSON")
    models_dir = REPO / "nccn_input" / "models"
    for path in sorted(models_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            check(isinstance(data, dict), f"{path.name} parses as dict")
        except json.JSONDecodeError as e:
            check(False, f"{path.name} JSON parse error: {e}")


# ── Step 1c: Required top-level keys ─────────────────────────────────────────

REQUIRED_KEYS = ["disease", "nccn_version", "nccn_date", "categories"]
# bladder_v3_2025 uses bcg_status_rules/cisplatin_status_rules instead of clinical_axes
AXES_KEY_BY_FILE = {
    "bladder_v3_2025.json":    "bcg_status_rules",   # bladder-specific axis format
    "prostate_v5_2026.json":   "clinical_axes",
    "kidney_v1_2026.json":     "clinical_axes",
    "testicular_v1_2026.json": "clinical_axes",
}

def test_required_keys() -> None:
    print("\n[Step 1c] Taxonomy files contain required top-level keys")
    models_dir = REPO / "nccn_input" / "models"
    for path in sorted(models_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for key in REQUIRED_KEYS:
            check(key in data, f"{path.name} has key '{key}'")
        # Check axes key (format differs for bladder)
        axes_key = AXES_KEY_BY_FILE.get(path.name, "clinical_axes")
        check(axes_key in data, f"{path.name} has key '{axes_key}'")


# ── Step 1d: Categories have required fields ──────────────────────────────────

CAT_REQUIRED = ["id", "label", "short", "section", "order", "include_patterns", "exclude_patterns"]

def test_category_structure() -> None:
    print("\n[Step 1d] Each category has required fields")
    models_dir = REPO / "nccn_input" / "models"
    for path in sorted(models_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        cats = data.get("categories", [])
        check(len(cats) > 0, f"{path.name} has at least 1 category (found {len(cats)})")
        for cat in cats[:3]:  # spot-check first 3
            for field in CAT_REQUIRED:
                check(field in cat, f"{path.name} / category '{cat.get('id','?')}' has field '{field}'")


# ── Step 1e: nccn_classifier imports and loads taxonomies ────────────────────

def test_classifier_import() -> None:
    print("\n[Step 1e] nccn_classifier imports without errors and loads all 4 taxonomies")
    try:
        from nccn_classifier import list_loaded_taxonomies, get_nccn_stamp
        loaded = list_loaded_taxonomies()
        check(len(loaded) == 4, f"All 4 taxonomies loaded (got {len(loaded)}): {loaded}")
        for ct, expected_prefix in [
            ("Bladder/Urothelial", "NCCN Bladder Cancer"),
            ("Prostate",           "NCCN Prostate Cancer"),
            ("Kidney/RCC",         "NCCN Kidney Cancer"),
            ("Testicular/GCT",     "NCCN Testicular Cancer"),
        ]:
            stamp = get_nccn_stamp(ct)
            check(stamp.startswith(expected_prefix), f"get_nccn_stamp('{ct}') = '{stamp}'")
    except ImportError as e:
        check(False, f"Import error: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_files_exist()
    test_files_valid_json()
    test_required_keys()
    test_category_structure()
    test_classifier_import()

    passed = sum(1 for ok, _ in _results if ok)
    total  = len(_results)
    print(f"\n{'='*50}")
    print(f"Step 1 results: {passed}/{total} checks passed")
    if passed < total:
        print("Failed checks:")
        for ok, desc in _results:
            if not ok:
                print(f"  - {desc}")
        sys.exit(1)
    else:
        print("All Step 1 checks passed.")
