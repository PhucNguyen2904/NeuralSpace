"""
Dataset delta service — Compute and apply incremental changes between versions.

Supports two dataset types:
  - ZIP / image archives  : file-level delta (added / modified / removed files)
  - CSV / JSON flat files : row-level delta (added / modified / removed records)

Approach A (simple): server merges delta + base → stores full reconstructed file.
This keeps storage simple while reducing client upload bandwidth.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path
from typing import Any


# ─── Schemas ─────────────────────────────────────────────────────────────────


class DeltaManifest:
    """Describes the changes in a delta package."""

    def __init__(
        self,
        *,
        base_version: str,
        delta_type: str,            # "zip" | "csv" | "json"
        added: list[str],
        modified: list[str],
        removed: list[str],
        renamed: dict[str, str] | None = None,
    ) -> None:
        self.base_version = base_version
        self.delta_type = delta_type
        self.added = added
        self.modified = modified
        self.removed = removed
        self.renamed = renamed or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "base_version": self.base_version,
            "delta_type": self.delta_type,
            "added": self.added,
            "modified": self.modified,
            "removed": self.removed,
            "renamed": self.renamed,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DeltaManifest":
        return cls(
            base_version=str(data.get("base_version", "")),
            delta_type=str(data.get("delta_type", "zip")),
            added=list(data.get("added", [])),
            modified=list(data.get("modified", [])),
            removed=list(data.get("removed", [])),
            renamed=dict(data.get("renamed", {})),
        )


# ─── ZIP delta ───────────────────────────────────────────────────────────────


def _file_md5(data: bytes) -> str:
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def _zip_file_hashes(raw: bytes) -> dict[str, str]:
    """Return {relative_path: md5} for every file inside a ZIP."""
    hashes: dict[str, str] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename.replace("\\", "/")
                hashes[name] = _file_md5(zf.read(info.filename))
    except zipfile.BadZipFile:
        pass
    return hashes


def compute_zip_delta(base_raw: bytes, new_raw: bytes, base_version: str) -> tuple[bytes, DeltaManifest]:
    """
    Compare *new_raw* against *base_raw* (both ZIP files).

    Returns:
        delta_zip  — ZIP containing only the changed/added files + delta_manifest.json
        manifest   — DeltaManifest describing the changes
    """
    base_hashes = _zip_file_hashes(base_raw)
    new_hashes = _zip_file_hashes(new_raw)

    base_hash_to_path: dict[str, str] = {}
    for path, md5 in base_hashes.items():
        base_hash_to_path[md5] = path

    added: list[str] = []
    modified: list[str] = []
    removed: list[str] = sorted(list(set(base_hashes) - set(new_hashes)))
    renamed: dict[str, str] = {}

    for path, md5 in new_hashes.items():
        if path not in base_hashes:
            if md5 in base_hash_to_path:
                renamed[path] = base_hash_to_path[md5]
            else:
                added.append(path)
        elif base_hashes[path] != md5:
            modified.append(path)

    manifest = DeltaManifest(
        base_version=base_version,
        delta_type="zip",
        added=sorted(added),
        modified=sorted(modified),
        removed=removed,
        renamed=renamed,
    )

    # Build the delta ZIP: only changed/added files + manifest
    changed_paths = set(added) | set(modified)
    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(io.BytesIO(new_raw)) as source_zf, zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as delta_zf:
            for info in source_zf.infolist():
                name = info.filename.replace("\\", "/")
                if name in changed_paths:
                    delta_zf.writestr(info, source_zf.read(info.filename))
            delta_zf.writestr("delta_manifest.json", json.dumps(manifest.to_dict(), indent=2))
    except zipfile.BadZipFile as e:
        raise ValueError(f"New file is not a valid ZIP: {e}")

    return buf.getvalue(), manifest



def apply_zip_delta(base_raw: bytes, delta_raw: bytes) -> tuple[bytes, DeltaManifest]:
    """
    Reconstruct the full dataset by applying *delta_raw* on top of *base_raw*.

    Returns:
        merged_zip  — full reconstructed ZIP
        manifest    — DeltaManifest parsed from the delta package
    """
    # Parse manifest from delta ZIP
    manifest_data: dict[str, Any] = {}
    with zipfile.ZipFile(io.BytesIO(delta_raw)) as delta_zf:
        if "delta_manifest.json" in delta_zf.namelist():
            manifest_data = json.loads(delta_zf.read("delta_manifest.json").decode("utf-8"))
    manifest = DeltaManifest.from_dict(manifest_data)

    removed_set = set(manifest.removed)

    buf = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(base_raw)) as base_zf,
        zipfile.ZipFile(io.BytesIO(delta_raw)) as delta_zf,
        zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out_zf,
    ):
        delta_names = {info.filename.replace("\\", "/") for info in delta_zf.infolist() if not info.is_dir()}
        delta_names.discard("delta_manifest.json")

        # Copy base files, skip removed and overridden by delta
        for info in base_zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name in removed_set or name in delta_names:
                continue
            out_zf.writestr(info, base_zf.read(info.filename))
            
        # Apply renames (copy from base_zf with new name)
        for new_name, old_name in manifest.renamed.items():
            try:
                old_info = base_zf.getinfo(old_name)
                # create a new ZipInfo for the new name, keeping other attributes
                new_info = zipfile.ZipInfo(new_name)
                new_info.date_time = old_info.date_time
                new_info.compress_type = old_info.compress_type
                out_zf.writestr(new_info, base_zf.read(old_name))
            except KeyError:
                pass

        # Apply delta (added + modified)
        for info in delta_zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name == "delta_manifest.json":
                continue
            out_zf.writestr(info, delta_zf.read(info.filename))

    return buf.getvalue(), manifest


# ─── CSV delta ───────────────────────────────────────────────────────────────


def _csv_rows(raw: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Return (headers, rows) from CSV bytes."""
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return list(headers), rows


def _rows_to_csv(headers: list[str], rows: list[dict[str, str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def compute_csv_delta(base_raw: bytes, new_raw: bytes, base_version: str) -> tuple[bytes, DeltaManifest]:
    """
    Compute delta between two CSV datasets. Matches rows by order.
    Returns a ZIP with added_rows.csv, modified_rows.csv, and removed_ids.json.
    """
    _, base_rows = _csv_rows(base_raw)
    headers, new_rows = _csv_rows(new_raw)

    added_rows: list[dict[str, str]] = []
    modified_rows: list[dict[str, str]] = []
    removed_ids: list[int] = []

    min_len = min(len(base_rows), len(new_rows))

    for i in range(min_len):
        if base_rows[i] != new_rows[i]:
            mod_row = new_rows[i].copy()
            mod_row["__original_index__"] = str(i)
            modified_rows.append(mod_row)

    if len(new_rows) > len(base_rows):
        added_rows = new_rows[len(base_rows):]
    elif len(base_rows) > len(new_rows):
        removed_ids = list(range(len(new_rows), len(base_rows)))

    manifest = DeltaManifest(
        base_version=base_version,
        delta_type="csv",
        added=[f"{len(added_rows)} rows"],
        modified=[f"{len(modified_rows)} rows"],
        removed=[f"{len(removed_ids)} rows"],
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if added_rows:
            zf.writestr("added_rows.csv", _rows_to_csv(headers, added_rows))
        if modified_rows:
            mod_headers = list(headers)
            if "__original_index__" not in mod_headers:
                mod_headers.append("__original_index__")
            zf.writestr("modified_rows.csv", _rows_to_csv(mod_headers, modified_rows))
        if removed_ids:
            zf.writestr("removed_ids.json", json.dumps(removed_ids))
        zf.writestr("delta_manifest.json", json.dumps(manifest.to_dict(), indent=2))

    return buf.getvalue(), manifest




def apply_csv_delta(base_raw: bytes, delta_raw: bytes, id_column: str = "__row_index__") -> tuple[bytes, DeltaManifest]:
    """
    Apply a CSV delta onto a base CSV.

    The delta ZIP must contain:
      - added_rows.csv    — rows to append
      - modified_rows.csv — rows to update (matched by id_column or row order)
      - removed_ids.json  — list of row indices (0-based) to remove
      - delta_manifest.json
    """
    manifest_data: dict[str, Any] = {}
    added_raw = b""
    modified_raw = b""
    removed_ids: list[int] = []

    with zipfile.ZipFile(io.BytesIO(delta_raw)) as zf:
        names = zf.namelist()
        if "delta_manifest.json" in names:
            manifest_data = json.loads(zf.read("delta_manifest.json").decode("utf-8"))
        if "added_rows.csv" in names:
            added_raw = zf.read("added_rows.csv")
        if "modified_rows.csv" in names:
            modified_raw = zf.read("modified_rows.csv")
        if "removed_ids.json" in names:
            removed_ids = json.loads(zf.read("removed_ids.json").decode("utf-8"))

    manifest = DeltaManifest.from_dict(manifest_data)

    headers, base_rows = _csv_rows(base_raw)

    # Apply removals (descending order to keep indices stable)
    for idx in sorted(removed_ids, reverse=True):
        if 0 <= idx < len(base_rows):
            base_rows.pop(idx)

    # Apply modifications: for simplicity match by position
    if modified_raw:
        _, modified_rows = _csv_rows(modified_raw)
        # modified_rows.csv should contain the full updated rows in order
        # We use the row index embedded in a special column if available
        for mod_row in modified_rows:
            row_idx_str = mod_row.pop("__original_index__", None)
            if row_idx_str is not None and str(row_idx_str).isdigit():
                idx = int(row_idx_str)
                if 0 <= idx < len(base_rows):
                    base_rows[idx].update(mod_row)
            else:
                # Fallback: append as new row if no index
                base_rows.append(mod_row)
            # Ensure headers include any new columns
            for k in mod_row:
                if k not in headers:
                    headers.append(k)

    # Apply additions
    if added_raw:
        add_headers, add_rows = _csv_rows(added_raw)
        for k in add_headers:
            if k not in headers:
                headers.append(k)
        base_rows.extend(add_rows)

    merged_bytes = _rows_to_csv(headers, base_rows)
    manifest.added = [str(len(added_raw)) + " bytes added"]
    return merged_bytes, manifest


# ─── JSON delta ──────────────────────────────────────────────────────────────


def compute_json_delta(base_raw: bytes, new_raw: bytes, base_version: str) -> tuple[bytes, DeltaManifest]:
    """
    Compute delta between two JSON arrays. Matches records by order.
    Returns a ZIP with added_records.json, removed_ids.json, and delta_manifest.json.
    (Note: modified records are represented as removal + addition).
    """
    base_data = json.loads(base_raw.decode("utf-8"))
    if not isinstance(base_data, list):
        base_data = [base_data]
    new_data = json.loads(new_raw.decode("utf-8"))
    if not isinstance(new_data, list):
        new_data = [new_data]

    added_records: list[Any] = []
    removed_ids: list[int] = []

    min_len = min(len(base_data), len(new_data))
    for i in range(min_len):
        if base_data[i] != new_data[i]:
            removed_ids.append(i)
            added_records.append(new_data[i])

    if len(new_data) > len(base_data):
        added_records.extend(new_data[len(base_data):])
    elif len(base_data) > len(new_data):
        removed_ids.extend(range(len(new_data), len(base_data)))

    manifest = DeltaManifest(
        base_version=base_version,
        delta_type="json",
        added=[f"{len(added_records)} records"],
        modified=[],
        removed=[f"{len(removed_ids)} records"],
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if added_records:
            zf.writestr("added_records.json", json.dumps(added_records))
        if removed_ids:
            zf.writestr("removed_ids.json", json.dumps(removed_ids))
        zf.writestr("delta_manifest.json", json.dumps(manifest.to_dict(), indent=2))

    return buf.getvalue(), manifest


def apply_json_delta(base_raw: bytes, delta_raw: bytes) -> tuple[bytes, DeltaManifest]:
    """
    Apply a JSON array delta onto a base JSON array.

    The delta ZIP must contain:
      - added_records.json   — list of new records
      - removed_ids.json     — list of 0-based indices to remove
      - delta_manifest.json
    """
    manifest_data: dict[str, Any] = {}
    added_records: list[Any] = []
    removed_ids: list[int] = []

    with zipfile.ZipFile(io.BytesIO(delta_raw)) as zf:
        names = zf.namelist()
        if "delta_manifest.json" in names:
            manifest_data = json.loads(zf.read("delta_manifest.json").decode("utf-8"))
        if "added_records.json" in names:
            added_records = json.loads(zf.read("added_records.json").decode("utf-8"))
        if "removed_ids.json" in names:
            removed_ids = json.loads(zf.read("removed_ids.json").decode("utf-8"))

    manifest = DeltaManifest.from_dict(manifest_data)

    base_data = json.loads(base_raw.decode("utf-8"))
    if not isinstance(base_data, list):
        # Wrap non-array JSON in a list
        base_data = [base_data]

    for idx in sorted(removed_ids, reverse=True):
        if 0 <= idx < len(base_data):
            base_data.pop(idx)

    base_data.extend(added_records)
    merged_bytes = json.dumps(base_data, ensure_ascii=False, indent=2).encode("utf-8")
    return merged_bytes, manifest


# ─── Unified entry point ─────────────────────────────────────────────────────


def apply_delta(base_raw: bytes, delta_raw: bytes, delta_type: str) -> tuple[bytes, DeltaManifest]:
    """
    Apply a delta package to a base dataset file.

    Args:
        base_raw    — full bytes of the base version file
        delta_raw   — delta package bytes (always a ZIP)
        delta_type  — "zip" | "csv" | "json"

    Returns:
        (merged_bytes, manifest)
    """
    if delta_type == "csv":
        return apply_csv_delta(base_raw, delta_raw)
    if delta_type == "json":
        return apply_json_delta(base_raw, delta_raw)
    # Default: ZIP / image datasets
    return apply_zip_delta(base_raw, delta_raw)


def detect_delta_type(filename: str) -> str:
    """Detect delta type from the *base* file's filename."""
    lower = filename.lower()
    if lower.endswith(".csv"):
        return "csv"
    if lower.endswith(".json") or lower.endswith(".jsonl"):
        return "json"
    return "zip"
