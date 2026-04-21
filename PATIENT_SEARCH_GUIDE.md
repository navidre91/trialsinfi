# Patient Search Guide

This guide explains how to use the `Search Trials` tab effectively.

The patient search is a deterministic matcher, not a chatbot. It works best when the query includes the clinical facts that actually drive trial fit:

- cancer type
- disease setting
- therapies already received
- therapies the patient progressed on
- biomarkers
- screening facts like ECOG, labs, organ function, and washout when known

## What The Search Is Trying To Do

The search is designed to:

- find trials that fit the patient’s disease state
- account for required prior therapies
- account for therapies the patient already progressed on
- avoid overcalling trials that only partially fit
- return `Possible match` when key information is missing or needs verification

In general:

- `Strong match` means the query lines up well with the trial’s apparent disease state and therapy requirements
- `Possible match` means the trial may still be relevant, but something needs confirmation
- if a trial clearly conflicts with the patient profile, it should be excluded

## Most Important Rule

For advanced prostate search, **prior therapy sequence matters a lot**.

There is a real difference between:

- `received docetaxel`
- `progressed on docetaxel`

There is also a real difference between:

- `post-ARPI`
- `progressed on enzalutamide`
- `progressed on abiraterone`

If you want the best results, be explicit.

## Best Query Structure

Use this pattern:

`[Cancer] + [Disease state] + [Progressed on] + [Other prior therapies] + [Biomarkers] + [Screening facts if known]`

Good example:

`mCRPC. Progressed on enzalutamide. No prior docetaxel. BRCA2+. PSMA-positive PET. ECOG 1. Labs normal. Adequate organ function.`

## Phrases That Work Well

Use these exact styles when possible:

- `progressed on enzalutamide`
- `progressed on abiraterone`
- `progressed on docetaxel`
- `progressed on ADT and enzalutamide and docetaxel`
- `received docetaxel`
- `currently on enzalutamide`
- `no prior docetaxel`
- `no prior cabazitaxel`
- `BRCA2+`
- `HRR positive`
- `PSMA-positive PET`
- `FGFR3 mutation`
- `HER2 IHC 3+`
- `ECOG 1`
- `labs normal`
- `adequate organ function`
- `last systemic therapy 21 days ago`

## Phrases To Avoid

These are weaker and less precise:

- `many prior therapies`
- `heavily treated`
- `failed multiple treatments`
- `advanced disease`
- `on hormone therapy`
- `post treatment`

The system may still return results, but they are more likely to become `Possible match`.

## Prostate Examples

### 1. Broad Post-ARPI Search

Query:

`mCRPC. Progressed on enzalutamide.`

Meaning:

- prostate cancer
- metastatic CRPC
- explicit progression on enzalutamide

This is better than:

`advanced prostate cancer after treatment`

### 2. Exact Later-Line Sequence

Query:

`mCRPC. Progressed on ADT and enzalutamide and docetaxel.`

Use this when the patient really has progressed through all three.

This matters because a trial that requires prior progression on all of those should not be matched strongly for a patient who only progressed on one of them.

### 3. Received But Did Not Progress

Query:

`mCRPC. Received docetaxel. Progressed on enzalutamide.`

This is important. It tells the system:

- docetaxel was given
- but progression is only explicitly known on enzalutamide

That should behave differently from:

`mCRPC. Progressed on enzalutamide and docetaxel.`

### 4. Current Therapy, Not Progressed Yet

Query:

`mCRPC. Currently on enzalutamide.`

Do not write:

`post enzalutamide`

unless the patient actually progressed on it.

### 5. Biomarker-Enriched Search

Query:

`mCRPC. Progressed on enzalutamide. No prior docetaxel. BRCA2+. PSMA-positive PET.`

This is a strong query because it combines:

- disease state
- exact prior progression
- taxane history
- DNA repair biomarker
- PSMA imaging status

### 6. Screening Facts Included

Query:

`mCRPC. Progressed on enzalutamide. ECOG 1. Labs normal. Adequate organ function. Last systemic therapy 21 days ago.`

This can promote some trials from `Possible match` to `Strong match`.

## Bladder Examples

### 1. NMIBC / BCG-Unresponsive

Query:

`BCG-unresponsive NMIBC with CIS`

### 2. Papillary-Only Recurrence

Query:

`BCG-unresponsive NMIBC with papillary-only recurrence`

### 3. Metastatic Urothelial With Biomarker

Query:

`Metastatic urothelial carcinoma after prior platinum. FGFR3 mutation.`

### 4. HER2-Directed Search

Query:

`Metastatic urothelial carcinoma after prior platinum. HER2 IHC 3+.`

## Kidney Examples

### 1. Generic Clear-Cell / Metastatic

Query:

`Metastatic clear-cell RCC after prior IO.`

### 2. Papillary / MET-Driven

Query:

`Metastatic papillary type 2 RCC. MET alteration.`

### 3. Non-Clear-Cell

Query:

`Metastatic non-clear-cell RCC, treatment-naive.`

### 4. Rare Histology

Query:

`Metastatic chromophobe RCC`

or

`Metastatic renal medullary carcinoma`

## Testicular Examples

### 1. Stage IS Pattern

Query:

`NSGCT with AFP elevated after orchiectomy and no prior chemotherapy`

### 2. Salvage Context

Query:

`NSGCT after first-line BEP with residual mass after chemotherapy, markers normal`

### 3. Mediastinal Primary

Query:

`Primary mediastinal NSGCT, advanced disease, no prior chemotherapy`

## Stronger vs Weaker Query Examples

### Weak

`advanced prostate cancer after treatment`

Why it is weak:

- does not specify disease state
- does not specify what treatment was received
- does not say what the cancer progressed on

### Better

`mCRPC. Progressed on enzalutamide.`

Why it is better:

- exact disease state
- exact named therapy progression

### Strong

`mCRPC. Progressed on enzalutamide. No prior docetaxel. BRCA2+. PSMA-positive PET. ECOG 1. Labs normal. Adequate organ function.`

Why it is strong:

- disease state
- exact prior progression
- exact taxane history
- biomarkers
- screening facts

## How To Think About Prior Therapy

When writing a query, separate these concepts clearly:

- `must have already received`
- `must have already progressed on`
- `must not have received`

Examples:

- `received docetaxel`
- `progressed on docetaxel`
- `no prior cabazitaxel`

Those are not interchangeable.

## Common Search Patterns

### If You Know Exact Sequence

Use:

`mCRPC. Progressed on ADT and enzalutamide and docetaxel.`

### If You Only Know One Confirmed Progression

Use:

`mCRPC. Received docetaxel. Progressed on enzalutamide.`

### If You Only Know Broad Setting

Use:

`mCRPC`

This will still return trials, but expect more `Possible match` results.

## Interpreting Possible Match

`Possible match` does not mean weak or irrelevant. It usually means one of these needs confirmation:

- exact prior therapy sequence
- biomarker status
- PSMA imaging status
- ECOG
- organ function
- washout timing

## Practical Tips

- Include the cancer type or disease state early in the query.
- Use exact agent names when you know them.
- Use `progressed on` if progression is known.
- Use `received` if exposure is known but progression is not.
- Include `no prior` when it matters.
- Add biomarkers when relevant.
- Add ECOG, labs, organ function, and timing if available.

## Current Limitation

The search is a structured matching tool, not a final eligibility engine.

It is meant to:

- help narrow the right trials
- reduce obvious mismatches
- show what still needs confirmation

It should not replace full protocol review or discussion with the trial team.
