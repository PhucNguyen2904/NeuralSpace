import asyncio
import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.models.mlops_tracking import DatasetVersion
import uuid

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/cloud_ide')
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    metadata = {
        "storage": {
            "metadata_uri": "s3://test/metadata.json"
        }
    }
    
    async with async_session() as session:
        result = await session.execute(text("SELECT id FROM mlops.datasets LIMIT 1"))
        ds_id = result.scalar()
        
        dv = DatasetVersion(
            id=str(uuid.uuid4()),
            dataset_id=ds_id,
            version="v99.0",
            created_by="00000000-0000-0000-0000-000000000000",
            metadata_uri=metadata.get("storage", {}).get("metadata_uri"),
            validation_report_uri=metadata.get("storage", {}).get("validation_report_uri"),
            metadata_snapshot=metadata,
            status="validated"
        )
        session.add(dv)
        await session.commit()
        await session.refresh(dv)
        
        print(f"DB Output: metadata_uri={dv.metadata_uri}, validation_report_uri={dv.validation_report_uri}")

asyncio.run(main())
