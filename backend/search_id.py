import asyncio
from sqlalchemy import create_engine, MetaData, text

engine = create_engine('postgresql://postgres:postgres@localhost:5432/cloud_ide')
metadata = MetaData()
metadata.reflect(bind=engine)

for table in metadata.tables.values():
    for column in table.columns:
        if str(column.type) in ['UUID', 'VARCHAR', 'TEXT']:
            try:
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT 1 FROM {table.name} WHERE {column.name}::text LIKE '%ff6a9324%' LIMIT 1")).scalar()
                    if result:
                        print(f"Found in {table.name}.{column.name}")
            except Exception as e:
                pass
