from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd


def _load_schema(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))


def validate_dataframe(df: pd.DataFrame, schema: dict, previous_size_bytes: int | None) -> dict:
    report: dict = {
        "rows": int(len(df)),
        "columns": list(df.columns),
        "schema_valid": True,
        "quality_checks": {},
        "size_change_ok": True,
    }

    expected_cols = schema.get("columns", [])
    if expected_cols:
        missing = [c for c in expected_cols if c not in df.columns]
        report["missing_columns"] = missing
        report["schema_valid"] = not missing

    expected_types = schema.get("types", {})
    type_mismatch = {}
    for col, expected in expected_types.items():
        if col not in df.columns:
            continue
        actual = str(df[col].dtype)
        if expected not in actual:
            type_mismatch[col] = {"expected": expected, "actual": actual}
    report["type_mismatch"] = type_mismatch
    if type_mismatch:
        report["schema_valid"] = False

    null_pct = df.isnull().mean().to_dict()
    report["quality_checks"]["null_pct"] = {k: float(v) for k, v in null_pct.items()}

    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    outliers = {}
    for c in numeric_cols:
        series = df[c].dropna()
        if series.empty:
            outliers[c] = 0.0
            continue
        q1 = np.percentile(series, 25)
        q3 = np.percentile(series, 75)
        iqr = q3 - q1
        lo = q1 - 1.5 * iqr
        hi = q3 + 1.5 * iqr
        ratio = float(((series < lo) | (series > hi)).mean())
        outliers[c] = ratio
    report["quality_checks"]["outlier_ratio"] = outliers

    class_distribution = {}
    target_col = schema.get("target_column")
    if target_col and target_col in df.columns:
        class_distribution = {str(k): float(v) for k, v in (df[target_col].value_counts(normalize=True).to_dict()).items()}
    report["quality_checks"]["class_distribution"] = class_distribution

    if previous_size_bytes and previous_size_bytes > 0:
        current_bytes = int(df.memory_usage(deep=True).sum())
        drop_ratio = (previous_size_bytes - current_bytes) / previous_size_bytes
        report["size_drop_ratio"] = float(drop_ratio)
        report["size_change_ok"] = drop_ratio <= 0.20

    # simplistic quality score
    null_penalty = min(1.0, float(np.mean(list(null_pct.values()))) if null_pct else 0.0)
    outlier_penalty = min(1.0, float(np.mean(list(outliers.values()))) if outliers else 0.0)
    schema_penalty = 0.0 if report["schema_valid"] else 0.3
    size_penalty = 0.0 if report["size_change_ok"] else 0.3
    score = max(0.0, 1.0 - (0.4 * null_penalty + 0.2 * outlier_penalty + schema_penalty + size_penalty))
    report["quality_score"] = round(score, 6)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--schema-config', required=True)
    parser.add_argument('--output', default='validation_report.json')
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    schema = _load_schema(Path(args.schema_config))
    previous_size = None
    prev = schema.get("previous_size_bytes")
    if prev is not None:
        previous_size = int(prev)

    report = validate_dataframe(df, schema, previous_size)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    threshold = float(os.environ.get('QUALITY_THRESHOLD', '0.8'))
    if report["quality_score"] < threshold:
        raise SystemExit(f"Quality score {report['quality_score']} < threshold {threshold}")


if __name__ == '__main__':
    main()
