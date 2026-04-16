#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _normalize_email(value: str) -> str:
    email = _collapse_whitespace(value)
    if not email:
        return ""

    # Keep email validation strict enough to match PHP's FILTER_VALIDATE_EMAIL
    # behavior for common malformed site contacts such as "clinicaltrials.@hoag.org".
    if not re.fullmatch(
        r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
        r"@"
        r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+",
        email,
    ):
        return ""

    return email


def _split_pipe_list(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(" | ") if item.strip()]


def _split_semicolon_list(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(";") if item.strip()]


def _split_bullet_block(value: str) -> list[str]:
    lines: list[str] = []
    for raw_line in (value or "").splitlines():
        line = raw_line.strip().lstrip("•").strip()
        if line:
            lines.append(_collapse_whitespace(line))
    return lines


def _map_status(status: str) -> str:
    normalized = (status or "").strip().upper()
    aliases = {
        "RECRUITING": "recruiting",
        "ACTIVE_NOT_RECRUITING": "active_not_recruiting",
        "NOT_YET_RECRUITING": "active_not_recruiting",
        "COMPLETED": "completed",
        "SUSPENDED": "completed",
        "TERMINATED": "completed",
        "WITHDRAWN": "completed",
    }
    return aliases.get(normalized, "not_specified")


def _format_phase(phase: str) -> str:
    normalized = (phase or "").strip().upper()
    aliases = {
        "EARLY_PHASE1": "Early Phase I",
        "PHASE1": "Phase I",
        "PHASE1 | PHASE2": "Phase I/II",
        "PHASE2": "Phase II",
        "PHASE2 | PHASE3": "Phase II/III",
        "PHASE3": "Phase III",
        "PHASE4": "Phase IV",
        "N/A": "Not specified",
    }
    return aliases.get(normalized, phase or "Not specified")


def _map_cancer_type(value: str) -> str:
    aliases = {
        "Prostate": "Prostate",
        "Bladder/Urothelial": "Bladder",
        "Kidney/RCC": "Kidney",
        "Testicular/GCT": "Testicular",
        "Adrenal": "Adrenal",
        "Penile": "Others",
        "Basket": "Others",
        "Others": "Others",
    }
    return aliases.get((value or "").strip(), "Others")


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")


def _normalize_site_rows(site_rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in site_rows:
        grouped[row["NCT ID"]].append({
            "siteId": _slugify(f"{row.get('Institution', '')}-{row.get('Site city', '')}"),
            "institution": row.get("Institution", "").strip(),
            "city": row.get("Site city", "").strip(),
            "state": "CA",
            "address": "",
            "piName": row.get("PI name", "").strip(),
            "email": _normalize_email(row.get("PI email", "")),
            "phone": row.get("PI phone", "").strip(),
            "affiliation": row.get("PI affiliation", "").strip(),
        })

    for nct_id, rows in grouped.items():
        grouped[nct_id] = sorted(
            rows,
            key=lambda row: (
                row["email"] == "",
                row["piName"] == "" or row["piName"] == "Not listed",
                row["institution"],
                row["city"],
            ),
        )
    return grouped


def build_website_catalog(
    *,
    study_records: list[dict],
    site_rows: list[dict],
    run_ts: str,
    pipeline_version: str,
    source_run_dir: str,
) -> dict:
    export_time = datetime.now(timezone.utc).isoformat()
    grouped_sites = _normalize_site_rows(site_rows)
    institutions = sorted({
        site["institution"]
        for site_group in grouped_sites.values()
        for site in site_group
        if site.get("institution")
    })
    trials: list[dict] = []

    for record in sorted(study_records, key=lambda item: (item.get("Study title", ""), item.get("NCT ID", ""))):
        nct_id = record.get("NCT ID", "").strip()
        cancer_type_tokens = _split_pipe_list(record.get("Cancer type", ""))
        cancer_types = []
        for token in cancer_type_tokens:
            mapped = _map_cancer_type(token)
            if mapped not in cancer_types:
                cancer_types.append(mapped)
        if not cancer_types:
            cancer_types = ["Others"]

        sites = grouped_sites.get(nct_id, [])
        primary_site = sites[0] if sites else {}
        primary_email = primary_site.get("email", "")
        primary_pi = primary_site.get("piName", "")
        primary_institution = primary_site.get("institution", "")
        primary_city = primary_site.get("city", "")
        available_institutions = sorted({site["institution"] for site in sites if site.get("institution")})

        inclusion_text = _collapse_whitespace(record.get("Inclusion criteria", ""))
        exclusion_text = _collapse_whitespace(record.get("Exclusion criteria", ""))
        eligibility_criteria = []
        if inclusion_text:
            eligibility_criteria.append(f"Inclusion: {inclusion_text}")
        if exclusion_text:
            eligibility_criteria.append(f"Exclusion: {exclusion_text}")

        disease_settings = _split_pipe_list(record.get("Disease setting (all)", ""))
        primary_outcomes = _split_bullet_block(record.get("Primary outcomes", ""))
        secondary_outcomes = _split_bullet_block(record.get("Secondary outcomes", ""))
        phase_raw = record.get("Phase", "").strip()

        trials.append({
            "id": nct_id,
            "nctId": nct_id,
            "title": record.get("Study title", "").strip(),
            "status": _map_status(record.get("Status", "")),
            "description": _collapse_whitespace(record.get("Brief summary", "")),
            "qualification": record.get("Disease setting (primary)", "").strip(),
            "location": {
                "hospital": primary_institution,
                "city": primary_city,
                "state": primary_site.get("state", "CA"),
                "zipCode": "",
                "address": primary_site.get("address", ""),
            },
            "contactEmail": primary_email,
            "startDate": record.get("Start date", "").strip(),
            "endDate": record.get("Primary completion", "").strip(),
            "estimatedDuration": "",
            "studyType": "Interventional",
            "phase": _format_phase(phase_raw),
            "phaseRaw": phase_raw,
            "cancerType": cancer_types[0],
            "cancerTypes": cancer_types,
            "sponsor": record.get("Lead sponsor", "").strip(),
            "lastWebsiteUpdate": run_ts.split("_")[0],
            "instituteId": primary_institution,
            "piName": primary_pi,
            "primaryObjective": primary_outcomes[0] if primary_outcomes else "",
            "secondaryObjectives": secondary_outcomes,
            "eligibilityCriteria": eligibility_criteria,
            "lastUpdated": export_time,
            "diseaseSettingPrimary": record.get("Disease setting (primary)", "").strip(),
            "diseaseSettingAll": disease_settings,
            "classificationConfidence": record.get("Classification confidence", "").strip(),
            "treatmentModality": record.get("Treatment modality", "").strip(),
            "delivery": record.get("Delivery", "").strip(),
            "nccnTaxonomyVersion": record.get("NCCN taxonomy version", "").strip(),
            "ctGovUrl": record.get("ClinicalTrials URL", "").strip(),
            "conditions": _split_semicolon_list(record.get("Conditions", "")),
            "interventions": _split_semicolon_list(record.get("Intervention(s)", "")),
            "availableInstitutions": available_institutions,
            "siteCount": len(sites),
            "sites": sites,
            "inclusionCriteria": inclusion_text,
            "exclusionCriteria": exclusion_text,
            "primaryOutcomes": primary_outcomes,
            "secondaryOutcomes": secondary_outcomes,
            "studyFirstPosted": record.get("Study first posted", "").strip(),
            "lastUpdatePosted": record.get("Last update posted", "").strip(),
            "lastSyncAt": export_time,
            "pipelineVersion": pipeline_version,
            "sourceRun": run_ts,
            "sourceRunDir": source_run_dir,
        })

    return {
        "metadata": {
            "exportType": "website_trials_catalog",
            "exportedAt": export_time,
            "lastSyncAt": export_time,
            "pipelineVersion": pipeline_version,
            "sourceRun": run_ts,
            "sourceRunDir": source_run_dir,
            "trialCount": len(trials),
            "institutionCount": len(institutions),
        },
        "trials": trials,
    }


def write_website_catalog(
    *,
    study_records: list[dict],
    site_rows: list[dict],
    out_path: Path,
    run_ts: str,
    pipeline_version: str,
    source_run_dir: str,
) -> Path:
    payload = build_website_catalog(
        study_records=study_records,
        site_rows=site_rows,
        run_ts=run_ts,
        pipeline_version=pipeline_version,
        source_run_dir=source_run_dir,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the production-ready pipeline and emit a website-ready JSON catalog.")
    parser.add_argument("--output-root", type=Path, help="Optional pipeline output root.")
    parser.add_argument("--timestamp", help="Explicit run timestamp in YYYY-MM-DD_HHMM format.")
    parser.add_argument("--page-size", type=int, help="Override CT.gov page size for this run.")
    parser.add_argument("--max-conditions", type=int, help="Limit the number of configured search terms for a smoke run.")
    parser.add_argument(
        "--out",
        type=Path,
        help="Explicit website catalog output path. Defaults to <run_output_dir>/website_trials.json.",
    )
    return parser.parse_args()


def main() -> None:
    from production_ready_pipeline.gu_pipeline import run_pipeline

    args = _parse_args()
    result = run_pipeline(
        output_root=args.output_root,
        timestamp=args.timestamp,
        page_size=args.page_size,
        max_conditions=args.max_conditions,
        skip_excel=False,
        skip_updates=False,
        website_catalog_out=args.out,
    )
    print(
        f"Website catalog ready: {result['website_catalog_path']} "
        f"({result['study_count']} trials from run {result['run_ts']})"
    )


if __name__ == "__main__":
    main()
