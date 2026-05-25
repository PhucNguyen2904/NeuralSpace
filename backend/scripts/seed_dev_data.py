"""Seed development data for workspace tables."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.dataset import Dataset
from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEvent, WorkspaceEventType


async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    user_1 = str(uuid4())
    user_2 = str(uuid4())
    now = datetime.now(timezone.utc)

    async with session_maker() as session:
        existing_datasets = {
            row[0]
            for row in (
                await session.execute(
                    Dataset.__table__.select().with_only_columns(Dataset.id)
                )
            ).all()
        }
        dataset_samples = [
            Dataset(
                id="dataset_sales_2026",
                name="Sales Forecast 2026",
                description="Daily sales records across 12 regions for forecasting experiments.",
                dataset_type="tabular",
                status="ready",
                size_bytes=148_000_000,
                item_count=1_250_000,
                label_status="labeled",
                tags=["finance", "forecasting", "time-series"],
                storage_path="/datasets/sales_2026",
                created_by="seed-script",
                source_payload={"class_count": None},
            ),
            Dataset(
                id="imagenet_subset",
                name="ImageNet Subset",
                description="Curated subset of ImageNet for transfer learning demos.",
                dataset_type="image",
                status="ready",
                size_bytes=3_221_225_472,
                item_count=120_000,
                label_status="labeled",
                tags=["vision", "classification"],
                storage_path="/datasets/imagenet_subset",
                created_by="seed-script",
                source_payload={"class_count": 1000},
            ),
            Dataset(
                id="dataset_customer_churn",
                name="Customer Churn Analytics",
                description="Structured customer behavior logs with churn outcome labels.",
                dataset_type="tabular",
                status="ready",
                size_bytes=84_200_120,
                item_count=600_000,
                label_status="labeled",
                tags=["churn", "classification", "crm"],
                storage_path="/datasets/customer_churn",
                created_by="seed-script",
                source_payload={"class_count": 2},
            ),
            Dataset(
                id="dataset_support_tickets",
                name="Support Ticket Corpus",
                description="Vietnamese and English support tickets for text classification.",
                dataset_type="text",
                status="ready",
                size_bytes=22_401_773,
                item_count=220_000,
                label_status="processing",
                tags=["nlp", "multilingual", "ticketing"],
                storage_path="/datasets/support_tickets",
                created_by="seed-script",
                source_payload={"class_count": 12},
            ),
        ]

        session.add_all([d for d in dataset_samples if d.id not in existing_datasets])

        ws1 = Workspace(
            user_id=user_1,
            name="ML Experiment A",
            status=WorkspaceStatus.RUNNING,
            tier="cpu-standard",
            k8s_namespace="ws-demo001",
            k8s_pod_name="jupyter-demo001",
            pod_ip="10.42.0.21",
            access_url="https://ide.local/ws-demo001",
            dataset_ids=["dataset_sales_2026"],
            model_ids=["model_xgb_v2"],
            environment_config={"python_version": "3.11", "extra_packages": ["pandas", "numpy"]},
            resource_config={"cpu_limit": "2", "memory_limit": "4Gi"},
            started_at=now - timedelta(minutes=15),
            last_heartbeat=now - timedelta(seconds=10),
            last_kernel_activity=now - timedelta(minutes=2),
            auto_kill_at=now + timedelta(minutes=25),
        )
        ws2 = Workspace(
            user_id=user_2,
            name="GPU Training",
            status=WorkspaceStatus.PROVISIONING,
            tier="gpu-t4",
            dataset_ids=["imagenet_subset"],
            model_ids=["resnet50_trial"],
            environment_config={"python_version": "3.12", "extra_packages": ["torch", "torchvision"]},
            resource_config={"cpu_limit": "4", "memory_limit": "16Gi", "gpu_limit": "1"},
        )
        session.add_all([ws1, ws2])
        await session.flush()

        session.add_all(
            [
                WorkspaceEvent(
                    workspace_id=ws1.id,
                    event_type=WorkspaceEventType.START_REQUESTED.value,
                    actor=f"user:{user_1}",
                    details={"source": "api"},
                ),
                WorkspaceEvent(
                    workspace_id=ws1.id,
                    event_type=WorkspaceEventType.RUNNING.value,
                    actor="system",
                    details={"pod_ready": True},
                ),
                WorkspaceEvent(
                    workspace_id=ws2.id,
                    event_type=WorkspaceEventType.PROVISIONING.value,
                    actor="system",
                    details={"node_pool": "gpu-pool"},
                ),
            ]
        )
        await session.commit()

    await engine.dispose()
    print("Seed completed.")
    print(f"Demo user IDs: {user_1}, {user_2}")


if __name__ == "__main__":
    asyncio.run(seed())
