import asyncio
from app.dependencies import get_db, init_db
from src.services.lineage_service import LineageService

async def main():
    await init_db()
    async for db in get_db():
        try:
            res = await LineageService(db).get_ui_lineage_graph()
            import json
            class UUIDEncoder(json.JSONEncoder):
                def default(self, obj):
                    import uuid, datetime
                    if isinstance(obj, uuid.UUID):
                        return str(obj)
                    if isinstance(obj, datetime.datetime):
                        return obj.isoformat()
                    return super().default(obj)
            print(json.dumps(res, cls=UUIDEncoder, indent=2))
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
