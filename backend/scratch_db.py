import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

async def main():
    engine = create_async_engine("postgresql+asyncpg://postgres:postgres@localhost:5432/neuralspace")
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        result = await session.execute(text("SELECT id, dataset_id, version, metadata_uri, validation_report_uri, item_count, format, task_type FROM mlops.dataset_versions ORDER BY created_at DESC LIMIT 3"))
        rows = result.fetchall()
        for row in rows:
            print(dict(row._mapping))
            
asyncio.run(main())
