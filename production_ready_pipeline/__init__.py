"""Production-ready GU trial pipeline package."""

__all__ = ["run_pipeline", "classify_trial"]


def run_pipeline(*args, **kwargs):
    from .gu_pipeline import run_pipeline as _run_pipeline
    return _run_pipeline(*args, **kwargs)


def classify_trial(*args, **kwargs):
    from .nccn_classifier import classify_trial as _classify_trial
    return _classify_trial(*args, **kwargs)
