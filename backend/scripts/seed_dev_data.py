"""Seed development data for workspace tables."""

from __future__ import annotations

import asyncio
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.dataset import Dataset


async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    user_1 = str(uuid4())
    user_2 = str(uuid4())
    async with session_maker() as session:
        dataset_samples = [
            Dataset(
                id="ds_001",
                name="Iris Sample Dataset",
                description="Iris sample CSV migrated from the legacy workspace storage.",
                dataset_type="tabular",
                status="ready",
                size_bytes=104_857_600,
                item_count=150,
                label_status="labeled",
                tags=["tabular", "classification", "migration"],
                storage_path="migration/server/datasets/ds_001/iris_sample.csv",
                created_by="migration",
                source_payload={"class_count": 3},
            ),
            Dataset(
                id="ds_002",
                name="YOLOv8 Custom Dataset",
                description="Object detection sample dataset migrated from MinIO.",
                dataset_type="image",
                status="ready",
                size_bytes=52_428_800,
                item_count=5_000,
                label_status="labeled",
                tags=["vision", "object-detection", "migration"],
                storage_path="migration/server/datasets/ds_002/sample.csv",
                created_by="migration",
                source_payload={"class_count": 8},
            ),
            Dataset(
                id="ds_003",
                name="Sentiment Tweets Dataset",
                description="Text classification sample dataset migrated from MinIO.",
                dataset_type="text",
                status="ready",
                size_bytes=18_874_368,
                item_count=25_000,
                label_status="labeled",
                tags=["nlp", "sentiment", "migration"],
                storage_path="migration/server/datasets/ds_003/tweets_sample.txt",
                created_by="migration",
                source_payload={"class_count": 3},
            ),
            Dataset(
                id="ds_004",
                name="Audio Manifest Dataset",
                description="Audio manifest sample dataset migrated from MinIO.",
                dataset_type="audio",
                status="ready",
                size_bytes=73_400_320,
                item_count=1_200,
                label_status="processing",
                tags=["audio", "manifest", "migration"],
                storage_path="migration/server/datasets/ds_004/audio_manifest.csv",
                created_by="migration",
                source_payload={"class_count": 10},
            ),
            Dataset(
                id="ds_005",
                name="Video Manifest Dataset",
                description="Video manifest sample dataset migrated from MinIO.",
                dataset_type="video",
                status="ready",
                size_bytes=188_743_680,
                item_count=320,
                label_status="processing",
                tags=["video", "manifest", "migration"],
                storage_path="migration/server/datasets/ds_005/video_manifest.csv",
                created_by="migration",
                source_payload={"class_count": 6},
            ),
            Dataset(
                id="iris_dataset",
                name="Iris Dataset",
                description="Classic Iris CSV dataset migrated from MinIO.",
                dataset_type="tabular",
                status="ready",
                size_bytes=16_384,
                item_count=150,
                label_status="labeled",
                tags=["tabular", "classification", "iris"],
                storage_path="migration/server/datasets/iris_dataset/iris.csv",
                created_by="migration",
                source_payload={"class_count": 3},
            ),
            Dataset(
                id="coco_2017_detection",
                name="COCO 2017 Detection Sample",
                description="COCO detection sample files migrated from MinIO.",
                dataset_type="image",
                status="ready",
                size_bytes=3_221_225_472,
                item_count=120_000,
                label_status="labeled",
                tags=["vision", "detection", "coco"],
                storage_path="migration/server/datasets/coco_2017_detection/sample_0001.jpg",
                created_by="migration",
                source_payload={"class_count": 80},
            ),
        ]

        for dataset in dataset_samples:
            await session.merge(dataset)

        # Skipped workspace insertions to avoid foreign key violation
        # ws1 = Workspace(...)
        # session.add_all([ws1, ws2])
        # await session.flush()
        # session.add_all([WorkspaceEvent(...)])
        await session.commit()

    await engine.dispose()
    print("Seed completed.")
    print(f"Demo user IDs: {user_1}, {user_2}")


if __name__ == "__main__":
    asyncio.run(seed())
