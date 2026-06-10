-- Idempotent lineage seed from MinIO-backed datasets and existing model versions.

with selected_user as (
    select id
    from users
    order by case when email = 'tester@collabclone.local' then 0 else 1 end, created_at
    limit 1
),
dataset_source as (
    select * from (
        values
            ('ds_001', 'Iris Sample Dataset', 'Iris sample CSV migrated from MinIO.', 'tabular', 104857600, 150, 'migration/server/datasets/ds_001/iris_sample.csv', '["tabular", "classification", "migration"]'::jsonb),
            ('ds_002', 'YOLOv8 Custom Dataset', 'Object detection sample dataset migrated from MinIO.', 'image', 52428800, 5000, 'migration/server/datasets/ds_002/sample.csv', '["vision", "object-detection", "migration"]'::jsonb),
            ('ds_003', 'Sentiment Tweets Dataset', 'Text classification sample dataset migrated from MinIO.', 'text', 18874368, 25000, 'migration/server/datasets/ds_003/tweets_sample.txt', '["nlp", "sentiment", "migration"]'::jsonb),
            ('ds_004', 'Audio Manifest Dataset', 'Audio manifest sample dataset migrated from MinIO.', 'audio', 73400320, 1200, 'migration/server/datasets/ds_004/audio_manifest.csv', '["audio", "manifest", "migration"]'::jsonb),
            ('ds_005', 'Video Manifest Dataset', 'Video manifest sample dataset migrated from MinIO.', 'video', 188743680, 320, 'migration/server/datasets/ds_005/video_manifest.csv', '["video", "manifest", "migration"]'::jsonb),
            ('iris_dataset', 'Iris Dataset', 'Classic Iris CSV dataset migrated from MinIO.', 'tabular', 16384, 150, 'migration/server/datasets/iris_dataset/iris.csv', '["tabular", "classification", "iris"]'::jsonb),
            ('coco_2017_detection', 'COCO 2017 Detection Sample', 'COCO detection sample files migrated from MinIO.', 'image', 3221225472, 120000, 'migration/server/datasets/coco_2017_detection/sample_0001.jpg', '["vision", "detection", "coco"]'::jsonb)
    ) as item(slug, name, description, dataset_type, size_bytes, item_count, storage_path, tags)
),
upserted_datasets as (
    insert into mlops.datasets (
        id,
        name,
        description,
        type,
        owner_id,
        storage_path,
        tags,
        status,
        created_at,
        updated_at
    )
    select
        (
            substr(md5('mlops-dataset:' || ds.slug), 1, 8) || '-' ||
            substr(md5('mlops-dataset:' || ds.slug), 9, 4) || '-' ||
            substr(md5('mlops-dataset:' || ds.slug), 13, 4) || '-' ||
            substr(md5('mlops-dataset:' || ds.slug), 17, 4) || '-' ||
            substr(md5('mlops-dataset:' || ds.slug), 21, 12)
        )::uuid,
        ds.name,
        ds.description,
        ds.dataset_type::mlops_dataset_type,
        selected_user.id,
        ds.storage_path,
        ds.tags,
        'active',
        now(),
        now()
    from dataset_source ds
    cross join selected_user
    on conflict (name) do update set
        description = excluded.description,
        type = excluded.type,
        storage_path = excluded.storage_path,
        tags = excluded.tags,
        status = excluded.status,
        updated_at = now()
    returning id, name, storage_path
),
dataset_versions as (
    insert into mlops.dataset_versions (
        id,
        dataset_id,
        version,
        dvc_md5,
        dvc_commit,
        git_tag,
        size_bytes,
        item_count,
        schema_snapshot,
        split_info,
        storage_path,
        created_by,
        created_at,
        changelog,
        is_latest,
        status
    )
    select
        (
            substr(md5('mlops-dataset-version:' || uds.name || ':v1.0'), 1, 8) || '-' ||
            substr(md5('mlops-dataset-version:' || uds.name || ':v1.0'), 9, 4) || '-' ||
            substr(md5('mlops-dataset-version:' || uds.name || ':v1.0'), 13, 4) || '-' ||
            substr(md5('mlops-dataset-version:' || uds.name || ':v1.0'), 17, 4) || '-' ||
            substr(md5('mlops-dataset-version:' || uds.name || ':v1.0'), 21, 12)
        )::uuid,
        uds.id,
        'v1.0',
        substr(md5(uds.storage_path), 1, 32),
        substr(md5(uds.name || ':commit'), 1, 40),
        lower(replace(uds.name, ' ', '-')) || '-v1.0',
        ds.size_bytes,
        ds.item_count,
        jsonb_build_object('source', 'minio', 'path', uds.storage_path),
        '{"train": 80, "val": 10, "test": 10}'::jsonb,
        uds.storage_path,
        selected_user.id,
        now(),
        'Seeded from MinIO-backed dataset metadata',
        true,
        'validated'
    from upserted_datasets uds
    join dataset_source ds on ds.name = uds.name
    cross join selected_user
    on conflict (dataset_id, version) do update set
        dvc_md5 = excluded.dvc_md5,
        dvc_commit = excluded.dvc_commit,
        git_tag = excluded.git_tag,
        size_bytes = excluded.size_bytes,
        item_count = excluded.item_count,
        schema_snapshot = excluded.schema_snapshot,
        split_info = excluded.split_info,
        storage_path = excluded.storage_path,
        is_latest = excluded.is_latest,
        status = excluded.status
    returning id, dataset_id
),
target_links as (
    select
        mv.id as model_version_id,
        dv.id as dataset_version_id,
        mv.created_by
    from mlops.model_versions mv
    join mlops.datasets d on d.name = case
        when mv.mlflow_name ilike '%bert%' then 'Sentiment Tweets Dataset'
        when mv.mlflow_name ilike '%xgboost%' then 'Iris Dataset'
        when mv.mlflow_name ilike '%unet%' then 'COCO 2017 Detection Sample'
        when mv.mlflow_name ilike '%yolo%' then 'YOLOv8 Custom Dataset'
        else 'COCO 2017 Detection Sample'
    end
    join mlops.dataset_versions dv on dv.dataset_id = d.id and dv.version = 'v1.0'
)
insert into mlops.model_dataset_links (
    id,
    model_version_id,
    dataset_version_id,
    link_type,
    created_at,
    created_by,
    notes
)
select
    (
        substr(md5('model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 1, 8) || '-' ||
        substr(md5('model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 9, 4) || '-' ||
        substr(md5('model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 13, 4) || '-' ||
        substr(md5('model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 17, 4) || '-' ||
        substr(md5('model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 21, 12)
    )::uuid,
    model_version_id,
    dataset_version_id,
    'train',
    now(),
    created_by,
    'Seeded from existing model registry metadata and MinIO datasets'
from target_links
on conflict (model_version_id, dataset_version_id, link_type) do update set
    notes = excluded.notes;

with supplementary_links as (
    select
        mv.id as model_version_id,
        dv.id as dataset_version_id,
        case
            when d.name = 'Iris Sample Dataset' then 'eval'
            when d.name = 'YOLOv8 Custom Dataset' then 'eval'
            else 'test'
        end as link_type,
        mv.created_by,
        d.name as dataset_name
    from mlops.model_versions mv
    join mlops.datasets d on d.name = case
        when mv.mlflow_name ilike '%bert%' and mv.mlflow_version = 3 then 'Sentiment Tweets Dataset'
        when mv.mlflow_name ilike '%xgboost%' and mv.mlflow_version in (2, 3) then 'Iris Sample Dataset'
        when mv.mlflow_name ilike '%unet%' and mv.mlflow_version in (2, 3) then 'YOLOv8 Custom Dataset'
        when mv.mlflow_name ilike '%resnet%' and mv.mlflow_version in (2, 3) then 'COCO 2017 Detection'
        else null
    end
    join mlops.dataset_versions dv on dv.dataset_id = d.id and dv.version = 'v1.0'
)
insert into mlops.model_dataset_links (
    id,
    model_version_id,
    dataset_version_id,
    link_type,
    created_at,
    created_by,
    notes
)
select
    (
        substr(md5('supplementary-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text || ':' || link_type), 1, 8) || '-' ||
        substr(md5('supplementary-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text || ':' || link_type), 9, 4) || '-' ||
        substr(md5('supplementary-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text || ':' || link_type), 13, 4) || '-' ||
        substr(md5('supplementary-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text || ':' || link_type), 17, 4) || '-' ||
        substr(md5('supplementary-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text || ':' || link_type), 21, 12)
    )::uuid,
    model_version_id,
    dataset_version_id,
    link_type::mlops_link_type,
    now(),
    created_by,
    'Supplementary lineage link using existing dataset/model assets: ' || dataset_name
from supplementary_links
on conflict (model_version_id, dataset_version_id, link_type) do update set
    notes = excluded.notes;

update mlops.runs r
set dvc_dataset_version_id = links.dataset_version_id,
    dvc_md5 = dv.dvc_md5
from (
    select distinct mv.run_id, mdl.dataset_version_id
    from mlops.model_versions mv
    join mlops.model_dataset_links mdl on mdl.model_version_id = mv.id
    where mdl.link_type = 'train'
) links
join mlops.dataset_versions dv on dv.id = links.dataset_version_id
where r.id = links.run_id;
