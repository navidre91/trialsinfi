# GU Oncology Trial Pipeline — SoCal
**Version 2.1.0 · Pipeline design: Sophie Zaaijer PhD · Implementation: Claude (Anthropic)**

Automated pipeline to fetch, classify, and export recruiting GU oncology clinical trials at Southern California academic medical centres, using NCCN Clinical Practice Guidelines as the classification framework.

**Output:** One dated folder per run containing five Excel files — one per cancer type plus an updates/analytics file.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Repository layout](#repository-layout)
3. [Requirements & setup](#requirements--setup)
4. [Quick start](#quick-start)
5. [Run strategy (step by step)](#run-strategy-step-by-step)
6. [Output structure](#output-structure)
7. [Developer portability](#developer-portability)
8. [NCCN taxonomy — quarterly update process](#nccn-taxonomy--quarterly-update-process)
9. [Test suite](#test-suite)
10. [Validation approach](#validation-approach)
11. [Architecture](#architecture)
12. [Supported institutions](#supported-institutions)
13. [Known limitations](#known-limitations)
14. [Possible extensions](#possible-extensions)

---

## What it does

1. **Fetches** all recruiting interventional GU oncology trials from ClinicalTrials.gov API v2 within 180 miles of Los Angeles, including adrenal tumours.
2. **Detects** cancer type (Prostate / Bladder/Urothelial / Kidney/RCC / Adrenal / Testicular/GCT / Penile) from conditions and title.
3. **Classifies** each trial against NCCN disease setting categories and populates cancer-specific clinical axes (e.g. IMDC risk, prior IO, castration status, IGCCCG risk).
4. **Flags** ambiguous trials with confidence scores (HIGH / MEDIUM / LOW) and surfaced evidence patterns.
5. **Exports** five separate Excel files per run — one per cancer type group plus an updates/analytics file — into a timestamped output folder.

---

## Repository layout

```
GU_Trial_Pipeline_Release/
│
├── gu_pipeline.py           ← Main script: fetch → classify → export
├── nccn_classifier.py       ← Classification engine (no network calls)
│
├── nccn_input/
│   ├── models/              ← NCCN taxonomy JSON files (one per cancer type)
│   │   ├── prostate_v5_2026.json
│   │   ├── bladder_v3_2025.json
│   │   ├── kidney_v1_2026.json
│   │   └── testicular_v1_2026.json
│   └── pdfs/                ← Place NCCN source PDFs here when updating taxonomies
│
├── config/
│   ├── gu_terms.json        ← Search terms sent to ClinicalTrials.gov API
│   └── socal_sites.json     ← SoCal institution name normalisation rules
│
├── tests/
│   ├── test_step1_load.py        ← Taxonomy JSON structure validation (offline)
│   ├── test_step2_classifier.py  ← Classifier regression tests (offline)
│   ├── test_step3_pipeline.py    ← Live API + UCI/HOAG recall test
│   └── fixtures/
│       └── hoag_uci_control_ncts.json  ← 39 verified UCI/Hoag NCT IDs (first-run recall)
│
├── output/                  ← Generated output (gitignored)
│   └── YYYY-MM-DD_HHMM/    ← One subfolder per run (timestamped)
│       ├── prostate_trials_YYYY-MM-DD.xlsx
│       ├── bladder_trials_YYYY-MM-DD.xlsx
│       ├── kidney_adrenal_trials_YYYY-MM-DD.xlsx
│       ├── testicular_trials_YYYY-MM-DD.xlsx
│       ├── updates_YYYY-MM-DD.xlsx
│       └── all_trials_YYYY-MM-DD.csv      ← Flat file used for delta in next run
│
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Requirements & setup

- Python 3.9 or higher
- Internet access (queries ClinicalTrials.gov API v2 — no API key required)

```bash
pip install -r requirements.txt
# installs: requests, pandas, openpyxl
```

No API key, no database, no cloud account, no environment variables required.

---

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run pre-flight tests (offline — confirm everything is healthy)
python3 tests/test_step1_load.py
python3 tests/test_step2_classifier.py

# 3. Run live API recall test (first run only — ~30s)
python3 tests/test_step3_pipeline.py

# 4. Run the pipeline (~60–90s)
python3 gu_pipeline.py

# Output appears in:
#   output/YYYY-MM-DD_HHMM/prostate_trials_YYYY-MM-DD.xlsx
#   output/YYYY-MM-DD_HHMM/bladder_trials_YYYY-MM-DD.xlsx
#   output/YYYY-MM-DD_HHMM/kidney_adrenal_trials_YYYY-MM-DD.xlsx
#   output/YYYY-MM-DD_HHMM/testicular_trials_YYYY-MM-DD.xlsx
#   output/YYYY-MM-DD_HHMM/updates_YYYY-MM-DD.xlsx
#   output/YYYY-MM-DD_HHMM/all_trials_YYYY-MM-DD.csv
```

---

## Run strategy (step by step)

### Step 1 — Pre-flight: taxonomy validation (offline, ~2s)

```bash
python3 tests/test_step1_load.py
```

Confirms all four NCCN taxonomy JSON files load correctly before any classification or API calls. If this fails, fix the taxonomy file before proceeding.

**Checks:** all 4 files exist and parse as valid JSON, required top-level keys present, each category has `id`, `label`, `order`, `include_patterns`, `exclude_patterns`.

---

### Step 2 — Pre-flight: classifier regression (offline, ~5s)

```bash
python3 tests/test_step2_classifier.py
```

Runs 14 fixed clinical cases through `classify_trial()` and verifies expected outputs. This is the primary regression guard — run it after **any** change to a taxonomy JSON or to `nccn_classifier.py`.

**If it fails:** a taxonomy edit has broken a known case. Fix before proceeding.

---

### Step 3 — Recall validation (live API, ~30s)

```bash
python3 tests/test_step3_pipeline.py          # full suite
python3 tests/test_step3_pipeline.py --quick  # API reachability only
```

#### First run: UCI/HOAG fixture

On the initial run, this test checks that ≥80% of the 39 manually verified UCI/Hoag control NCTs in `tests/fixtures/hoag_uci_control_ncts.json` are returned by the live API.

For any missed NCTs, query ClinicalTrials.gov directly (`GET /api/v2/studies/{nctId}`) to retrieve `overallStatus`. Missed trials whose status is `COMPLETED`, `WITHDRAWN`, or `TERMINATED` are expected — they closed since the fixture was created. Only missed trials still `RECRUITING` warrant investigation (check facility normalization, geography, or query term coverage).

#### After handoff to developer: switch to previous-pull comparison

The UCI/HOAG fixture is a point-in-time snapshot. As trials close over time, recall against it will drift downward — this is expected, not a pipeline failure. **From the second run onward**, the developer should validate by comparing the current pull against the previous run's `all_trials_YYYY-MM-DD.csv` (saved automatically in the previous run's output folder).

Logic:
1. Load NCT IDs from previous run's CSV
2. Any NCT absent from the current pull → fetch its current `overallStatus` from the API
3. Classify each miss:
   - `COMPLETED / TERMINATED / WITHDRAWN / SUSPENDED` → expected, document in updates file
   - Still `RECRUITING` → flag for investigation (SoCal site may have dropped, geocoding may have shifted)

This keeps the baseline self-updating: it always reflects what the pipeline last saw. The UCI/HOAG fixture can be retained as a periodic sanity check (e.g. quarterly) but is not the primary recall gate after the first run.

---

### Step 4 — Adrenal search terms (config update)

`config/gu_terms.json` includes `adrenocortical carcinoma` and `pheochromocytoma` in `primary_terms` and `match_terms`. These are tagged as `cancer_type = "Adrenal"` and appear in the `kidney_adrenal_trials_YYYY-MM-DD.xlsx` output file alongside RCC. Adrenal trials appear in Sites × PI, Eligibility, and Outcomes tabs but **not** in the Trial Finder tab (no NCCN taxonomy for adrenal exists yet — flagged as `N/A` in metadata).

---

### Step 5 — Full pipeline run

```bash
python3 gu_pipeline.py
```

Runs parallel API fetches, normalises facilities to 18 SoCal institutions, classifies via NCCN, and writes the 5-file output folder. Typical runtime: 60–90 seconds.

---

### Step 6 — README update

After each run that changes pipeline behaviour (new search terms, taxonomy update, output format change), update this README and increment the version number in `gu_pipeline.py`.

---

## Output structure

Each run creates a folder `output/YYYY-MM-DD_HHMM/` containing:

### Cancer-type Excel files (4 files)

Each file covers one cancer type group and contains four sheets:

| Sheet | Contents |
|-------|---------|
| **Trial Finder** | Physician-facing view grouped by NCCN disease setting, colour-coded by section, sorted by phase then institution count. Shows NCT ID, title, phase, treatment, available institutions, top PIs, confidence, CT.gov link. |
| **Sites × PI** | One row per trial × institution. PI name, email, phone, affiliation, disease setting, treatment modality. |
| **Eligibility** | One row per trial. Inclusion and exclusion criteria as parsed text, age range, sex. |
| **Outcomes** | One row per trial. Primary and secondary outcome measures with time frames. |

| File | Cancer type(s) covered | NCCN taxonomy used |
|------|----------------------|-------------------|
| `prostate_trials_YYYY-MM-DD.xlsx` | Prostate | NCCN Prostate v5.2026 |
| `bladder_trials_YYYY-MM-DD.xlsx` | Bladder / Urothelial | NCCN Bladder v3.2025 |
| `kidney_adrenal_trials_YYYY-MM-DD.xlsx` | Kidney/RCC + Adrenal | NCCN Kidney v1.2026 (adrenal: N/A) |
| `testicular_trials_YYYY-MM-DD.xlsx` | Testicular / GCT | NCCN Testicular v1.2026 |

### Updates file (`updates_YYYY-MM-DD.xlsx`)

Four sheets:

**Sheet 1 — Changes since last pull**
- Trials removed since previous run, with `overallStatus` fetched fresh from the API and `whyStopped` where available
- Trials newly added since previous run
- Key field changes: status transitions, PI changes, site additions/removals
- First run: marked as "Baseline run — no prior pull to compare against"

**Sheet 2 — Stats by hospital**
- Trial counts per institution × cancer type
- Phase breakdown (Phase 1 / 2 / 3) per institution
- RECRUITING vs NOT_YET_RECRUITING counts

**Sheet 3 — New trials by time window**
- New since last pull / since 6 months ago / since 12 months ago — by institution and cancer type
- Uses `studyFirstPostDate` from the ClinicalTrials.gov API

**Sheet 4 — Metadata**
- Run timestamp, pipeline version, API version
- Total trials by cancer type
- Geography filter (180 mi from LA, 33.8°N 118.0°W)
- Status filter, study type filter
- Conditions queried, institutions targeted
- NCCN model versions in use:
  - Prostate: NCCN v5.2026 (2026-01-23)
  - Bladder: NCCN v3.2025 (2025-12-19)
  - Kidney: NCCN v1.2026 (2026-07-24)
  - Testicular: NCCN v1.2026 (2026-04-06)
  - Adrenal: not yet classified (taxonomy build pending)
- Recall test results (% of control NCTs found, number missed, number status-changed)

### Flat CSV (`all_trials_YYYY-MM-DD.csv`)

Trial-level flat file used by the next run to compute the delta in the updates file. **Do not delete this file.** It is the pipeline's memory.

---

## Developer portability

The pipeline is fully self-contained. To run it on a new machine:

**What to transfer:**
- The full `GU_Trial_Pipeline_Release/` directory
- **Include the `output/` folder** with the most recent dated run inside it. Without it, the developer's first run produces a "baseline" updates file with no delta. With it, they get a real diff against the last pull.

**What to install:**
```bash
python3 --version   # must be 3.9+
pip install -r requirements.txt
```

That's it. No API key, no database, no cloud account, no `.env` file.

**Important:** The `output/` folder is the pipeline's memory. If it is deleted or the developer starts with an empty `output/`, the next run becomes a new baseline — all historical delta information is lost. Treat `output/` as version-controlled state, not disposable build artefacts.

---

## NCCN taxonomy — quarterly update process

NCCN publishes updated clinical guidelines 3–5 times per year per cancer type. **NCCN does not offer a public API** — guidelines are published as PDFs at nccn.org and require a free account (healthcare professional or affiliated researcher registration). There is no automated pull.

### When to update

Subscribe to NCCN update notifications at nccn.org (free, email alerts by cancer type). When prostate, bladder, kidney, or testicular guidelines increment, follow the process below.

### How to update

**Step 1 — Download the new PDF**

Log in at nccn.org, download the updated guideline PDF, and save it to `nccn_input/pdfs/` with a versioned filename (e.g. `prostate_v6_2026.pdf`). The old PDF can remain for reference.

**Step 2 — Read "Changes from Prior Version"**

This is the first page of every NCCN guideline. It lists exactly what changed — new drugs approved, staging criteria revised, new categories added. This is the only page that needs to be read carefully. Most updates are minor (one or two pattern additions); full category restructuring is rare.

**Step 3 — Edit the JSON taxonomy file**

Open the relevant file in `nccn_input/models/` (e.g. `prostate_v5_2026.json` → save as `prostate_v6_2026.json`) and make the changes. The JSON schema is self-documenting.

Common edits:

| Change type | What to do |
|-------------|-----------|
| New drug approved in a setting | Add drug name as a pattern to the relevant category's `include_patterns` |
| New biomarker requirement | Add detection rule to the relevant `clinical_axes` block |
| New disease category added | Add a new category block with `id`, `label`, `short`, `section`, `order`, `confidence_base`, `include_patterns`, `exclude_patterns` |
| Category removed or merged | Delete or merge the category block; update `order` values for remaining categories |
| Staging criteria revised | Update `include_patterns` and `exclude_patterns` on affected categories |
| Version bump only | Update `nccn_version` and `nccn_date` at the top of the file |

Always update `nccn_version` and `nccn_date` at the top of the file, and add an entry to the `changelog` array if one exists.

If the filename changes (new version number), update the `_load_taxonomy()` call in `nccn_classifier.py` and the `nccn_version` field reference in `gu_pipeline.py`.

**Step 4 — Run validation**

```bash
python3 tests/test_step1_load.py       # confirms file loads correctly
python3 tests/test_step2_classifier.py # confirms no regression on known cases
```

If any regression test breaks, a pattern change has broken a known case. Fix the pattern before running the full pipeline.

**Step 5 — Add a regression test for any new category**

In `tests/test_step2_classifier.py`, add at least one test case for any new NCCN category. This ensures future taxonomy edits cannot silently break the new category.

**Step 6 — Update metadata**

The NCCN version in the updates file Sheet 4 picks up automatically from the taxonomy JSON headers. No other metadata change is required.

### Using Claude to assist with taxonomy updates

The developer does not need to be a GU oncologist to implement taxonomy updates. A practical workflow:

1. Upload the "Changes from Prior Version" page and the current taxonomy JSON to Claude
2. Ask Claude to propose the JSON diff based on the guideline changes
3. Review and approve the proposed changes
4. Run `test_step1_load.py` and `test_step2_classifier.py` to validate

The clinical judgment call on whether a new NCCN category warrants a new JSON block vs. a pattern update belongs with the clinical team (Sophie Zaaijer PhD or equivalent). The developer implements; the test suite validates.

---

## Test suite

### Step 1 — Taxonomy load (`tests/test_step1_load.py`)

**Run:** `python3 tests/test_step1_load.py`
**Requires:** No network. Run before any classification.
**Checks:** All 4 JSON files present and valid, required schema keys present, `nccn_classifier` imports without error.

---

### Step 2 — Classifier regression (`tests/test_step2_classifier.py`)

**Run:** `python3 tests/test_step2_classifier.py`
**Requires:** No network. Run after any taxonomy or classifier change.

| Case | Expected output |
|------|----------------|
| BCG-unresponsive NMIBC | `bcg_status = bcg_unresponsive` |
| Cisplatin-eligible MIBC | `cisplatin_status = cisplatin_eligible` |
| nmCRPC (darolutamide) | `castration_status = castration_resistant`, `metastatic_status = non_metastatic` |
| mCRPC post-ARPI, BRCA | `prior_arpi = yes`, `biomarker_hrr = brca_mutated` |
| Adjuvant ccRCC post-nephrectomy | `histology = clear_cell`, `nephrectomy_status = prior_nephrectomy`, `prior_io = no` |
| 1L metastatic ccRCC | `prior_systemic_lines = 0`, `prior_io = no`, `prior_vegf_tki = no` |
| Stage I seminoma | `histology = pure_seminoma`, `clinical_stage = stage_1a` |
| Good-risk NSGCT | `histology = nsgct`, `igcccg_risk = good` |
| Extragonadal mediastinal GCT | `primary_site = mediastinal` |
| Perioperative orchiectomy trial | `confidence = LOW`, primary contains "review" |
| Unsupported cancer type (Penile) | `confidence = N/A` |

---

### Step 3 — Pipeline / live API (`tests/test_step3_pipeline.py`)

**Run:** `python3 tests/test_step3_pipeline.py`
**Requires:** Internet access. Run before each production pull.

**Tests:**
- 3a: ClinicalTrials.gov API v2 is reachable
- 3b: Returned records contain all expected fields
- 3c: ≥80% of UCI/Hoag control NCTs retrieved (first run) or previous-pull delta within tolerance (subsequent runs)
- 3d: Cancer type detector correctly tags prostate / bladder / kidney / testicular records
- 3e: Classifier runs end-to-end on live records without exceptions

**Known non-failures:**
- A control trial closes/changes status → appears in missed-NCT warning (non-fatal if recall ≥80%)
- ClinicalTrials.gov temporarily unavailable → Step 3a fails; Steps 1–2 are unaffected

---

## Validation approach

### First run: UCI/HOAG fixture

`tests/fixtures/hoag_uci_control_ncts.json` contains 39 manually verified GU oncology NCT IDs confirmed recruiting at UCI/Hoag as of the fixture creation date. These serve as the recall floor for the first run.

Missed NCTs that are still RECRUITING in the live API indicate a pipeline gap (facility normalization, geography, or query term issue). Missed NCTs with status `COMPLETED / WITHDRAWN / TERMINATED` are expected.

### Subsequent runs: previous-pull comparison

After the first run, the recall baseline transitions to the previous run's `all_trials_YYYY-MM-DD.csv`. Any NCT absent from the current pull is looked up via the API; its disappearance is classified as expected (status changed) or unexpected (still recruiting, needs investigation). This keeps the validation self-updating and immune to fixture staleness.

The UCI/HOAG fixture can be refreshed periodically (e.g. quarterly) by re-verifying which trials are actively recruiting at UCI/Hoag and replacing the JSON.

---

## Architecture

### Two-module design

| File | Role |
|------|------|
| `nccn_classifier.py` | **Classification engine.** Loads JSON models from `nccn_input/models/`. Exposes `classify_trial()` as the single public API. No network calls. Can be imported standalone. |
| `gu_pipeline.py` | **Pipeline script.** Queries ClinicalTrials.gov, normalises facilities, detects cancer type, calls the classifier, and writes output files. Imports from `nccn_classifier`. |

### Classification flow

```
Raw trial record (title + eligibility + conditions + summary)
        │
        ▼
Cancer type detection (regex on conditions + title)
        │
        ▼
nccn_classifier.classify_trial(cancer_type, ...)
        │
        ├── Disease setting classification
        │     ├── Match include_patterns against text blob
        │     ├── Apply exclude_patterns
        │     ├── Multi-label: keep all matching categories
        │     └── Sort by clinical order + confidence → primary label
        │
        ├── Clinical axis classification (per cancer type)
        │     e.g. Kidney: histology, IMDC risk, prior IO, prior VEGF-TKI
        │     e.g. Prostate: castration status, metastatic status, prior ARPI, HRR, PSMA
        │
        └── Treatment modality classification
              e.g. IMMUNOTHERAPY · TARGETED → delivery = SYSTEMIC
```

### Confidence scoring

| Level | Meaning |
|-------|---------|
| `HIGH` | 3+ independent patterns matched, or 2 with HIGH base confidence |
| `MEDIUM` | 2 patterns matched with MEDIUM base |
| `LOW` | 1 pattern matched, or recognised cancer type but no category match |
| `UNCLASSIFIED` | Cancer type not detected |
| `N/A` | Cancer type detected but no taxonomy built yet (e.g. Penile, Adrenal) |

**Design principle:** Inclusive over precise. LOW-confidence trials are surfaced with a review flag rather than suppressed. A physician missing a trial is a worse outcome than seeing one that does not fit.

### NCCN taxonomy JSON schema

```json
{
  "disease": "kidney",
  "nccn_version": "1.2026",
  "nccn_date": "2026-07-24",
  "categories": [
    {
      "id": "metastatic_ccrcc_1l",
      "label": "Metastatic ccRCC — 1st Line, All Risk Groups",
      "short": "Metastatic ccRCC 1L",
      "section": "Metastatic_ccRCC",
      "order": 7,
      "confidence_base": "HIGH",
      "include_patterns": ["..."],
      "exclude_patterns": ["..."],
      "color_hex": "1565C0"
    }
  ],
  "clinical_axes": {
    "histology": {
      "values": ["clear_cell", "papillary"],
      "detection_rules": {
        "clear_cell": ["(?<!non-)(?<!non )clear.cell.*renal"],
        "papillary":  ["papillary.*RCC"]
      }
    }
  },
  "section_colors": { "Metastatic_ccRCC": "0D47A1" }
}
```

---

## Adding a new NCCN taxonomy

To add a new cancer type (e.g. Penile or Adrenal):

1. **Create the JSON model** at `nccn_input/models/adrenal_v1_2026.json` following the schema above.

2. **Register it in `nccn_classifier.py`:** add `_load_taxonomy()` call, add `_classify_adrenal_disease()`, `_classify_adrenal_axis()`, `_classify_all_adrenal_axes()` functions, and an `elif cancer_type == "Adrenal":` branch in `classify_trial()`. Update `get_disease_settings_in_order()`, `get_section_colors()`, `get_nccn_stamp()`, and `list_loaded_taxonomies()`.

3. **Update `gu_pipeline.py`:** confirm the `_CANCER_RE` entry for the cancer type is correct. The Trial Finder tab for the relevant output file will automatically include the new cancer type once the taxonomy is registered.

4. **Add regression tests** in `tests/test_step2_classifier.py` (at least 2–3 cases per new cancer type).

---

## Supported institutions (SoCal — 18)

The pipeline normalises facility names to 18 canonical institutions:

| Institution | City |
|-------------|------|
| UC Irvine / Chao Family NCI Cancer Center | Orange |
| UC San Diego / Moores Cancer Center | La Jolla |
| UCLA / Jonsson Comprehensive Cancer Center | Los Angeles |
| USC / Norris Comprehensive Cancer Center | Los Angeles |
| USC / LAC+USC Medical Center | Los Angeles |
| City of Hope National Medical Center | Duarte |
| City of Hope – Orange County | Irvine |
| City of Hope – Corona | Corona |
| Cedars-Sinai Medical Center | Los Angeles |
| Hoag Hospital Newport Beach | Newport Beach |
| Providence / St. Jude Medical Center | Fullerton |
| Providence Medical Foundation | Various |
| Loma Linda University Cancer Center | Loma Linda |
| Loma Linda VA | Loma Linda |
| VA Greater Los Angeles | Los Angeles |
| VA Long Beach | Long Beach |
| Scripps MD Anderson Cancer Center | La Jolla |
| Sharp Memorial Hospital | San Diego |

---

## Known limitations

1. **Blob-based classification.** Eligibility text is concatenated before pattern matching. Long texts can produce false positives when `.*` spans sentence boundaries. Mitigated by negative lookbehinds and distance-limited wildcards (`prior.{0,30}drug`), but not eliminated.

2. **Adrenal: no NCCN taxonomy.** Adrenal trials are captured and appear in Sites × PI, Eligibility, and Outcomes sheets but are not NCCN-classified. The Trial Finder tab shows `N/A` confidence for adrenal trials.

3. **Supportive care / perioperative trials.** Trials targeting surgical technique, pain management, survivorship, or quality of life return LOW confidence. These are surfaced with a review flag, not suppressed.

4. **Basket / multi-tumour trials.** Trials enrolling multiple solid tumours may be tagged to the most prominent GU cancer type in the conditions list. Review `classification_evidence` to understand what matched.

5. **Geography filtering.** Uses a 180-mile radius from Los Angeles centre (33.8°N, 118.0°W). Trials at edge-of-radius sites may occasionally appear or disappear between runs as CT.gov geocoding updates.

6. **CT.gov reflects sponsor reporting.** Whether a specific site is actively enrolling requires a call to the research coordinator. PIs with fewer trials than expected may not have registered all active studies on CT.gov.

---

## Possible extensions

### NCI CTRP cross-validation for academic trials

Cross-reference against the NCI Clinical Trials Reporting Program (CTRP) via `clinicaltrialsapi.cancer.gov/api/v2`. Academic sponsors (universities, NCI-designated cancer centres, cooperative groups) are required to register in CTRP; industry sponsors are not. Academic trials absent from CTRP are a data quality flag.

**Implementation:** for each trial, check `leadSponsor.class` in the CT.gov record. If not `"INDUSTRY"`, query NCI API by NCT ID. Found → mark NCI-validated. Not found → flag as "NCI unregistered." Requires a free NCI API key stored in a `.env` file.

### Adrenal NCCN taxonomy

Adrenocortical carcinoma and pheochromocytoma/paraganglioma (PPGL) have separate NCCN guidelines. Building taxonomy JSON files for these would enable Trial Finder classification for the Kidney/Adrenal file.

### v1.1 planned features (hematology roadmap parity)

- `--compare` flag: explicit diff against any named prior output folder
- PI contact column (email surfaced in all sheets)
- Interactive HTML institution map (Folium)

---

## Contacts

Pipeline design and clinical logic: Sophie Zaaijer PhD
Implementation: Claude (Anthropic)
Data source: ClinicalTrials.gov API v2 — https://clinicaltrials.gov/data-api/api
NCCN guidelines: https://www.nccn.org/guidelines/guidelines-detail
