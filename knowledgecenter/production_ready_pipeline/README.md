# Production-Ready GU Trial Pipeline

This folder is a hardened rewrite of `GU_Trial_Pipeline_Release`, kept separate so it can be tested before any website integration.

## What changed

- The pipeline is split into modules instead of one monolithic script.
- CT.gov access, study parsing, site normalization, NCCN classification, and Excel export now live in separate files.
- Search terms and SoCal site settings are loaded from `config/*.json` instead of being buried in the runner.
- The live smoke test now uses the real cancer-type detector and a more realistic recall rule for closed trials.
- The output format stays compatible with the current dated-run folder structure so website integration can happen later.

## Layout

```text
production_ready_pipeline/
├── api_client.py
├── app_config.py
├── excel_export.py
├── gu_pipeline.py
├── nccn_classifier.py
├── site_normalization.py
├── study_parser.py
├── taxonomy_store.py
├── config/
├── nccn_input/
└── tests/
```

## Run

```bash
python3 knowledgecenter/production_ready_pipeline/gu_pipeline.py
```

Useful smoke-run options:

```bash
python3 knowledgecenter/production_ready_pipeline/gu_pipeline.py --max-conditions 2 --page-size 20
python3 knowledgecenter/production_ready_pipeline/gu_pipeline.py --skip-excel
```

## Tests

```bash
python3 knowledgecenter/production_ready_pipeline/tests/test_step1_load.py
python3 knowledgecenter/production_ready_pipeline/tests/test_step2_classifier.py
python3 knowledgecenter/production_ready_pipeline/tests/test_step3_pipeline.py --quick
python3 knowledgecenter/production_ready_pipeline/tests/test_step4_exports.py
```

Run the full live check when you want recall validation as well:

```bash
python3 knowledgecenter/production_ready_pipeline/tests/test_step3_pipeline.py
```
