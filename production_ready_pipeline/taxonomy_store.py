from __future__ import annotations

import json
from pathlib import Path


CANCER_TYPE_FILE_MAP = {
    "Bladder/Urothelial": "bladder_v3_2025.json",
    "Prostate": "prostate_v5_2026.json",
    "Kidney/RCC": "kidney_v1_2026.json",
    "Testicular/GCT": "testicular_v1_2026.json",
}

CANCER_TYPE_LABELS = {
    "Bladder/Urothelial": "Bladder Cancer",
    "Prostate": "Prostate Cancer",
    "Kidney/RCC": "Kidney Cancer",
    "Testicular/GCT": "Testicular Cancer",
}


def _load_taxonomy(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


class TaxonomyStore:
    def __init__(self, models_dir: Path | None = None) -> None:
        self.models_dir = models_dir or Path(__file__).resolve().parent / "nccn_input" / "models"
        self._taxonomies: dict[str, dict] = {}
        self.refresh()

    def refresh(self) -> None:
        self._taxonomies = {
            cancer_type: _load_taxonomy(self.models_dir / filename)
            for cancer_type, filename in CANCER_TYPE_FILE_MAP.items()
        }

    def get_for_cancer_type(self, cancer_type: str) -> dict:
        return self._taxonomies.get(cancer_type, {})

    def list_loaded_taxonomies(self) -> list[str]:
        return [
            filename
            for cancer_type, filename in CANCER_TYPE_FILE_MAP.items()
            if self._taxonomies.get(cancer_type)
        ]

    def get_disease_settings_in_order(self, cancer_type: str) -> list[dict]:
        taxonomy = self.get_for_cancer_type(cancer_type)
        categories = sorted(taxonomy.get("categories", []), key=lambda item: item.get("order", 99))
        return [
            {
                "id": category["id"],
                "label": category["label"],
                "short": category["short"],
                "section": category["section"],
                "color_hex": category["color_hex"],
            }
            for category in categories
        ]

    def get_section_colors(self, cancer_type: str) -> dict[str, str]:
        return dict(self.get_for_cancer_type(cancer_type).get("section_colors", {}))

    def get_nccn_stamp(self, cancer_type: str) -> str:
        taxonomy = self.get_for_cancer_type(cancer_type)
        if not taxonomy:
            return "NCCN taxonomy pending"
        label = CANCER_TYPE_LABELS.get(cancer_type, cancer_type)
        version = taxonomy.get("nccn_version", "")
        date = taxonomy.get("nccn_date", "")
        return f"NCCN {label} v{version} ({date})"


default_store = TaxonomyStore()
