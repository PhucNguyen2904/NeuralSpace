import asyncio
from app.db.session import async_session
from app.models.mlops_tracking import DatasetVersion
from sqlalchemy import select

async def main():
    async with async_session() as session:
        result = await session.execute(select(DatasetVersion).order_by(DatasetVersion.created_at.desc()).limit(1))
        row = result.scalar_one_or_none()
        if row:
            print(f"Version: {row.version}")
            print(f"Metadata URI: {row.metadata_uri}")
            print(f"Validation Report URI: {row.validation_report_uri}")
            print(f"Format: {row.format}")
            print(f"Task: {row.task_type}")
            print(f"Item Count: {row.item_count}")
        else:
            print("No rows found")

asyncio.run(main())
