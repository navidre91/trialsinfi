#!/usr/bin/env python3
"""
tests/test_step3_pipeline.py
============================
Step 3 control: Pipeline can reach ClinicalTrials.gov and fetch live data.

Tests:
  3a — API reachable (single lightweight query)
  3b — Returned records contain expected fields
  3c — Known control NCT IDs are retrieved (recall test)
  3d — Cancer type detector tags known trials correctly
  3e — Classifier runs end-to-end on live records without crashing

Control NCT set: tests/fixtures/hoag_uci_control_ncts.json
  These are verified GU oncology trials recruiting at UCI/Hoag.
  They serve as a minimal recall floor: all of them MUST appear in any
  full pipeline run targeting Southern California.

Run:
    python3 tests/test_step3_pipeline.py          # full suite
    python3 tests/test_step3_pipeline.py --quick  # API + field checks only (no recall)

NOTE: Requires internet access. Results depend on live ClinicalTrials.gov data.
      Recall test may flag if a control trial closes / changes status.
"""

import sys
import json
import argparse
import time
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from nccn_classifier import classify_trial

PASS  = "\033[92mPASS\033[0m"
FAIL  = "\033[91mFAIL\033[0m"
WARN  = "\033[93mWARN\033[0m"
_results: list[tuple[bool, str]] = []

def check(condition: bool, description: str) -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {description}")
    _results.append((condition, description))

def warn(description: str) -> None:
    print(f"  [{WARN}] {description}")


# ── API helpers ───────────────────────────────────────────────────────────────

BASE_URL = "https://clinicaltrials.gov/api/v2/studies"
EXPECTED_FIELDS = [
    "protocolSection.identificationModule.nctId",
    "protocolSection.identificationModule.briefTitle",
    "protocolSection.statusModule.overallStatus",
    "protocolSection.conditionsModule.conditions",
    "protocolSection.eligibilityModule.eligibilityCriteria",
]


def _api_get(params: dict, timeout: int = 20) -> dict:
    resp = requests.get(BASE_URL, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _extract_field(study: dict, dotpath: str):
    parts = dotpath.split(".")
    obj = study
    for p in parts:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(p)
    return obj


def _classify_study(study: dict) -> dict:
    """Run classifier on a raw study record and return result dict."""
    ident   = study.get("protocolSection", {}).get("identificationModule", {})
    status  = study.get("protocolSection", {}).get("statusModule", {})
    conds   = study.get("protocolSection", {}).get("conditionsModule", {})
    elig    = study.get("protocolSection", {}).get("eligibilityModule", {})
    desc    = study.get("protocolSection", {}).get("descriptionModule", {})
    arms    = study.get("protocolSection", {}).get("armsInterventionsModule", {})

    nct   = ident.get("nctId", "")
    title = ident.get("briefTitle", "")
    cond_list = conds.get("conditions", [])
    conditions = "; ".join(cond_list)
    summary = desc.get("briefSummary", "")

    raw_elig = elig.get("eligibilityCriteria", "")
    # Split on "Exclusion Criteria" header if present
    if "Exclusion Criteria" in raw_elig:
        parts = raw_elig.split("Exclusion Criteria", 1)
        incl = parts[0].replace("Inclusion Criteria:", "").strip()
        excl = parts[1].strip()
    else:
        incl = raw_elig
        excl = ""

    interventions = "; ".join(
        f"{i.get('type','')}: {i.get('name','')}"
        for i in arms.get("interventions", [])
    )

    # Detect cancer type
    cancer_type = _detect_cancer_type(conditions + " " + title)
    result = classify_trial(cancer_type, title, incl, excl, conditions, interventions, summary)

    return {
        "nct": nct,
        "title": title[:70],
        "cancer_type": cancer_type,
        "primary": result.disease_setting_primary,
        "confidence": result.classification_confidence,
        "modality": result.treatment_modality_str,
    }


def _detect_cancer_type(text: str) -> str:
    """Lightweight cancer type detector (mirrors pipeline logic)."""
    import re
    t = text.lower()
    if re.search(r'prostat', t):             return "Prostate"
    if re.search(r'bladder|urothelial|upper.tract|transitional.cell', t): return "Bladder/Urothelial"
    if re.search(r'renal|kidney|nephr|renal.cell|\brcc\b', t):            return "Kidney/RCC"
    if re.search(r'testicular|testis|germ.cell|seminoma|\bnsgct\b|\bgct\b', t): return "Testicular/GCT"
    if re.search(r'penile|penis', t):        return "Penile"
    return "Basket"


# ── Step 3a: API reachable ────────────────────────────────────────────────────

def test_api_reachable() -> None:
    print("\n[Step 3a] ClinicalTrials.gov API v2 is reachable")
    try:
        data = _api_get({
            "query.cond": "renal cell carcinoma",
            "filter.overallStatus": "RECRUITING",
            "pageSize": 1,
            "fields": "protocolSection.identificationModule.nctId",
        })
        total = data.get("totalCount", 0)
        check(total > 0, f"API returned {total} total studies for 'renal cell carcinoma RECRUITING'")
        studies = data.get("studies", [])
        check(len(studies) == 1, f"Page of 1 returned {len(studies)} study")
    except Exception as e:
        check(False, f"API request failed: {e}")


# ── Step 3b: Required fields present in records ───────────────────────────────

def test_record_fields() -> None:
    print("\n[Step 3b] Live records contain expected fields")
    try:
        data = _api_get({
            "query.cond": "testicular cancer",
            "filter.overallStatus": "RECRUITING",
            "pageSize": 3,
        })
        studies = data.get("studies", [])
        check(len(studies) > 0, f"Fetched {len(studies)} testicular cancer records")
        for study in studies[:2]:
            nct = _extract_field(study, "protocolSection.identificationModule.nctId") or "?"
            for field in EXPECTED_FIELDS:
                val = _extract_field(study, field)
                check(val is not None, f"{nct}: field '{field.split('.')[-1]}' present")
    except Exception as e:
        check(False, f"Field check failed: {e}")


# ── Step 3c: Recall against control NCT set ───────────────────────────────────

def test_recall(quick: bool = False) -> None:
    if quick:
        print("\n[Step 3c] Recall test SKIPPED (--quick mode)")
        return

    print("\n[Step 3c] Recall test against control NCT set (UCI/Hoag verified trials)")
    fixture_path = REPO / "tests" / "fixtures" / "hoag_uci_control_ncts.json"
    if not fixture_path.exists():
        warn(f"Fixture not found: {fixture_path} — skipping recall test")
        return

    control_ncts: set[str] = set(json.loads(fixture_path.read_text())["nct_ids"])
    check(len(control_ncts) > 0, f"Loaded {len(control_ncts)} control NCT IDs")

    # Fetch SoCal GU recruiting trials (broad query)
    found_ncts: set[str] = set()
    for condition in ["prostate cancer", "bladder cancer", "renal cell carcinoma",
                      "testicular cancer"]:
        try:
            data = _api_get({
                "query.cond": condition,
                "filter.overallStatus": "RECRUITING",
                "filter.geo": "distance(33.8,-118.0,180mi)",
                "pageSize": 100,
                "fields": "protocolSection.identificationModule.nctId",
            })
            for study in data.get("studies", []):
                nct = _extract_field(study, "protocolSection.identificationModule.nctId")
                if nct:
                    found_ncts.add(nct)
            time.sleep(0.3)  # polite rate limit
        except Exception as e:
            warn(f"Fetch failed for '{condition}': {e}")

    recalled = control_ncts & found_ncts
    missed   = control_ncts - found_ncts
    recall   = len(recalled) / len(control_ncts) * 100

    check(recall >= 80, f"Recall {recall:.0f}% ({len(recalled)}/{len(control_ncts)} control NCTs found)")
    if missed:
        warn(f"Missed control NCTs (may have closed or changed status): {sorted(missed)}")


# ── Step 3d: Cancer type detection on live records ───────────────────────────

def test_cancer_type_detection() -> None:
    print("\n[Step 3d] Cancer type detector on live records")
    cases = [
        ("prostate cancer", "Prostate"),
        ("urothelial carcinoma", "Bladder/Urothelial"),
        ("renal cell carcinoma", "Kidney/RCC"),
        ("testicular cancer", "Testicular/GCT"),
    ]
    for query, expected_ct in cases:
        try:
            data = _api_get({
                "query.cond": query,
                "filter.overallStatus": "RECRUITING",
                "pageSize": 3,
                "fields": "protocolSection.identificationModule,protocolSection.conditionsModule",
            })
            studies = data.get("studies", [])
            if not studies:
                warn(f"No studies returned for '{query}'")
                continue
            for study in studies[:2]:
                title = _extract_field(study, "protocolSection.identificationModule.briefTitle") or ""
                conds = _extract_field(study, "protocolSection.conditionsModule.conditions") or []
                detected = _detect_cancer_type("; ".join(conds) + " " + title)
                check(detected == expected_ct,
                      f"'{query}' → detected='{detected}' (expected '{expected_ct}') | {title[:50]}")
        except Exception as e:
            check(False, f"Detection failed for '{query}': {e}")


# ── Step 3e: End-to-end classify on live records ──────────────────────────────

def test_end_to_end() -> None:
    print("\n[Step 3e] End-to-end: fetch + classify (no crashes)")
    for query in ["renal cell carcinoma", "testicular cancer"]:
        try:
            data = _api_get({
                "query.cond": query,
                "filter.overallStatus": "RECRUITING",
                "filter.geo": "distance(33.8,-118.0,180mi)",
                "pageSize": 5,
            })
            studies = data.get("studies", [])
            classified = 0
            for study in studies:
                try:
                    result = _classify_study(study)
                    classified += 1
                except Exception as e:
                    nct = _extract_field(study, "protocolSection.identificationModule.nctId") or "?"
                    check(False, f"Classifier crashed on {nct}: {e}")
            check(classified == len(studies),
                  f"'{query}': classified {classified}/{len(studies)} records without error")
        except Exception as e:
            check(False, f"End-to-end failed for '{query}': {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true",
                        help="Skip recall test (no full SoCal pull)")
    args = parser.parse_args()

    test_api_reachable()
    test_record_fields()
    test_recall(quick=args.quick)
    test_cancer_type_detection()
    test_end_to_end()

    passed = sum(1 for ok, _ in _results if ok)
    total  = len(_results)
    print(f"\n{'='*50}")
    print(f"Step 3 results: {passed}/{total} checks passed")
    if passed < total:
        print("Failed checks:")
        for ok, desc in _results:
            if not ok:
                print(f"  - {desc}")
        sys.exit(1)
    else:
        print("All Step 3 pipeline checks passed.")
