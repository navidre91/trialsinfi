from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class ApiConfig:
    base_url: str = "https://clinicaltrials.gov/api/v2/studies"
    geo_filter: str = "distance(33.8,-118.0,180mi)"
    statuses: tuple[str, ...] = ("RECRUITING",)
    study_type: str = "INTERVENTIONAL"
    page_size: int = 100
    max_workers: int = 5
    request_timeout: int = 30
    polite_sleep_seconds: float = 0.05


@dataclass(frozen=True)
class SearchTermsConfig:
    primary_terms: tuple[str, ...]
    basket_terms: tuple[str, ...] = ()
    match_terms: tuple[str, ...] = ()


@dataclass(frozen=True)
class SiteConfig:
    states: tuple[str, ...]
    cities: tuple[str, ...]
    facility_keywords: tuple[str, ...]
    institution_groups: dict[str, tuple[str, ...]] = field(default_factory=dict)
    pi_aliases: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PipelineConfig:
    root: Path
    output_dir: Path
    api: ApiConfig
    search_terms: SearchTermsConfig
    site_config: SiteConfig


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_pipeline_config(root: Path | None = None) -> PipelineConfig:
    package_root = (root or Path(__file__).resolve().parent).resolve()
    config_dir = package_root / "config"

    terms_raw = _load_json(config_dir / "gu_terms.json")
    sites_raw = _load_json(config_dir / "socal_sites.json")

    search_terms = SearchTermsConfig(
        primary_terms=tuple(terms_raw.get("primary_terms", [])),
        basket_terms=tuple(terms_raw.get("basket_terms", [])),
        match_terms=tuple(terms_raw.get("match_terms", [])),
    )

    institution_groups = {
        key: tuple(value)
        for key, value in sites_raw.get("institution_groups", {}).items()
    }

    site_config = SiteConfig(
        states=tuple(sites_raw.get("states", [])),
        cities=tuple(sites_raw.get("cities", [])),
        facility_keywords=tuple(sites_raw.get("facility_keywords", [])),
        institution_groups=institution_groups,
        pi_aliases=dict(sites_raw.get("pi_aliases", {})),
    )

    return PipelineConfig(
        root=package_root,
        output_dir=package_root / "output",
        api=ApiConfig(),
        search_terms=search_terms,
        site_config=site_config,
    )
