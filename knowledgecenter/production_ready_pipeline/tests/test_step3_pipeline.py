#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PACKAGE.parent))

from production_ready_pipeline.api_client import ClinicalTrialsGovClient
from production_ready_pipeline.app_config import load_pipeline_config
from production_ready_pipeline.nccn_classifier import classify_trial
from production_ready_pipeline.site_normalization import SiteNormalizer
from production_ready_pipeline.study_parser import classify_cancer_types, extract_classifier_inputs


PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"
_results: list[tuple[bool, str]] = []


def check(condition: bool, description: str) -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {description}")
    _results.append((condition, description))


def warn(description: str) -> None:
    print(f"  [{WARN}] {description}")


CONFIG = load_pipeline_config(PACKAGE)
CLIENT = ClinicalTrialsGovClient(CONFIG.api)
NORMALIZER = SiteNormalizer(CONFIG.site_config)
EXPECTED_FIELDS = [
    "protocolSection.identificationModule.nctId",
    "protocolSection.identificationModule.briefTitle",
    "protocolSection.statusModule.overallStatus",
    "protocolSection.conditionsModule.conditions",
    "protocolSection.eligibilityModule.eligibilityCriteria",
]


def _extract_field(study: dict, dotpath: str):
    parts = dotpath.split(".")
    obj = study
    for part in parts:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    return obj


def _classify_live_study(study: dict) -> dict[str, str]:
    inputs = extract_classifier_inputs(study)
    cancer_types = classify_cancer_types(inputs["conditions"], inputs["title"])
    primary_cancer_type = cancer_types[0]
    result = classify_trial(
        cancer_type=primary_cancer_type,
        title=inputs["title"],
        eligibility_incl=inputs["eligibility_incl"],
        eligibility_excl=inputs["eligibility_excl"],
        conditions=inputs["conditions"],
        interventions=inputs["interventions"],
        brief_summary=inputs["brief_summary"],
    )
    return {
        "nct": inputs["nct_id"],
        "cancer_type": primary_cancer_type,
        "primary": result.disease_setting_primary,
        "confidence": result.classification_confidence,
    }


def _has_qualifying_socal_site(study: dict) -> bool:
    locations = (
        study.get("protocolSection", {})
        .get("contactsLocationsModule", {})
        .get("locations", [])
    )
    for location in locations:
        state = location.get("state", "")
        city = location.get("city", "")
        facility = location.get("facility", "")
        if state and state not in ("California", "CA"):
            continue
        if not NORMALIZER.is_socal_site(city, facility):
            continue
        institution = NORMALIZER.normalize_facility(facility)
        if institution in NORMALIZER.target_institutions:
            return True
    return False


def test_api_reachable() -> None:
    print("\n[Step 3a] ClinicalTrials.gov API v2 is reachable")
    try:
        studies = CLIENT.query_studies(
            "renal cell carcinoma",
            page_size=1,
            max_pages=1,
            fields="protocolSection.identificationModule.nctId",
            geo_filter=None,
        )
        check(len(studies) >= 1, f"Page of 1 returned {len(studies)} study")
    except Exception as exc:
        check(False, f"API request failed: {exc}")


def test_record_fields() -> None:
    print("\n[Step 3b] Live records contain expected fields")
    try:
        studies = CLIENT.query_studies("testicular cancer", page_size=3, max_pages=1, geo_filter=None)
        check(len(studies) > 0, f"Fetched {len(studies)} testicular cancer records")
        for study in studies[:2]:
            nct_id = _extract_field(study, "protocolSection.identificationModule.nctId") or "?"
            for field in EXPECTED_FIELDS:
                value = _extract_field(study, field)
                check(value is not None, f"{nct_id}: field '{field.split('.')[-1]}' present")
    except Exception as exc:
        check(False, f"Field check failed: {exc}")


def test_recall(*, quick: bool = False) -> None:
    if quick:
        print("\n[Step 3c] Recall test SKIPPED (--quick mode)")
        return

    print("\n[Step 3c] Recall test against control NCT set")
    fixture_path = PACKAGE / "tests" / "fixtures" / "hoag_uci_control_ncts.json"
    if not fixture_path.exists():
        warn(f"Fixture not found: {fixture_path}")
        return

    control_ncts = set(json.loads(fixture_path.read_text(encoding="utf-8"))["nct_ids"])
    check(len(control_ncts) > 0, f"Loaded {len(control_ncts)} control NCT IDs")

    found_ncts: set[str] = set()
    try:
        studies = CLIENT.fetch_all(list(CONFIG.search_terms.primary_terms))
        for study in studies:
            nct_id = _extract_field(study, "protocolSection.identificationModule.nctId")
            if nct_id:
                found_ncts.add(nct_id)
        time.sleep(0.2)
    except Exception as exc:
        warn(f"Pipeline-aligned recall fetch failed: {exc}")

    recalled = control_ncts & found_ncts
    missed = control_ncts - found_ncts
    actionable_misses: list[str] = []
    for nct_id in sorted(missed):
        try:
            study = CLIENT.fetch_study(
                nct_id,
                fields="protocolSection.identificationModule,protocolSection.conditionsModule,protocolSection.contactsLocationsModule,protocolSection.statusModule",
            )
            status = (
                study.get("protocolSection", {})
                .get("statusModule", {})
                .get("overallStatus", "UNKNOWN")
            )
            if status == "RECRUITING" and _has_qualifying_socal_site(study):
                actionable_misses.append(nct_id)
        except Exception as exc:
            warn(f"Status lookup failed for {nct_id}: {exc}")

    recall = len(recalled) / len(control_ncts) * 100 if control_ncts else 0
    check(recall >= 80 or not actionable_misses, f"Recall {recall:.0f}% with {len(actionable_misses)} still-RECRUITING SoCal misses")
    if missed:
        warn(f"Missed control NCTs: {sorted(missed)}")
    if actionable_misses:
        warn(f"Still-RECRUITING SoCal misses requiring investigation: {actionable_misses}")


def test_cancer_type_detection() -> None:
    print("\n[Step 3d] Cancer type detector on live records")
    cases = [
        ("prostate cancer", "Prostate"),
        ("urothelial carcinoma", "Bladder/Urothelial"),
        ("renal cell carcinoma", "Kidney/RCC"),
        ("testicular cancer", "Testicular/GCT"),
    ]
    for query, expected in cases:
        try:
            studies = CLIENT.query_studies(
                query,
                page_size=5,
                max_pages=1,
                fields="protocolSection.identificationModule,protocolSection.conditionsModule",
                geo_filter=None,
            )
            if not studies:
                warn(f"No studies returned for '{query}'")
                continue
            detections = []
            for study in studies[:3]:
                title = _extract_field(study, "protocolSection.identificationModule.briefTitle") or ""
                conditions = _extract_field(study, "protocolSection.conditionsModule.conditions") or []
                detected = classify_cancer_types("; ".join(conditions), title)
                detections.append(detected)
            check(any(expected in detected for detected in detections), f"'{query}' produced detection including '{expected}'")
        except Exception as exc:
            check(False, f"Detection failed for '{query}': {exc}")


def test_end_to_end() -> None:
    print("\n[Step 3e] End-to-end classify on live records")
    for query in ["renal cell carcinoma", "testicular cancer"]:
        try:
            studies = CLIENT.query_studies(query, page_size=5, max_pages=1, geo_filter=CONFIG.api.geo_filter)
            classified = 0
            for study in studies:
                _classify_live_study(study)
                classified += 1
            check(classified == len(studies), f"'{query}': classified {classified}/{len(studies)} records without error")
        except Exception as exc:
            check(False, f"End-to-end failed for '{query}': {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="Skip the full recall test")
    args = parser.parse_args()

    test_api_reachable()
    test_record_fields()
    test_recall(quick=args.quick)
    test_cancer_type_detection()
    test_end_to_end()

    passed = sum(1 for ok, _ in _results if ok)
    total = len(_results)
    print(f"\n{'=' * 50}")
    print(f"Step 3 results: {passed}/{total} checks passed")
    if passed < total:
        print("Failed checks:")
        for ok, description in _results:
            if not ok:
                print(f"  - {description}")
        sys.exit(1)
    print("All Step 3 pipeline checks passed.")
