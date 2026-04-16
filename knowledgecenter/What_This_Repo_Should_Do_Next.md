# What This Repo Should Do Next

## Where things stand

The pipeline today is a batch Python script. It pulls recruiting GU oncology trials from ClinicalTrials.gov, classifies them against NCCN taxonomies, and writes Excel files. It does this well — 69% of prostate trials classify at HIGH or MEDIUM confidence, the architecture is clean, and the whole thing runs on a laptop with no credentials or cloud accounts.

The Physician Validation Protocol describes something much more ambitious: a physician-facing web application where a doctor types a patient description in plain language and gets back a matched, flagged, source-tagged list of locally available trials with PI contacts. **That application does not exist in this repo.** The distance between what the pipeline produces and what the protocol envisions defines the work ahead.

---

## Principles worth naming up front

Both source documents share commitments that should shape every implementation decision below.

**Surface, never suppress.** The protocol is explicit: "The search never hides a trial because your query is incomplete." An incomplete query produces more flags, not fewer results. The physician sees every relevant trial regardless of how little they typed.

**Inclusive over precise.** Both documents agree: a physician missing a potentially eligible trial is worse than seeing one that does not quite fit. LOW-confidence trials get a review flag, not silence.

**Multi-label when ambiguous.** The pipeline already keeps all matching categories for ambiguous trials. The protocol says: "When a trial is ambiguous, it is tagged to all adjacent categories." The matching engine and UX must honour this — a single trial can legitimately appear under more than one disease setting.

**Every fact carries its source.** The protocol requires CT.gov, NCCN-inferred, and AI-extracted tags on every field, so the physician always knows where a piece of information comes from and how much to trust it.

---

## 1. Build the physician-facing application

The protocol describes three screens. None are implemented.

### Screen 1 — Search

A free-text input where the physician describes their patient in plain clinical language ("Male, 65. mCRPC. Progressed on enzalutamide."). Quick-filter buttons for browsing by cancer type (Prostate, Bladder, Kidney, Testicular). A footer showing last sync date and total trial count, both derivable from pipeline metadata.

The protocol encourages physicians to submit even incomplete queries: "if you are unsure about a biomarker, still submit the query. The search will surface relevant trials and flag exactly which test to order."

### Screen 2 — Results

The query is parsed into structured chips: disease state, prior treatments, biomarkers, notes. Results split into **Strong match** and **Possible match** buckets. Each card shows: trial title, phase, treatment type, match reason, and the local PI at each SoCal site. Data source tags on every field.

### Screen 3 — Trial detail

Full view of the trial: plain-language description, key facts with source tags, eligibility criteria matched against the parsed query (green tick / red cross), SoCal sites with PI name and contact, and action buttons (contact PI, view on CT.gov). A disclaimer reminds the physician to verify with the trial team before referring a patient.

**Team decision needed:** The sources do not specify a web framework, component library, or deployment target. The project team should choose based on existing infrastructure and constraints.

---

## 2. Build a patient-to-trial matching engine

The pipeline classifies trials into NCCN categories. The protocol describes a matching system that goes further — accepting a patient description, comparing it against classified trial data, and producing match quality judgments with verification flags. This engine is the core logic the application depends on and can be developed and tested before any UI work begins.

### Query parser

Accept free-text natural language and extract structured fields mapped to the clinical axes already defined in the taxonomy JSONs. Section 6.1 of the protocol lists what the parser should recognise:

| Field | Examples from protocol | Maps to |
|-------|----------------------|---------|
| Disease stage / setting | "mCRPC", "castration-sensitive, metastatic", "unfavorable intermediate risk, localized" | Disease setting category; castration_status, metastatic_status axes |
| Prior treatments | "Progressed on enzalutamide", "ADT + abiraterone, PSA rising", "no prior chemo" | prior_arpi, prior_docetaxel axes |
| Key biomarkers | "BRCA2+", "PSMA-PET confirmed", "Decipher score 0.72", "HRR wild-type" | biomarker_hrr, psma_status, genomic_classifier axes |
| Disease volume | "6 bone mets, lung nodule", "high-volume disease" | disease_volume axis (CHAARTED/LATITUDE criteria) |
| Treatment modality / phase preference | "Radioligand trial", "PARP inhibitor study", "Phase 3 only" | Filters on treatment type and phase |
| Location preference | "prefers San Diego", "needs to stay near LA" | Ranks results by site proximity |

**Naming convention:** The protocol specifies using the generic term "genomic risk classifier" rather than brand names (Decipher, Oncotype GPS, Prolaris, Artera AI). The parser should recognise brand names in input, but the UI should display the generic function label with a note that the trial team will specify which test they accept.

### Matching logic

For each trial, compare parsed patient fields against classified trial axes:

- **Strong match:** All available eligibility axes in the query are consistent with the trial.
- **Possible match:** Disease setting matches but one or more axes could not be confirmed from the query alone.

Because the pipeline uses multi-label classification, a trial tagged to multiple categories should appear in results for queries that match any of those categories.

The protocol's worked examples demonstrate this matching clearly: as query completeness decreases, the same trials shift from Strong to Possible and accumulate flags. The matching must be deterministic — the physician should be able to predict what adding or removing a field from their query will do.

**Team decision needed:** The protocol does not specify how to rank or order results within the Strong or Possible buckets. The project team should decide on an ordering strategy.

### Verification flags

The protocol defines 9 specific flag types, each generated when a relevant eligibility axis is unresolved in the query:

| Flag | Trigger |
|------|---------|
| BRCA/HRR status not confirmed | Trial requires HRR; query omits it |
| PSMA-PET required | Trial is radioligand; query omits PSMA status |
| Confirm disease volume | Trial restricts by CHAARTED/LATITUDE volume; query omits it |
| Confirm ARPI history | Trial specifies prior ARPI count; query omits it |
| Confirm chemotherapy history | Trial depends on docetaxel history; query omits it |
| Genomic classifier result needed | Trial requires genomic risk test; query omits it |
| Confirm castration status | Trial targets CSPC or CRPC; query omits testosterone |
| Confirm staging (distant mets) | Trial is M0-only or M1-only; query omits staging |
| Verify with trial team — AI-extracted | Any criterion extracted from free text by AI |

Each flag must include three things: what it means, how to resolve it, and expected turnaround. For example, the BRCA/HRR flag specifies: "germline and somatic testing recommended before referring to PARP inhibitor trials. Most labs return in 2–3 weeks." These are action items, not warnings — format them as a clinical checklist.

### Match reason text

Every result card needs a specific, human-readable reason line naming the axes that were resolved. From the protocol: "Matches: mCRPC · post-enzalutamide · PSMA-confirmed · chemo-naive permitted." This is not a generic summary — it names the exact clinical facts that connected this patient to this trial.

---

## 3. Create a queryable data layer

The pipeline writes Excel files. The application needs structured, queryable data.

The schema must include all fields from the current Excel output: trial metadata, classification, axis values with detection evidence, sites, PIs, eligibility text, and outcomes. The structured classification outputs — disease_setting, confidence, all clinical axis values — must be queryable per trial.

One constraint worth highlighting: the `all_trials_YYYY-MM-DD.csv` must remain as the delta source for the pipeline. The README is explicit that this file "is the pipeline's memory" and that the `output/` folder should be "treated as version-controlled state, not disposable build artefacts." The application reads from the new data store, but the pipeline's own delta mechanism should continue to work as designed.

**Team decision needed:** Storage technology (SQLite, PostgreSQL, JSON store, etc.) and indexing strategy. The dataset is small — around 210 trials — so simplicity may be the right call.

---

## 4. Automate weekly sync

The protocol states the pipeline queries ClinicalTrials.gov weekly. The README describes manual runs. Bridging this:

- Schedule the pipeline to run weekly (cron, GitHub Action, or equivalent)
- After each run, ingest new output into the data store
- After each run, update the "last sync" timestamp exposed in the UI footer
- After each run, generate the delta automatically (the updates file already handles this when a previous run exists)

Worth noting: the README specifies that after the first run, recall validation should shift from the UCI/HOAG fixture to comparison against the previous run's `all_trials_YYYY-MM-DD.csv`. Any NCT absent from the current pull is looked up via the API and classified as expected (status changed) or unexpected (still recruiting — investigate). The automation should implement this transition.

**Team decision needed:** Alerting thresholds for recall drops, API unreachability, or zero new trials over consecutive syncs. The README sets a ≥80% recall floor for the first-run fixture check, but ongoing thresholds are for the team to define.

---

## 5. Close classification gaps

### The 32 unclassified prostate trials

32 of 104 prostate trials are DIAGNOSTIC, LIFESTYLE, or Phase 1 first-in-human. Their eligibility text does not use standard NCCN disease-state language, so the classifier leaves them unclassified. The README notes that supportive care and perioperative trials return LOW confidence and are "surfaced with a review flag, not suppressed."

**Team decision needed:** Whether to add new taxonomy categories for these trial types so they are tagged with a label rather than left as UNCLASSIFIED. Category names and definitions are clinical decisions — the sources do not prescribe them.

### Adrenal taxonomy

The README flags this as a known gap and planned extension. Adrenal trials appear in output but with `N/A` confidence. Build `adrenal_v1_2026.json` from NCCN Adrenocortical Carcinoma and Pheochromocytoma/Paraganglioma guidelines, following the existing schema and registration process documented in the README.

### Penile cancer

Listed as `N/A` in the classifier. If trials exist in the SoCal pull, decide whether to build a taxonomy or explicitly exclude.

### Validation for non-prostate cancer types

The protocol's validation summary covers only prostate. The same approach — control NCT IDs with expected classifications and confidence checks — should be applied to bladder, kidney, and testicular. Create fixture files for each.

---

## 6. Enrich PI contact data

The protocol shows PI name and contact on every trial card and detail view. The README lists PI contact enrichment as a planned feature. This is not optional for the application the protocol describes.

- Extract PI name, email, phone from CT.gov `contacts` and `investigators` fields
- Normalise PI names against the 18-institution list
- Surface in the Sites × PI sheet and in the application's trial detail view
- For missing contacts, consider a fallback message ("Contact institution research office") rather than blank fields

---

## 7. Implement data source tagging

The protocol requires every field to be tagged with its provenance. The pipeline classifies but does not currently tag the source of each output field.

- **CT.gov:** NCT ID, title, phase, status, conditions, interventions, eligibility text, sites, PIs, outcomes, summary
- **NCCN-inferred:** Disease setting classification (the protocol defines this as "guideline-inferred")
- **AI-extracted:** Clinical axis values (castration_status, prior_arpi, biomarker_hrr, etc.) derived from pattern matching against eligibility text

The `classification_evidence` field in the pipeline output partially serves this role but needs to be formalised as a per-field provenance tag.

**Team decision needed:** Whether to extend the NCCN-inferred label to other taxonomy-derived fields like section or clinical_order. The protocol uses the label specifically for disease setting.

---

## 8. NCI CTRP cross-validation

Listed as a possible extension in the README. For academic trials (non-industry sponsors), cross-reference against `clinicaltrialsapi.cancer.gov/api/v2`.

- Check `leadSponsor.class` on each trial
- For non-INDUSTRY trials, query NCI API by NCT ID
- Tag as `NCI-validated` or `NCI-unregistered`
- Surface in the updates file and the application as a data quality signal

Unlike the base pipeline, this requires a free NCI API key stored in a `.env` file.

---

## 9. Reconcile the institution count

The protocol says 17 institutions. The README lists 18. The protocol's table shows "primary NCI-designated academic centres" and notes that "the full pipeline covers 18 institutions; see README for the complete list." The application should show all 18 institutions returned by the pipeline. How to present them in the UI is a team decision not specified in the sources.

---

## 10. The progressive disclosure pattern

The protocol's worked examples (Sections A, B, C) demonstrate a specific and important behaviour: as query completeness decreases, the same trials shift from Strong to Possible and accumulate verification flags. This is the protocol's central UX thesis — the system shows the physician exactly what happens when information is omitted and gives them a concrete checklist of what to provide or verify.

This means the matching engine must be deterministic and explainable: given the same query and the same trial data, it must produce the same results and flags every time. The flag list on each trial card is effectively a clinical checklist — format flags as action items with concrete next steps, not vague warnings.

**Team decision needed:** Whether the UI supports in-place query refinement (add a biomarker, see flags resolve without resubmitting) or requires a new search. The protocol's examples show separate queries, but real-time refinement would reinforce the progressive disclosure pattern.

---

## 11. Account for known limitations

The README documents limitations that the application should either mitigate or communicate to users:

- **Blob-based false positives.** Eligibility text concatenation can produce false matches when patterns span sentence boundaries. Mitigated by distance-limited wildcards and negative lookbehinds, but not eliminated. The AI-extracted source tag helps flag these cases for verification.
- **Basket / multi-tumour trials.** Trials enrolling multiple solid tumours may be tagged to the most prominent GU cancer type in the conditions list. The `classification_evidence` field shows what matched — the application should make this visible.
- **Geography edge cases.** The 180-mile radius from Los Angeles means trials at edge-of-radius sites may appear or disappear between runs as CT.gov geocoding updates.

---

## 12. Implement README planned features

The README lists features beyond what the protocol describes:

- **`--compare` flag:** Explicit diff against any named prior output folder, relevant to the sync and delta work.
- **Interactive HTML institution map** (Folium): Could complement the application's site display.
- **PI contact column:** Email surfaced in all sheets, overlapping with the PI enrichment work above.

---

## 13. Operational infrastructure

### CI/CD

Run `test_step1_load.py` and `test_step2_classifier.py` on every commit. Run `test_step3_pipeline.py` on a schedule matching the sync cadence. **Team decision needed:** whether to block merges on test failures and what thresholds to set for the live API recall check.

### NCCN update workflow

The quarterly update process is well-documented in the README but entirely manual. The protocol lists specific NCCN versions in use (Prostate v5.2026, Bladder v3.2025, Kidney v1.2026, Testicular v1.2026). Consider adding a tracking mechanism (issue template, calendar reminder) for NCCN publications and displaying the taxonomy versions in the application so physicians know what they are working with. **Team decision needed:** whether to set a freshness threshold and warn when taxonomy versions exceed it.

### Monitoring

Track pipeline health: total trial count per sync, classification rate per cancer type, recall against previous pull, API availability. **Team decision needed:** specific alert thresholds and monitoring tooling.

---

## 14. Content and disclaimers

The protocol specifies several pieces of copy that must appear in the application UI:

- A disclaimer on every trial detail view: verify with the trial team before referring a patient
- CT.gov reflects sponsor reporting, not real-time enrolment status
- PIs with fewer trials than expected may not have registered all active studies on CT.gov
- AI-extracted signals should always be verified with the trial team
- Physicians are encouraged to submit queries even when incomplete — the system will flag what to check

---

## Suggested priority order

This ordering reflects technical dependencies and the documents' emphasis. It is not prescribed by the sources — the project team should adjust based on resources, constraints, and stakeholder needs.

| Priority | Work | Rationale |
|----------|------|-----------|
| 1 | Queryable data layer | Everything downstream reads from structured trial data |
| 2 | Matching engine and flag generation | Core logic the UX depends on; testable without UI |
| 3 | Search, results, and detail screens | The physician-facing product the protocol describes |
| 4 | Data source tagging | Required by the protocol on every screen |
| 5 | PI contact enrichment | Required for trial detail view and referral workflow |
| 6 | Weekly sync automation | Moves from manual runs to production cadence |
| 7 | Classification gap closure | Improves coverage beyond the current 69% |
| 8 | NCI CTRP cross-validation | Data quality signal; lower urgency |
| 9 | CI/CD, monitoring, NCCN tracking | Operational maturity for sustained use |
