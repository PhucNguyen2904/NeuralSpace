from __future__ import annotations

import zipfile

from app.services.parsers.general_dataset_parser import GeneralDatasetParser
from app.services.parsers.yolo_dataset_parser import YoloDatasetParser, extract_zip_safely
from app.services.validators.yolo_dataset_validator import YoloDatasetValidator


def _write_valid_yolo(root):
    dataset = root / "dataset"
    (dataset / "images" / "train").mkdir(parents=True)
    (dataset / "images" / "val").mkdir(parents=True)
    (dataset / "labels" / "train").mkdir(parents=True)
    (dataset / "labels" / "val").mkdir(parents=True)
    (dataset / "data.yaml").write_text(
        "path: .\ntrain: images/train\nval: images/val\nnames:\n  0: person\n  1: helmet\n",
        encoding="utf-8",
    )
    (dataset / "images" / "train" / "a.jpg").write_bytes(b"fake")
    (dataset / "labels" / "train" / "a.txt").write_text("0 0.5 0.5 0.2 0.3\n", encoding="utf-8")
    (dataset / "images" / "val" / "b.jpg").write_bytes(b"fake")
    (dataset / "labels" / "val" / "b.txt").write_text("1 0.4 0.4 0.1 0.1\n", encoding="utf-8")
    return dataset


def test_yolo_parser_and_validator_accept_valid_dataset(tmp_path):
    _write_valid_yolo(tmp_path)

    parsed, validation = YoloDatasetParser().parse(root=tmp_path, filename="sample.zip", size_bytes=123)
    assert parsed is not None
    validation = YoloDatasetValidator().validate(root=tmp_path, parsed=parsed, validation=validation)

    assert validation.status == "passed"
    assert parsed.statistics["image_count"] == 2
    assert parsed.statistics["annotation_count"] == 2
    assert parsed.preview["classes"] == ["person", "helmet"]


def test_yolo_validator_rejects_unknown_class_and_bad_bbox(tmp_path):
    dataset = _write_valid_yolo(tmp_path)
    (dataset / "labels" / "train" / "a.txt").write_text("9 0.5 0.5 1.2 0.3\n", encoding="utf-8")

    parsed, validation = YoloDatasetParser().parse(root=tmp_path, filename="sample.zip", size_bytes=123)
    assert parsed is not None
    validation = YoloDatasetValidator().validate(root=tmp_path, parsed=parsed, validation=validation)

    codes = {issue.code for issue in validation.errors}
    assert "YOLO_UNKNOWN_CLASS_ID" in codes
    assert "YOLO_BBOX_OUT_OF_RANGE" in codes


def test_yolo_parser_requires_data_yaml_fields(tmp_path):
    dataset = _write_valid_yolo(tmp_path)
    (dataset / "data.yaml").write_text("train: images/train\nval: images/val\nnames: [person]\n", encoding="utf-8")

    parsed, validation = YoloDatasetParser().parse(root=tmp_path, filename="sample.zip", size_bytes=123)

    assert parsed is not None
    assert any(issue.code == "YOLO_MISSING_DATA_YAML_FIELD" for issue in validation.errors)


def test_general_csv_parser_detects_schema_and_missing_values(tmp_path):
    path = tmp_path / "customers.csv"
    path.write_text("age,plan,churned\n42,pro,true\n,free,false\n", encoding="utf-8")

    parsed, validation = GeneralDatasetParser().parse(
        path=path,
        filename=path.name,
        size_bytes=path.stat().st_size,
        dataset_type=None,
        task_type="classification",
        label_column="churned",
    )

    assert parsed is not None
    assert validation.status == "passed"
    assert parsed.format == "csv"
    assert parsed.statistics["row_count"] == 2
    assert parsed.statistics["missing_values"]["age"] == 1
    assert [column["name"] for column in parsed.schema_snapshot["columns"]] == ["age", "plan", "churned"]


def test_general_zip_rejects_unsafe_paths(tmp_path):
    path = tmp_path / "bad.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../escape.txt", "nope")

    parsed, validation = GeneralDatasetParser().parse(
        path=path,
        filename=path.name,
        size_bytes=path.stat().st_size,
        dataset_type="custom",
        task_type="custom",
        label_column=None,
    )

    assert parsed is not None
    assert any(issue.code == "ZIP_UNSAFE_PATH" for issue in validation.errors)


def test_general_zip_reads_primary_csv_and_metadata(tmp_path):
    path = tmp_path / "bundle.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("data/customers.csv", "age,plan,churned\n42,pro,true\n31,free,false\n")
        archive.writestr(
            "metadata.json",
            (
                '{"name":"Customer Bundle","version":"v3.0","dataset_type":"tabular",'
                '"task":"classification","item_count":2,"tags":["churn","gold"],'
                '"split_info":{"train":1,"test":1}}'
            ),
        )

    parsed, validation = GeneralDatasetParser().parse(
        path=path,
        filename=path.name,
        size_bytes=path.stat().st_size,
        dataset_type=None,
        task_type=None,
        label_column=None,
    )

    assert validation.status == "passed"
    assert parsed is not None
    assert parsed.name == "Customer Bundle"
    assert parsed.dataset_type == "tabular"
    assert parsed.task_type == "classification"
    assert parsed.item_count == 2
    assert parsed.split_info == {"train": 1, "test": 1}
    assert [column["name"] for column in parsed.schema_snapshot["columns"]] == ["age", "plan", "churned"]
    assert parsed.details["embedded_metadata"]["version"] == "v3.0"


def test_safe_extract_rejects_zip_slip(tmp_path):
    path = tmp_path / "bad.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../escape.txt", "nope")

    validation = extract_zip_safely(path, tmp_path / "out")

    assert any(issue.code == "ZIP_UNSAFE_PATH" for issue in validation.errors)
