"""Tests for baseline batch pipeline (3 providers × N files)."""
from baseline_comparison.batch_pipeline import (
    BaselineBatchConfig,
    _tasks_from_records,
    default_models_by_provider,
)


def test_default_models_match_research_chain():
    models = default_models_by_provider()
    assert "openai" in models
    assert "google" in models
    assert "anthropic" in models
    assert models["openai"].startswith("openai/")


def test_tasks_from_records_three_providers():
    records = [{"file_path": "a.java", "sample_id": "s1", "project_name": "P"}]
    tasks = _tasks_from_records(records, ["openai", "google", "anthropic"])
    assert len(tasks) == 3
    providers = {t[1] for t in tasks}
    assert providers == {"openai", "google", "anthropic"}


def test_full_batch_requires_confirm():
    import asyncio

    from baseline_comparison.batch_pipeline import BaselineBatchConfig, run_baseline_batch_pipeline

    cfg = BaselineBatchConfig(limit=None, dry_run=False, confirm_execute=False)
    summary = asyncio.run(
        run_baseline_batch_pipeline(cfg, backend_base="http://127.0.0.1:9999")
    )
    assert any("confirmExecute" in w for w in summary.warnings)
