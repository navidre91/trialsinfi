#!/usr/bin/env python3
"""
nccn_classifier.py
==================
NCCN-based disease setting and treatment modality classifier for GU oncology trials.

Currently supported cancer types:
  - Bladder / Urothelial  (NCCN v3.2025, 2025-12-19)
  - Prostate              (NCCN v5.2026, 2026-01-23)
  - Kidney / RCC          (NCCN v1.2026, 2026-07-24)
  - Testicular / GCT      (NCCN v1.2026, 2026-04-06)

Taxonomy source:
  JSON models live in nccn_input/models/ (one file per cancer type).
  They are compiled from the corresponding NCCN PDF guidelines stored in nccn_input/pdfs/.
  To update a taxonomy, edit the JSON file directly — the classifier reloads it on startup.

Philosophy: Inclusive over precise. When ambiguous, tag all plausible categories.
A physician missing a trial is worse than seeing one that doesn't fit.

Confidence levels:
  HIGH   — 3+ independent patterns matched, or 2 with HIGH base confidence
  MEDIUM — 2 patterns matched, MEDIUM base confidence
  LOW    — 1 pattern matched, or unclassified-but-recognised cancer type (review flag)
  N/A    — cancer type not yet in taxonomy

Usage:
    from nccn_classifier import classify_trial, get_nccn_stamp
    result = classify_trial(cancer_type, title, eligibility_incl, eligibility_excl,
                            conditions, interventions, brief_summary)
    print(result.disease_setting_primary, result.classification_confidence)
"""

from __future__ import annotations
import re
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Load taxonomy files ────────────────────────────────────────────────────────
# Models live at: <repo_root>/nccn_input/models/*.json
TAXONOMY_DIR = Path(__file__).resolve().parent / "nccn_input" / "models"

def _load_taxonomy(filename: str) -> dict:
    path = TAXONOMY_DIR / filename
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)

_BLADDER_TAX     = _load_taxonomy("bladder_v3_2025.json")
_PROSTATE_TAX    = _load_taxonomy("prostate_v5_2026.json")
_KIDNEY_TAX      = _load_taxonomy("kidney_v1_2026.json")
_TESTICULAR_TAX  = _load_taxonomy("testicular_v1_2026.json")


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class TrialClassification:
    """Full classification result for a single trial."""

    # ── Disease setting ──────────────────────────────────────────────────────
    disease_settings: list[str] = field(default_factory=list)   # multi-label list
    disease_setting_primary: str = "Unclassified"               # single best-fit label
    disease_setting_all: str = ""                               # pipe-separated display
    classification_confidence: str = "UNCLASSIFIED"             # HIGH / MEDIUM / LOW / UNCLASSIFIED
    classification_evidence: list[str] = field(default_factory=list)  # matched patterns

    # ── Bladder-specific axes ────────────────────────────────────────────────
    bcg_status: str = "Not applicable"
    cisplatin_status: str = "Not specified"

    # ── Prostate-specific axes ───────────────────────────────────────────────
    castration_status: str = "Not applicable"
    metastatic_status: str = "Not applicable"
    disease_volume: str = "Not applicable"
    prior_arpi: str = "Not applicable"
    prior_docetaxel: str = "Not applicable"
    biomarker_hrr: str = "Not applicable"
    psma_status: str = "Not applicable"
    genomic_classifier: str = "Not applicable"

    # ── Kidney-specific axes ─────────────────────────────────────────────────
    histology: str = "Not applicable"
    imdc_risk: str = "Not applicable"
    prior_systemic_lines: str = "Not applicable"
    prior_io: str = "Not applicable"
    prior_vegf_tki: str = "Not applicable"
    nephrectomy_status: str = "Not applicable"
    vhl_status: str = "Not applicable"
    met_alteration: str = "Not applicable"
    sarcomatoid: str = "Not applicable"

    # ── Testicular/GCT-specific axes ─────────────────────────────────────────
    clinical_stage: str = "Not applicable"
    igcccg_risk: str = "Not applicable"
    primary_site: str = "Not applicable"
    prior_chemo_lines: str = "Not applicable"
    prior_hdct: str = "Not applicable"
    rplnd_status: str = "Not applicable"
    marker_status: str = "Not applicable"
    stage1_risk_factors: str = "Not applicable"

    # ── Treatment modality ───────────────────────────────────────────────────
    treatment_modalities: list[str] = field(default_factory=list)
    treatment_modality_str: str = ""
    is_combination: bool = False
    delivery: str = "UNCLASSIFIED"   # SYSTEMIC / LOCAL / MIXED / DIAGNOSTIC / INTRAVESICAL

    # ── Taxonomy metadata ────────────────────────────────────────────────────
    nccn_version: str = ""
    nccn_date: str = ""


# ── Core helpers ───────────────────────────────────────────────────────────────

def _make_text_blob(*parts: Optional[str]) -> str:
    """Concatenate text fields into one lowercase searchable blob."""
    return " ".join(p for p in parts if p).lower()

def _matches_any(text: str, patterns: list[str]) -> tuple[bool, list[str]]:
    """Return (matched, [list of matched patterns])."""
    hits = [pat for pat in patterns if re.search(pat, text, re.IGNORECASE)]
    return bool(hits), hits

def _confidence_from_hits(hits: list[str], base: str) -> str:
    """Boost confidence when multiple independent patterns match."""
    if not hits:
        return "UNCLASSIFIED"
    if len(hits) >= 3:
        return "HIGH"
    if len(hits) == 2:
        return "HIGH" if base == "HIGH" else "MEDIUM"
    return base


# ── Bladder / Urothelial ───────────────────────────────────────────────────────

def _classify_bladder_disease(text: str) -> tuple[list[dict], list[str]]:
    if not _BLADDER_TAX:
        return [], []
    matched_cats, all_evidence = [], []
    for cat in _BLADDER_TAX.get("categories", []):
        excluded, _ = _matches_any(text, cat.get("exclude_patterns", []))
        if excluded:
            continue
        included, hits = _matches_any(text, cat.get("include_patterns", []))
        if included:
            conf = _confidence_from_hits(hits, cat.get("confidence_base", "MEDIUM"))
            matched_cats.append({**cat, "_confidence": conf, "_hits": hits})
            all_evidence.extend(hits[:3])
    return matched_cats, list(dict.fromkeys(all_evidence))

def _classify_bcg_status(text: str) -> str:
    for status, patterns in _BLADDER_TAX.get("bcg_status_rules", {}).items():
        if _matches_any(text, patterns)[0]:
            return status
    return "Not applicable"

def _classify_cisplatin_status(text: str) -> str:
    for status, patterns in _BLADDER_TAX.get("cisplatin_status_rules", {}).items():
        if _matches_any(text, patterns)[0]:
            return status
    return "Not specified"


# ── Prostate ───────────────────────────────────────────────────────────────────

def _classify_prostate_disease(text: str) -> tuple[list[dict], list[str]]:
    if not _PROSTATE_TAX:
        return [], []
    matched_cats, all_evidence = [], []
    for cat in _PROSTATE_TAX.get("categories", []):
        excluded, _ = _matches_any(text, cat.get("exclude_patterns", []))
        if excluded:
            continue
        included, hits = _matches_any(text, cat.get("include_patterns", []))
        if included:
            conf = _confidence_from_hits(hits, cat.get("confidence_base", "MEDIUM"))
            matched_cats.append({**cat, "_confidence": conf, "_hits": hits})
            all_evidence.extend(hits[:3])
    return matched_cats, list(dict.fromkeys(all_evidence))

def _classify_prostate_axis(text: str, axis_id: str) -> str:
    axis = _PROSTATE_TAX.get("clinical_axes", {}).get(axis_id, {})
    for value, patterns in axis.get("detection_rules", {}).items():
        if _matches_any(text, patterns)[0]:
            return value
    return "unknown"

def _classify_all_prostate_axes(text: str) -> dict[str, str]:
    ids = ["castration_status", "metastatic_status", "disease_volume",
           "prior_arpi", "prior_docetaxel", "biomarker_hrr", "psma_status",
           "genomic_classifier"]
    return {ax: _classify_prostate_axis(text, ax) for ax in ids}


# ── Kidney / RCC ───────────────────────────────────────────────────────────────

def _classify_kidney_disease(text: str) -> tuple[list[dict], list[str]]:
    if not _KIDNEY_TAX:
        return [], []
    matched_cats, all_evidence = [], []
    for cat in _KIDNEY_TAX.get("categories", []):
        excluded, _ = _matches_any(text, cat.get("exclude_patterns", []))
        if excluded:
            continue
        included, hits = _matches_any(text, cat.get("include_patterns", []))
        if included:
            conf = _confidence_from_hits(hits, cat.get("confidence_base", "MEDIUM"))
            matched_cats.append({**cat, "_confidence": conf, "_hits": hits})
            all_evidence.extend(hits[:3])
    return matched_cats, list(dict.fromkeys(all_evidence))

def _classify_kidney_axis(text: str, axis_id: str) -> str:
    axis = _KIDNEY_TAX.get("clinical_axes", {}).get(axis_id, {})
    for value, patterns in axis.get("detection_rules", {}).items():
        if _matches_any(text, patterns)[0]:
            return value
    return "unknown"

def _classify_all_kidney_axes(text: str) -> dict[str, str]:
    ids = ["histology", "imdc_risk", "prior_systemic_lines", "prior_io",
           "prior_vegf_tki", "nephrectomy_status", "vhl_status", "met_alteration",
           "sarcomatoid"]
    return {ax: _classify_kidney_axis(text, ax) for ax in ids}


# ── Testicular / GCT ──────────────────────────────────────────────────────────

def _classify_testicular_disease(text: str) -> tuple[list[dict], list[str]]:
    if not _TESTICULAR_TAX:
        return [], []
    matched_cats, all_evidence = [], []
    for cat in _TESTICULAR_TAX.get("categories", []):
        excluded, _ = _matches_any(text, cat.get("exclude_patterns", []))
        if excluded:
            continue
        included, hits = _matches_any(text, cat.get("include_patterns", []))
        if included:
            conf = _confidence_from_hits(hits, cat.get("confidence_base", "MEDIUM"))
            matched_cats.append({**cat, "_confidence": conf, "_hits": hits})
            all_evidence.extend(hits[:3])
    return matched_cats, list(dict.fromkeys(all_evidence))

def _classify_testicular_axis(text: str, axis_id: str) -> str:
    axis = _TESTICULAR_TAX.get("clinical_axes", {}).get(axis_id, {})
    for value, patterns in axis.get("detection_rules", {}).items():
        if _matches_any(text, patterns)[0]:
            return value
    return "unknown"

def _classify_all_testicular_axes(text: str) -> dict[str, str]:
    ids = ["histology", "clinical_stage", "igcccg_risk", "primary_site",
           "prior_chemo_lines", "prior_hdct", "rplnd_status", "marker_status",
           "stage1_risk_factors"]
    return {ax: _classify_testicular_axis(text, ax) for ax in ids}


# ── Treatment modality ─────────────────────────────────────────────────────────

_SYSTEMIC_MODALITIES   = {"IMMUNOTHERAPY", "TARGETED", "CHEMOTHERAPY", "ADC"}
_LOCAL_MODALITIES      = {"RADIATION", "SURGERY"}
_INTRAVESICAL_MOD      = {"INTRAVESICAL"}
_DIAGNOSTIC_MODALITIES = {"IMAGING_DIAGNOSTIC"}

_GENERIC_MODALITY_RULES = {
    "HORMONAL": [
        "ADT", "LHRH", "enzalutamide", "abiraterone", "apalutamide", "darolutamide",
        "leuprolide", "degarelix", "bilateral.orchiectomy", "androgen.deprivation",
        "ARPI", "antiandrogen", "bicalutamide", "flutamide",
    ],
    "IMMUNOTHERAPY": [
        "pembrolizumab", "nivolumab", "ipilimumab", "atezolizumab", "durvalumab",
        "avelumab", "checkpoint.inhibitor", "PD.1", "PD.L1", "anti.PD", "CAR.T",
        "sipuleucel", "immunotherapy", "cemiplimab",
    ],
    "TARGETED": [
        "olaparib", "rucaparib", "niraparib", "talazoparib", "PARP", "FGFR", "HER2",
        "AKT", "mTOR", "PI3K", "cabozantinib", "lenvatinib", "sunitinib", "pazopanib",
        "everolimus", "erdafitinib", "targeted.therapy",
        # Kidney / RCC
        "axitinib", "tivozanib", "sorafenib", "temsirolimus", "bevacizumab",
        "belzutifan", "HIF.2", "HIF2", "VHL.inhibitor", "savolitinib", "crizotinib",
        "VEGF.TKI", "VEGFR.inhibitor", "anti.VEGF", "mTOR.inhibitor",
    ],
    "RADIOLIGAND": [
        "Lu.177", "PSMA.617", "lutetium", "Ra.223", "radium", "actinium",
        "theranostic", "radioligand", "radiopharmaceutical",
    ],
    "ADC": [
        "enfortumab", "sacituzumab", "disitamab", "trastuzumab.deruxtecan",
        "antibody.drug.conjugate", r"\bADC\b",
    ],
    "CHEMOTHERAPY": [
        "docetaxel", "cabazitaxel", "cisplatin", "carboplatin", "gemcitabine",
        "paclitaxel", "MVAC", "ddMVAC", "chemotherapy", "cytotoxic",
        # GCT regimens
        "bleomycin", "etoposide", "ifosfamide", "vinblastine", "oxaliplatin",
        r"\bBEP\b", r"\bEP\b", r"\bTIP\b", r"\bVeIP\b", r"\bVIP\b", r"\bGemOx\b",
        "TI-CE", "high.dose.*chemo", r"\bHDCT\b", "stem.cell",
    ],
    "RADIATION": [
        "EBRT", "radiation", "radiotherapy", "IMRT", "SBRT", "brachytherapy",
        "stereotactic", "proton", "external.beam",
    ],
    "SURGERY": [
        "radical.prostatectomy", "RARP", "robotic", "cystectomy", "nephrectomy",
        "ureterectomy", "TURBT", "surgical",
        # GCT
        r"\bRPLND\b", "retroperitoneal.lymph.node.dissection", "orchiectomy",
    ],
    "IMAGING_DIAGNOSTIC": [
        "PSMA.PET", "PET.CT", "PET.MRI", "FDG.PET", "diagnostic", "imaging",
        "detection", "biomarker", "liquid.biopsy", "ctDNA", "cfDNA",
    ],
}


def _classify_treatment_modality(text: str, cancer_type: str) -> tuple[list[str], bool, str]:
    """Returns (modality_list, is_combination, delivery)."""
    if _BLADDER_TAX and cancer_type == "Bladder/Urothelial":
        rules = _BLADDER_TAX.get("treatment_modality_rules", {})
    else:
        rules = _GENERIC_MODALITY_RULES

    matched = [m for m, pats in rules.items() if _matches_any(text, pats)[0]]
    is_combination = len(matched) > 1

    has_systemic     = bool(set(matched) & _SYSTEMIC_MODALITIES)
    has_local        = bool(set(matched) & _LOCAL_MODALITIES)
    has_intravesical = bool(set(matched) & _INTRAVESICAL_MOD)
    has_diagnostic   = bool(set(matched) & _DIAGNOSTIC_MODALITIES)

    if has_intravesical and not has_systemic and not has_local:
        delivery = "INTRAVESICAL"
    elif has_diagnostic and not has_systemic and not has_local and not has_intravesical:
        delivery = "DIAGNOSTIC"
    elif has_systemic and has_local:
        delivery = "MIXED"
    elif has_systemic or has_intravesical:
        delivery = "SYSTEMIC"
    elif has_local:
        delivery = "LOCAL"
    elif has_diagnostic:
        delivery = "DIAGNOSTIC"
    else:
        delivery = "UNCLASSIFIED"

    return matched, is_combination, delivery


# ── Internal helper: shared category-matching logic ───────────────────────────

def _resolve_categories(
    matched_cats: list[dict],
    evidence: list[str],
    result: TrialClassification,
) -> None:
    """Sort matched categories and populate result fields in place."""
    conf_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    matched_cats.sort(key=lambda c: (c.get("order", 99), conf_rank.get(c["_confidence"], 3)))
    result.disease_settings        = [c["label"] for c in matched_cats]
    result.disease_setting_primary = matched_cats[0]["label"]
    result.disease_setting_all     = " | ".join(result.disease_settings)
    confs = [c["_confidence"] for c in matched_cats]
    result.classification_confidence = (
        "HIGH" if "HIGH" in confs else "MEDIUM" if "MEDIUM" in confs else "LOW"
    )
    result.classification_evidence = evidence[:5]


# ── Public API ─────────────────────────────────────────────────────────────────

def classify_trial(
    cancer_type: str,
    title: str = "",
    eligibility_incl: str = "",
    eligibility_excl: str = "",
    conditions: str = "",
    interventions: str = "",
    brief_summary: str = "",
) -> TrialClassification:
    """
    Classify a single clinical trial by NCCN disease setting and treatment modality.

    Parameters
    ----------
    cancer_type : str
        Output of pipeline's cancer-type detector, e.g. "Bladder/Urothelial",
        "Prostate", "Kidney/RCC", "Testicular/GCT".
    title : str
        ClinicalTrials.gov brief title.
    eligibility_incl : str
        Inclusion criteria text (used for disease classification).
    eligibility_excl : str
        Exclusion criteria text (NOT used for disease classification — only modality).
    conditions : str
        CT.gov conditions field (joined string).
    interventions : str
        CT.gov interventions field (used for modality classification).
    brief_summary : str
        CT.gov brief description.

    Returns
    -------
    TrialClassification
        Populated dataclass. Check `.classification_confidence` before using
        `.disease_setting_primary` — LOW means manual review is required.
    """
    result = TrialClassification()
    disease_text  = _make_text_blob(title, eligibility_incl, conditions, brief_summary)
    modality_text = _make_text_blob(title, interventions, brief_summary)

    # ── Disease setting ───────────────────────────────────────────────────────
    if cancer_type == "Bladder/Urothelial":
        matched_cats, evidence = _classify_bladder_disease(disease_text)
        if matched_cats:
            _resolve_categories(matched_cats, evidence, result)
        else:
            if re.search(r'bladder|urothelial|upper.tract|renal.pelvis|ureter', disease_text, re.I):
                result.disease_setting_primary = "Bladder/Urothelial — unclassified (review)"
                result.classification_confidence = "LOW"
            else:
                result.disease_setting_primary = "Bladder/Urothelial — insufficient data"
                result.classification_confidence = "LOW"
            result.disease_setting_all = result.disease_setting_primary
        result.nccn_version     = _BLADDER_TAX.get("nccn_version", "")
        result.nccn_date        = _BLADDER_TAX.get("nccn_date", "")
        result.bcg_status       = _classify_bcg_status(disease_text)
        result.cisplatin_status = _classify_cisplatin_status(disease_text)

    elif cancer_type == "Prostate":
        matched_cats, evidence = _classify_prostate_disease(disease_text)
        if matched_cats:
            _resolve_categories(matched_cats, evidence, result)
        else:
            if re.search(r'prostate', disease_text, re.I):
                result.disease_setting_primary = "Prostate — unclassified (review)"
                result.classification_confidence = "LOW"
            else:
                result.disease_setting_primary = "Prostate — insufficient data"
                result.classification_confidence = "LOW"
            result.disease_setting_all = result.disease_setting_primary
        result.nccn_version = _PROSTATE_TAX.get("nccn_version", "")
        result.nccn_date    = _PROSTATE_TAX.get("nccn_date", "")
        axes = _classify_all_prostate_axes(disease_text)
        result.castration_status  = axes["castration_status"]
        result.metastatic_status  = axes["metastatic_status"]
        result.disease_volume     = axes["disease_volume"]
        result.prior_arpi         = axes["prior_arpi"]
        result.prior_docetaxel    = axes["prior_docetaxel"]
        result.biomarker_hrr      = axes["biomarker_hrr"]
        result.psma_status        = axes["psma_status"]
        result.genomic_classifier = axes["genomic_classifier"]

    elif cancer_type == "Kidney/RCC":
        matched_cats, evidence = _classify_kidney_disease(disease_text)
        if matched_cats:
            _resolve_categories(matched_cats, evidence, result)
        else:
            if re.search(r'kidney|renal|RCC|renal.cell', disease_text, re.I):
                result.disease_setting_primary = "Kidney/RCC — unclassified (review)"
                result.classification_confidence = "LOW"
            else:
                result.disease_setting_primary = "Kidney/RCC — insufficient data"
                result.classification_confidence = "LOW"
            result.disease_setting_all = result.disease_setting_primary
        result.nccn_version = _KIDNEY_TAX.get("nccn_version", "")
        result.nccn_date    = _KIDNEY_TAX.get("nccn_date", "")
        axes = _classify_all_kidney_axes(disease_text)
        result.histology            = axes["histology"]
        result.imdc_risk            = axes["imdc_risk"]
        result.prior_systemic_lines = axes["prior_systemic_lines"]
        result.prior_io             = axes["prior_io"]
        result.prior_vegf_tki       = axes["prior_vegf_tki"]
        result.nephrectomy_status   = axes["nephrectomy_status"]
        result.vhl_status           = axes["vhl_status"]
        result.met_alteration       = axes["met_alteration"]
        result.sarcomatoid          = axes["sarcomatoid"]

    elif cancer_type == "Testicular/GCT":
        matched_cats, evidence = _classify_testicular_disease(disease_text)
        if matched_cats:
            _resolve_categories(matched_cats, evidence, result)
        else:
            if re.search(r'testicular|testis|germ.cell|seminoma|NSGCT|GCT', disease_text, re.I):
                result.disease_setting_primary = "Testicular/GCT — unclassified (review)"
                result.classification_confidence = "LOW"
            else:
                result.disease_setting_primary = "Testicular/GCT — insufficient data"
                result.classification_confidence = "LOW"
            result.disease_setting_all = result.disease_setting_primary
        result.nccn_version = _TESTICULAR_TAX.get("nccn_version", "")
        result.nccn_date    = _TESTICULAR_TAX.get("nccn_date", "")
        axes = _classify_all_testicular_axes(disease_text)
        result.histology           = axes["histology"]
        result.clinical_stage      = axes["clinical_stage"]
        result.igcccg_risk         = axes["igcccg_risk"]
        result.primary_site        = axes["primary_site"]
        result.prior_chemo_lines   = axes["prior_chemo_lines"]
        result.prior_hdct          = axes["prior_hdct"]
        result.rplnd_status        = axes["rplnd_status"]
        result.marker_status       = axes["marker_status"]
        result.stage1_risk_factors = axes["stage1_risk_factors"]

    else:
        result.disease_setting_primary = f"{cancer_type} — classifier not yet built"
        result.disease_setting_all     = result.disease_setting_primary
        result.classification_confidence = "N/A"
        result.nccn_version = "pending"
        result.nccn_date    = "pending"

    # ── Treatment modality ────────────────────────────────────────────────────
    modalities, is_comb, delivery = _classify_treatment_modality(modality_text, cancer_type)
    result.treatment_modalities   = modalities
    result.treatment_modality_str = " · ".join(modalities) if modalities else "Unclassified"
    result.is_combination         = is_comb
    result.delivery               = delivery

    return result


# ── Utility helpers for Trial Finder UI ───────────────────────────────────────

def get_disease_settings_in_order(cancer_type: str) -> list[dict]:
    """Return all disease settings in clinical order for Trial Finder rendering."""
    _MAP = {
        "Bladder/Urothelial": _BLADDER_TAX,
        "Prostate":           _PROSTATE_TAX,
        "Kidney/RCC":         _KIDNEY_TAX,
        "Testicular/GCT":     _TESTICULAR_TAX,
    }
    tax = _MAP.get(cancer_type)
    if not tax:
        return []
    cats = sorted(tax.get("categories", []), key=lambda c: c.get("order", 99))
    return [{"id": c["id"], "label": c["label"], "short": c["short"],
             "section": c["section"], "color_hex": c["color_hex"]} for c in cats]


def get_section_colors(cancer_type: str) -> dict[str, str]:
    """Return section-name → hex color mapping for that cancer type."""
    _MAP = {
        "Bladder/Urothelial": _BLADDER_TAX,
        "Prostate":           _PROSTATE_TAX,
        "Kidney/RCC":         _KIDNEY_TAX,
        "Testicular/GCT":     _TESTICULAR_TAX,
    }
    tax = _MAP.get(cancer_type, {})
    return tax.get("section_colors", {})


def get_nccn_stamp(cancer_type: str) -> str:
    """Human-readable NCCN version stamp, e.g. 'NCCN Kidney Cancer v1.2026 (2026-07-24)'."""
    _LABELS = {
        "Bladder/Urothelial": ("Bladder Cancer",    _BLADDER_TAX),
        "Prostate":           ("Prostate Cancer",   _PROSTATE_TAX),
        "Kidney/RCC":         ("Kidney Cancer",     _KIDNEY_TAX),
        "Testicular/GCT":     ("Testicular Cancer", _TESTICULAR_TAX),
    }
    if cancer_type in _LABELS:
        label, tax = _LABELS[cancer_type]
        v = tax.get("nccn_version", "")
        d = tax.get("nccn_date", "")
        return f"NCCN {label} v{v} ({d})"
    return "NCCN taxonomy pending"


def list_loaded_taxonomies() -> list[str]:
    """Return names of all successfully loaded taxonomy JSON files."""
    loaded = []
    for name, tax in [
        ("bladder_v3_2025.json",    _BLADDER_TAX),
        ("prostate_v5_2026.json",   _PROSTATE_TAX),
        ("kidney_v1_2026.json",     _KIDNEY_TAX),
        ("testicular_v1_2026.json", _TESTICULAR_TAX),
    ]:
        if tax:
            loaded.append(name)
    return loaded
