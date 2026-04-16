#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PACKAGE.parent))

from production_ready_pipeline.app_config import load_pipeline_config
from production_ready_pipeline.nccn_classifier import get_nccn_stamp, list_loaded_taxonomies


PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results: list[tuple[bool, str]] = []


def check(condition: bool, description: str) -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {description}")
    _results.append((condition, description))


def test_files_exist() -> None:
    print("\n[Step 1a] Expected taxonomy files are present")
    models_dir = PACKAGE / "nccn_input" / "models"
    expected = [
        "bladder_v3_2025.json",
        "prostate_v5_2026.json",
        "kidney_v1_2026.json",
        "testicular_v1_2026.json",
    ]
    for filename in expected:
        path = models_dir / filename
        check(path.exists(), f"{filename} exists at {path.relative_to(PACKAGE)}")


def test_files_valid_json() -> None:
    print("\n[Step 1b] Taxonomy files parse as valid JSON")
    models_dir = PACKAGE / "nccn_input" / "models"
    for path in sorted(models_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            check(isinstance(data, dict), f"{path.name} parses as dict")
        except json.JSONDecodeError as exc:
            check(False, f"{path.name} JSON parse error: {exc}")


def test_required_keys() -> None:
    print("\n[Step 1c] Taxonomy files contain required top-level keys")
    models_dir = PACKAGE / "nccn_input" / "models"
    required_keys = ["disease", "nccn_version", "nccn_date", "categories"]
    axes_key_by_file = {
        "bladder_v3_2025.json": "bcg_status_rules",
        "prostate_v5_2026.json": "clinical_axes",
        "kidney_v1_2026.json": "clinical_axes",
        "testicular_v1_2026.json": "clinical_axes",
    }
    for path in sorted(models_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for key in required_keys:
            check(key in data, f"{path.name} has key '{key}'")
        axes_key = axes_key_by_file[path.name]
        check(axes_key in data, f"{path.name} has key '{axes_key}'")


def test_config_loads() -> None:
    print("\n[Step 1d] Pipeline config loads cleanly")
    config = load_pipeline_config(PACKAGE)
    check(len(config.search_terms.primary_terms) > 0, "Primary search terms loaded")
    check(len(config.site_config.cities) > 0, "SoCal city allowlist loaded")
    check(len(config.site_config.pi_aliases) > 0, "PI alias map loaded")
    check(config.output_dir.name == "output", "Default output directory is configured")


def test_classifier_import() -> None:
    print("\n[Step 1e] Classifier loads all 4 taxonomies")
    loaded = list_loaded_taxonomies()
    check(len(loaded) == 4, f"All 4 taxonomies loaded (got {len(loaded)}): {loaded}")
    for cancer_type, expected_prefix in [
        ("Bladder/Urothelial", "NCCN Bladder Cancer"),
        ("Prostate", "NCCN Prostate Cancer"),
        ("Kidney/RCC", "NCCN Kidney Cancer"),
        ("Testicular/GCT", "NCCN Testicular Cancer"),
    ]:
        stamp = get_nccn_stamp(cancer_type)
        check(stamp.startswith(expected_prefix), f"get_nccn_stamp('{cancer_type}') = '{stamp}'")


if __name__ == "__main__":
    test_files_exist()
    test_files_valid_json()
    test_required_keys()
    test_config_loads()
    test_classifier_import()

    passed = sum(1 for ok, _ in _results if ok)
    total = len(_results)
    print(f"\n{'=' * 50}")
    print(f"Step 1 results: {passed}/{total} checks passed")
    if passed < total:
        print("Failed checks:")
        for ok, description in _results:
            if not ok:
                print(f"  - {description}")
        sys.exit(1)
    print("All Step 1 checks passed.")
