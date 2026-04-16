#!/usr/bin/env python3
"""
tests/test_step2_classifier.py
==============================
Step 2 control: NCCN classifier produces correct disease settings and axes.

Tests the classify_trial() function against known clinical cases.
Each test case has a fixed expected output that must not regress.

Cases covered:
  Bladder  : BCG-unresponsive NMIBC, cisplatin-eligible MIBC
  Prostate : nmCRPC, mCRPC post-ARPI (BRCA)
  Kidney   : Adjuvant post-nephrectomy ccRCC, 2nd-line IO-naive metastatic ccRCC
  Testicular: Stage I seminoma, advanced NSGCT good risk, extragonadal mediastinal

Run:
    python3 tests/test_step2_classifier.py
    # or: python3 -m pytest tests/test_step2_classifier.py -v
"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from nccn_classifier import classify_trial

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results: list[tuple[bool, str]] = []

def check(condition: bool, description: str) -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {description}")
    _results.append((condition, description))

def assert_field(r, field: str, expected, label: str) -> None:
    actual = getattr(r, field, "MISSING")
    ok = (expected in actual) if isinstance(actual, str) and "*" in str(expected) \
        else actual == expected
    check(ok, f"{label}: {field}={actual!r} (expected {expected!r})")


# ── Bladder ───────────────────────────────────────────────────────────────────

def test_bladder() -> None:
    print("\n[Step 2 — Bladder]")

    # BCG-unresponsive NMIBC
    r = classify_trial(
        cancer_type="Bladder/Urothelial",
        title="Pembrolizumab for BCG-Unresponsive Non-Muscle-Invasive Bladder Cancer",
        eligibility_incl="BCG-unresponsive non-muscle-invasive bladder cancer (NMIBC), "
                         "CIS with or without Ta/T1, adequate BCG treatment, "
                         "no prior systemic chemotherapy for bladder cancer",
        conditions="bladder cancer NMIBC",
        brief_summary="Phase II pembrolizumab for BCG-unresponsive NMIBC with CIS",
    )
    check(r.classification_confidence in ("HIGH", "MEDIUM"),
          f"BCG-unresponsive NMIBC confidence={r.classification_confidence}")
    check("BCG" in r.disease_setting_primary or "NMIBC" in r.disease_setting_primary,
          f"BCG NMIBC primary={r.disease_setting_primary!r}")
    check(r.bcg_status == "BCG-Unresponsive",
          f"bcg_status={r.bcg_status!r} (expected 'BCG-Unresponsive')")

    # MIBC cisplatin-eligible
    r2 = classify_trial(
        cancer_type="Bladder/Urothelial",
        title="Neoadjuvant Gemcitabine-Cisplatin for Muscle-Invasive Bladder Cancer",
        eligibility_incl="Muscle-invasive bladder cancer cT2-T4a, adequate renal function "
                         "creatinine clearance >= 60 mL/min, cisplatin-eligible, "
                         "no prior chemotherapy, cystectomy planned",
        conditions="muscle-invasive bladder cancer MIBC urothelial carcinoma",
        brief_summary="Neoadjuvant gemcitabine plus cisplatin for cisplatin-eligible MIBC",
    )
    check(r2.classification_confidence in ("HIGH", "MEDIUM"),
          f"MIBC confidence={r2.classification_confidence}")
    check(r2.cisplatin_status == "Cisplatin-Eligible",
          f"cisplatin_status={r2.cisplatin_status!r} (expected 'Cisplatin-Eligible')")


# ── Prostate ──────────────────────────────────────────────────────────────────

def test_prostate() -> None:
    print("\n[Step 2 — Prostate]")

    # nmCRPC
    r = classify_trial(
        cancer_type="Prostate",
        title="Darolutamide for Non-Metastatic Castration-Resistant Prostate Cancer",
        eligibility_incl="Non-metastatic castration-resistant prostate cancer (nmCRPC), "
                         "PSA doubling time <= 10 months, no evidence of distant metastases, "
                         "ongoing ADT, castrate testosterone levels",
        conditions="prostate cancer nmCRPC",
        brief_summary="Darolutamide versus placebo for nmCRPC with rapid PSA rise",
    )
    check(r.classification_confidence in ("HIGH", "MEDIUM"),
          f"nmCRPC confidence={r.classification_confidence}")
    check("nmCRPC" in r.disease_setting_primary or "Non-Metastatic" in r.disease_setting_primary,
          f"nmCRPC primary={r.disease_setting_primary!r}")
    check(r.castration_status == "castration_resistant",
          f"castration_status={r.castration_status!r}")
    check(r.metastatic_status == "nonmetastatic_crpc",
          f"metastatic_status={r.metastatic_status!r}")

    # mCRPC post-ARPI with HRR mutation
    r2 = classify_trial(
        cancer_type="Prostate",
        title="Olaparib for mCRPC with BRCA1/2 Mutation Post-Enzalutamide",
        eligibility_incl="Metastatic castration-resistant prostate cancer, BRCA1 or BRCA2 "
                         "mutation, prior enzalutamide or abiraterone, progressive disease",
        conditions="metastatic prostate cancer CRPC",
        interventions="olaparib PARP inhibitor",
        brief_summary="Olaparib for mCRPC with HRR mutation after ARPI",
    )
    check(r2.castration_status == "castration_resistant",
          f"castration_status={r2.castration_status!r}")
    check(r2.metastatic_status == "metastatic",
          f"metastatic_status={r2.metastatic_status!r}")
    check(r2.prior_arpi == "yes",
          f"prior_arpi={r2.prior_arpi!r} (expected 'yes')")
    check(r2.biomarker_hrr == "positive",
          f"biomarker_hrr={r2.biomarker_hrr!r} (expected 'positive')")


# ── Kidney / RCC ──────────────────────────────────────────────────────────────

def test_kidney() -> None:
    print("\n[Step 2 — Kidney / RCC]")

    # Adjuvant post-nephrectomy high-risk ccRCC
    r = classify_trial(
        cancer_type="Kidney/RCC",
        title="Pembrolizumab Adjuvant Therapy Following Nephrectomy for High-Risk RCC",
        eligibility_incl="Clear cell RCC, high-risk features (pT2 grade 4 or higher, pT3, pT4, "
                         "or pN1), following radical or partial nephrectomy, "
                         "no prior systemic therapy, no evidence of metastatic disease",
        conditions="renal cell carcinoma kidney cancer",
        interventions="pembrolizumab immunotherapy",
        brief_summary="Adjuvant pembrolizumab versus placebo after nephrectomy for high-risk "
                      "clear cell RCC. KEYNOTE-564 design.",
    )
    check(r.classification_confidence in ("HIGH", "MEDIUM"),
          f"Adjuvant RCC confidence={r.classification_confidence}")
    check("Adjuvant" in r.disease_setting_primary,
          f"Adjuvant RCC primary={r.disease_setting_primary!r}")
    check(r.histology == "clear_cell",
          f"histology={r.histology!r}")
    check(r.nephrectomy_status == "prior_nephrectomy",
          f"nephrectomy_status={r.nephrectomy_status!r}")
    check(r.prior_io == "no",
          f"prior_io={r.prior_io!r} (expected 'no')")
    check(r.prior_systemic_lines == "0",
          f"prior_systemic_lines={r.prior_systemic_lines!r} (expected '0')")

    # 1st-line metastatic ccRCC, IO-naive
    r2 = classify_trial(
        cancer_type="Kidney/RCC",
        title="Cabozantinib plus Nivolumab for First-Line Metastatic ccRCC",
        eligibility_incl="Clear cell RCC, advanced or metastatic stage IV, "
                         "no prior systemic therapy for RCC, KPS >= 70%, "
                         "at least one measurable lesion per RECIST 1.1",
        conditions="advanced clear cell renal cell carcinoma metastatic RCC",
        interventions="cabozantinib nivolumab",
        brief_summary="First-line treatment for metastatic clear cell RCC",
    )
    check("1st Line" in r2.disease_setting_primary or "1L" in r2.disease_setting_primary
          or "First" in r2.disease_setting_primary,
          f"1L RCC primary={r2.disease_setting_primary!r}")
    check(r2.histology == "clear_cell", f"histology={r2.histology!r}")
    check(r2.prior_io == "no",          f"prior_io={r2.prior_io!r}")
    check(r2.prior_vegf_tki == "no",    f"prior_vegf_tki={r2.prior_vegf_tki!r}")
    check(r2.prior_systemic_lines == "0", f"prior_systemic_lines={r2.prior_systemic_lines!r}")


# ── Testicular / GCT ──────────────────────────────────────────────────────────

def test_testicular() -> None:
    print("\n[Step 2 — Testicular / GCT]")

    # Stage I seminoma — surveillance
    r = classify_trial(
        cancer_type="Testicular/GCT",
        title="Surveillance vs Carboplatin for Stage IA/IB Pure Seminoma",
        eligibility_incl="Stage IA or IB pure seminoma following radical orchiectomy, "
                         "no prior chemotherapy, no prior radiation",
        conditions="testicular seminoma stage I",
        brief_summary="Randomized trial of active surveillance vs carboplatin AUC7 in "
                      "stage IA/IB seminoma post-orchiectomy",
    )
    check("Seminoma" in r.disease_setting_primary and "Stage I" in r.disease_setting_primary,
          f"Seminoma Stage I primary={r.disease_setting_primary!r}")
    check(r.histology == "pure_seminoma",  f"histology={r.histology!r}")
    check(r.clinical_stage == "stage_1a",  f"clinical_stage={r.clinical_stage!r}")
    check(r.classification_confidence in ("HIGH", "MEDIUM"),
          f"confidence={r.classification_confidence}")

    # Advanced NSGCT good risk — first-line, treatment naive
    r2 = classify_trial(
        cancer_type="Testicular/GCT",
        title="First-Line Chemotherapy for Good-Risk Metastatic NSGCT",
        eligibility_incl="Nonseminomatous germ cell tumor, IGCCCG good risk, "
                         "stage IIC or III, treatment naive GCT, no prior chemotherapy, "
                         "AFP < 1000 ng/mL, hCG < 5000 IU/L, testicular primary",
        conditions="testicular cancer NSGCT germ cell tumor",
        brief_summary="First-line treatment naive IGCCCG good-risk nonseminomatous germ cell tumor",
    )
    check("NSGCT" in r2.disease_setting_primary,
          f"Good-risk NSGCT primary={r2.disease_setting_primary!r}")
    check(r2.histology == "nsgct",       f"histology={r2.histology!r}")
    check(r2.igcccg_risk == "good",      f"igcccg_risk={r2.igcccg_risk!r}")
    check(r2.prior_chemo_lines == "0",   f"prior_chemo_lines={r2.prior_chemo_lines!r}")

    # Extragonadal mediastinal GCT
    r3 = classify_trial(
        cancer_type="Testicular/GCT",
        title="Pembrolizumab plus BEP for Mediastinal Primary GCT",
        eligibility_incl="Mediastinal primary germ cell tumor, extragonadal GCT, "
                         "nonseminoma, treatment naive, IGCCCG poor risk",
        conditions="mediastinal germ cell tumor extragonadal GCT",
        brief_summary="Pembrolizumab plus BEP for mediastinal primary extragonadal GCT",
    )
    check("Extragonadal" in r3.disease_setting_primary,
          f"Extragonadal primary={r3.disease_setting_primary!r}")
    check(r3.primary_site == "mediastinal", f"primary_site={r3.primary_site!r}")


# ── Edge cases ────────────────────────────────────────────────────────────────

def test_edge_cases() -> None:
    print("\n[Step 2 — Edge cases]")

    # Supportive care / perioperative trial — should return LOW / unclassified
    r = classify_trial(
        cancer_type="Testicular/GCT",
        title="Opioid-Sparing Perioperative Protocol for Radical Orchiectomy",
        eligibility_incl="Undergoing radical orchiectomy for suspected testicular malignancy, "
                         "no prior chemotherapy, no prior opioid use",
        conditions="testicular malignancy",
        interventions="PROCEDURE: Radical inguinal orchiectomy",
        brief_summary="Standardized perioperative pain protocol for orchiectomy",
    )
    check(r.classification_confidence == "LOW",
          f"Perioperative trial confidence={r.classification_confidence} (expected LOW)")
    check("unclassified" in r.disease_setting_primary or "review" in r.disease_setting_primary,
          f"Perioperative primary={r.disease_setting_primary!r} (expected review flag)")

    # Unsupported cancer type — should not crash
    r2 = classify_trial(
        cancer_type="Penile",
        title="Pembrolizumab for Advanced Penile Cancer",
        eligibility_incl="Squamous cell carcinoma of the penis, metastatic",
        conditions="penile cancer",
    )
    check("classifier not yet built" in r2.disease_setting_primary,
          f"Unsupported type={r2.disease_setting_primary!r}")
    check(r2.classification_confidence == "N/A",
          f"Unsupported confidence={r2.classification_confidence!r}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_bladder()
    test_prostate()
    test_kidney()
    test_testicular()
    test_edge_cases()

    passed = sum(1 for ok, _ in _results if ok)
    total  = len(_results)
    print(f"\n{'='*50}")
    print(f"Step 2 results: {passed}/{total} checks passed")
    if passed < total:
        print("Failed checks:")
        for ok, desc in _results:
            if not ok:
                print(f"  - {desc}")
        sys.exit(1)
    else:
        print("All Step 2 classifier checks passed.")
