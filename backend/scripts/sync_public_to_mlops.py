from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        user_id = (
            await conn.execute(
                text("select id from public.users order by created_at asc limit 1")
            )
        ).scalar_one()

        await conn.execute(text("truncate table mlops.model_dataset_links cascade"))
        await conn.execute(text("truncate table mlops.approval_requests cascade"))
        await conn.execute(text("truncate table mlops.audit_logs cascade"))
        await conn.execute(text("truncate table mlops.model_versions cascade"))
        await conn.execute(text("truncate table mlops.runs cascade"))
        await conn.execute(text("truncate table mlops.experiments cascade"))
        await conn.execute(text("truncate table mlops.dataset_versions cascade"))
        await conn.execute(text("truncate table mlops.datasets cascade"))

        public_datasets = (
            await conn.execute(
                text(
                    """
                    select id,name,description,dataset_type,status,size_bytes,item_count,tags,storage_path,created_at,updated_at
                    from public.datasets
                    order by created_at asc
                    """
                )
            )
        ).mappings().all()

        ds_map: dict[str, str] = {}
        for row in public_datasets:
            ds_id = str(uuid4())
            ds_map[row["id"]] = ds_id
            ds_type = row["dataset_type"] if row["dataset_type"] in {"image", "tabular", "text", "audio", "video"} else "tabular"
            ds_status = "active" if row["status"] in {"ready", "active"} else "archived"
            await conn.execute(
                text(
                    """
                    insert into mlops.datasets (id,name,description,type,owner_id,team_id,dvc_repo_url,storage_path,tags,status,created_at,updated_at)
                    values (:id,:name,:description,:type,:owner_id,null,null,:storage_path,cast(:tags as jsonb),:status,:created_at,:updated_at)
                    """
                ),
                {
                    "id": ds_id,
                    "name": row["name"],
                    "description": row["description"],
                    "type": ds_type,
                    "owner_id": user_id,
                    "storage_path": row["storage_path"] or f"datasets/{row['id']}",
                    "tags": str(row["tags"] or []).replace("'", '"'),
                    "status": ds_status,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            )
            await conn.execute(
                text(
                    """
                    insert into mlops.dataset_versions
                    (id,dataset_id,version,dvc_md5,dvc_commit,git_tag,size_bytes,item_count,schema_snapshot,split_info,storage_path,created_by,created_at,changelog,is_latest,status)
                    values
                    (:id,:dataset_id,:version,:dvc_md5,:dvc_commit,null,:size_bytes,:item_count,cast(:schema_snapshot as jsonb),cast(:split_info as jsonb),:storage_path,:created_by,:created_at,:changelog,true,'validated')
                    """
                ),
                {
                    "id": str(uuid4()),
                    "dataset_id": ds_id,
                    "version": "v1.0",
                    "dvc_md5": uuid4().hex[:12],
                    "dvc_commit": uuid4().hex[:12],
                    "size_bytes": int(row["size_bytes"] or 0),
                    "item_count": int(row["item_count"] or 0),
                    "schema_snapshot": '{"columns":["feature","label"]}',
                    "split_info": '{"train":80,"val":10,"test":10}',
                    "storage_path": row["storage_path"] or f"datasets/{row['id']}",
                    "created_by": user_id,
                    "created_at": row["created_at"],
                    "changelog": "Initial sync from public.datasets",
                },
            )

        exp_id = str(uuid4())
        await conn.execute(
            text(
                """
                insert into mlops.experiments (id,mlflow_experiment_id,name,description,owner_id,team_id,tags,artifact_location,lifecycle_stage,created_at,updated_at)
                values (:id,1,'Legacy Synced Models','Auto generated from public.models',:owner_id,null,'{}','s3://mlflow-artifacts/legacy','active',:now,:now)
                """
            ),
            {"id": exp_id, "owner_id": user_id, "now": datetime.now(timezone.utc)},
        )

        public_models = (
            await conn.execute(
                text(
                    """
                    select id,name,framework,task_type,size_bytes,all_metrics,status,created_at,updated_at
                    from public.models
                    order by created_at asc
                    """
                )
            )
        ).mappings().all()

        first_dataset_version_id = (
            await conn.execute(text("select id from mlops.dataset_versions order by created_at asc limit 1"))
        ).scalar_one_or_none()

        for index, row in enumerate(public_models, start=1):
            run_id = str(uuid4())
            await conn.execute(
                text(
                    """
                    insert into mlops.runs
                    (id,mlflow_run_id,experiment_id,name,status,start_time,end_time,artifact_uri,source_type,source_name,git_commit,user_id,metrics_snapshot,params_snapshot,tags_snapshot,dvc_dataset_version_id,dvc_md5,created_at)
                    values
                    (:id,:mlflow_run_id,:experiment_id,:name,:status,:start_time,:end_time,:artifact_uri,'PROJECT','legacy-sync',:git_commit,:user_id,cast(:metrics as jsonb),'{}','{}',:dataset_version_id,:dvc_md5,:created_at)
                    """
                ),
                {
                    "id": run_id,
                    "mlflow_run_id": f"legacy_run_{index}",
                    "experiment_id": exp_id,
                    "name": f"{row['name']}-run",
                    "status": "FINISHED",
                    "start_time": row["created_at"],
                    "end_time": row["updated_at"],
                    "artifact_uri": "s3://mlflow-artifacts/legacy",
                    "git_commit": uuid4().hex[:7],
                    "user_id": user_id,
                    "metrics": str(row["all_metrics"] or {}).replace("'", '"'),
                    "dataset_version_id": first_dataset_version_id,
                    "dvc_md5": uuid4().hex[:12],
                    "created_at": row["created_at"],
                },
            )
            await conn.execute(
                text(
                    """
                    insert into mlops.model_versions
                    (id,mlflow_name,mlflow_version,run_id,description,stage,status,source,framework,task_type,size_bytes,metrics,tags,approved_by,approved_at,created_by,created_at,updated_at)
                    values
                    (:id,:name,:version,:run_id,'Synced from public.models',:stage,'READY','legacy-sync',:framework,:task_type,:size_bytes,cast(:metrics as jsonb),'{}',:approved_by,:approved_at,:created_by,:created_at,:updated_at)
                    """
                ),
                {
                    "id": str(uuid4()),
                    "name": row["name"],
                    "version": 1,
                    "run_id": run_id,
                    "stage": "Production" if index == 1 else "Archived",
                    "framework": row["framework"] or "unknown",
                    "task_type": row["task_type"] or "unknown",
                    "size_bytes": int(row["size_bytes"] or 0),
                    "metrics": str(row["all_metrics"] or {}).replace("'", '"'),
                    "approved_by": user_id if index == 1 else None,
                    "approved_at": datetime.now(timezone.utc) if index == 1 else None,
                    "created_by": user_id,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            )

    await engine.dispose()
    print("Sync public -> mlops completed.")


if __name__ == "__main__":
    asyncio.run(main())
