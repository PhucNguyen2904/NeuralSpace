-- Idempotent demo seed for MLflow-like experiment pages.
-- Safe to run multiple times against the local development database.

with demo_models as (
    select
        'model_resnet50_custom_demo'::varchar(50) as id,
        'resnet50-custom'::varchar(255) as name,
        'ResNet-50 fine-tuned for workspace smoke-test demos.'::text as description
)
insert into public.models (
    id,
    name,
    architecture,
    framework,
    task_type,
    status,
    version,
    size_bytes,
    parameter_count,
    primary_metric_name,
    primary_metric_value,
    all_metrics,
    tags,
    storage_path,
    created_by,
    source_payload,
    created_at,
    updated_at
)
select
    id,
    name,
    'ResNet-50',
    'pytorch',
    'image_classification',
    'ready',
    'v1.3',
    245 * 1024 * 1024,
    25557032,
    'accuracy',
    0.924,
    '{"accuracy": 0.924, "loss": 0.12, "f1_score": 0.887, "map50": 0.783}'::jsonb,
    '["demo", "vision", "experiment"]'::jsonb,
    '/models/model_resnet50_custom_demo',
    'seed-script',
    jsonb_build_object(
        'description', description,
        'framework_version', 'PyTorch 2.3.0',
        'dataset_id', 'coco_2017_detection',
        'training_duration_seconds', 2723
    ),
    now(),
    now()
from demo_models
on conflict (id) do update set
    name = excluded.name,
    architecture = excluded.architecture,
    framework = excluded.framework,
    task_type = excluded.task_type,
    status = excluded.status,
    version = excluded.version,
    size_bytes = excluded.size_bytes,
    parameter_count = excluded.parameter_count,
    primary_metric_name = excluded.primary_metric_name,
    primary_metric_value = excluded.primary_metric_value,
    all_metrics = excluded.all_metrics,
    tags = excluded.tags,
    storage_path = excluded.storage_path,
    source_payload = excluded.source_payload,
    updated_at = now();

with selected_user as (
    select id
    from users
    order by case when email = 'tester@collabclone.local' then 0 else 1 end, created_at
    limit 1
),
experiment_templates as (
    select * from (
        values
            ('resnet-training', 'ResNet Training', 'Image classification training runs for ResNet workspace demos.', '{"description": "Training ResNet models for image classification.", "source": "demo-seed"}'::jsonb),
            ('yolov8-custom', 'YOLOv8 Custom', 'Object detection experiments on a compact custom dataset.', '{"description": "Object detection using YOLOv8 on custom dataset.", "source": "demo-seed"}'::jsonb),
            ('bert-sentiment', 'BERT Sentiment', 'Fine-tuning BERT for multilingual sentiment analysis.', '{"description": "Fine-tuning BERT for sentiment analysis.", "source": "demo-seed"}'::jsonb)
    ) as template(slug, name, description, tags)
),
seed_experiments as (
    select
        (
            substr(md5(u.id::text || ':' || t.slug), 1, 8) || '-' ||
            substr(md5(u.id::text || ':' || t.slug), 9, 4) || '-' ||
            substr(md5(u.id::text || ':' || t.slug), 13, 4) || '-' ||
            substr(md5(u.id::text || ':' || t.slug), 17, 4) || '-' ||
            substr(md5(u.id::text || ':' || t.slug), 21, 12)
        )::uuid as id,
        (100000000 + (
            ('x' || substr(md5(u.id::text || ':' || t.slug), 1, 12))::bit(48)::bigint % 900000000
        ))::bigint as mlflow_experiment_id,
        t.name,
        t.description,
        u.id as owner_id,
        t.tags
    from selected_user u
    cross join experiment_templates t
)
insert into mlops.experiments (
    id,
    mlflow_experiment_id,
    name,
    description,
    owner_id,
    tags,
    artifact_location,
    lifecycle_stage,
    created_at,
    updated_at
)
select
    id,
    mlflow_experiment_id,
    name,
    description,
    owner_id,
    tags,
    's3://mlflow-artifacts/demo/' || id::text,
    'active',
    now() - interval '10 days',
    now()
from seed_experiments
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    tags = excluded.tags,
    artifact_location = excluded.artifact_location,
    lifecycle_stage = excluded.lifecycle_stage,
    updated_at = now();

with run_templates as (
    select * from (
        values
            ('run-best', 'best-validation-run', 'FINISHED', 0.924, 0.120, 0.887, 3),
            ('run-baseline', 'baseline-run', 'FINISHED', 0.903, 0.150, 0.871, 5),
            ('run-failed', 'failed-augmentation-run', 'FAILED', 0.0, 0.0, 0.0, 7)
    ) as template(slug, name, status, accuracy, loss, f1_score, days_ago)
),
seed_runs as (
    select
        (
            substr(md5(e.owner_id::text || ':' || e.name || ':' || rt.slug), 1, 8) || '-' ||
            substr(md5(e.owner_id::text || ':' || e.name || ':' || rt.slug), 9, 4) || '-' ||
            substr(md5(e.owner_id::text || ':' || e.name || ':' || rt.slug), 13, 4) || '-' ||
            substr(md5(e.owner_id::text || ':' || e.name || ':' || rt.slug), 17, 4) || '-' ||
            substr(md5(e.owner_id::text || ':' || e.name || ':' || rt.slug), 21, 12)
        )::uuid as id,
        md5(e.owner_id::text || ':' || e.name || ':' || rt.slug) as mlflow_run_id,
        e.id as experiment_id,
        rt.name,
        rt.status,
        now() - (rt.days_ago || ' days')::interval as start_time,
        case
            when rt.status = 'FINISHED' then now() - (rt.days_ago || ' days')::interval + interval '45 minutes 23 seconds'
            else null
        end as end_time,
        e.owner_id as user_id,
        jsonb_build_object('accuracy', rt.accuracy, 'loss', rt.loss, 'f1_score', rt.f1_score) as metrics_snapshot,
        '{"lr": 0.001, "batch_size": 32, "epochs": 50, "optimizer": "Adam"}'::jsonb as params_snapshot,
        '{"branch": "main", "commit": "abc1234", "source": "demo-seed"}'::jsonb as tags_snapshot
    from mlops.experiments e
    join run_templates rt on true
    where e.tags ->> 'source' = 'demo-seed'
      and e.name in ('ResNet Training', 'YOLOv8 Custom', 'BERT Sentiment')
)
insert into mlops.runs (
    id,
    mlflow_run_id,
    experiment_id,
    name,
    status,
    start_time,
    end_time,
    artifact_uri,
    source_type,
    source_name,
    git_commit,
    user_id,
    metrics_snapshot,
    params_snapshot,
    tags_snapshot,
    created_at
)
select
    id,
    mlflow_run_id,
    experiment_id,
    name,
    status::mlops_run_status,
    start_time,
    end_time,
    's3://mlflow-artifacts/runs/' || id::text,
    'PROJECT',
    'demo-seed',
    'abc1234',
    user_id,
    metrics_snapshot,
    params_snapshot,
    tags_snapshot,
    start_time
from seed_runs
on conflict (id) do update set
    name = excluded.name,
    status = excluded.status,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    artifact_uri = excluded.artifact_uri,
    metrics_snapshot = excluded.metrics_snapshot,
    params_snapshot = excluded.params_snapshot,
    tags_snapshot = excluded.tags_snapshot;

with selected_user as (
    select id
    from users
    order by case when email = 'tester@collabclone.local' then 0 else 1 end, created_at
    limit 1
),
registry_experiment as (
    insert into mlops.experiments (
        id,
        mlflow_experiment_id,
        name,
        description,
        owner_id,
        tags,
        artifact_location,
        lifecycle_stage,
        created_at,
        updated_at
    )
    select
        '7b4d26db-1a39-4fd3-9fbf-c64f96f7c2d0'::uuid,
        987654321,
        'Model Registry Demo Versions',
        'Generated runs backing demo model registry versions.',
        selected_user.id,
        '{"description": "Runs backing model registry demo versions.", "source": "demo-seed"}'::jsonb,
        's3://mlflow-artifacts/demo/model-registry',
        'active',
        now() - interval '14 days',
        now()
    from selected_user
    on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        tags = excluded.tags,
        artifact_location = excluded.artifact_location,
        lifecycle_stage = excluded.lifecycle_stage,
        updated_at = now()
    returning id, owner_id
),
model_version_templates as (
    select * from (
        values
            (1, 'Archived', 0.030, 0.055, 0.040, 21, 'Initial registry baseline'),
            (2, 'Staging', 0.016, 0.028, 0.022, 10, 'Validation candidate with improved metrics'),
            (3, 'Production', 0.000, 0.000, 0.000, 2, 'Production-ready demo version')
    ) as template(version_number, stage, accuracy_delta, loss_delta, f1_delta, days_ago, description)
),
version_runs as (
    select
        (
            substr(md5(m.name || ':registry-version:' || t.version_number), 1, 8) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 9, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 13, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 17, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 21, 12)
        )::uuid as id,
        md5(m.name || ':registry-version:' || t.version_number) as mlflow_run_id,
        re.id as experiment_id,
        m.name,
        t.version_number,
        t.stage,
        t.description,
        now() - (t.days_ago || ' days')::interval as start_time,
        now() - (t.days_ago || ' days')::interval + interval '45 minutes 23 seconds' as end_time,
        re.owner_id as user_id,
        greatest(0.5, coalesce(m.primary_metric_value, 0.86) - t.accuracy_delta) as accuracy,
        greatest(0.05, coalesce((m.all_metrics ->> 'loss')::numeric, 0.12) + t.loss_delta) as loss,
        greatest(0.45, coalesce((m.all_metrics ->> 'f1_score')::numeric, coalesce(m.primary_metric_value, 0.86) - 0.037) - t.f1_delta) as f1_score,
        coalesce((m.all_metrics ->> 'map50')::numeric, null) as map50,
        m.framework,
        m.task_type,
        m.size_bytes,
        m.storage_path
    from public.models m
    cross join model_version_templates t
    cross join registry_experiment re
)
insert into mlops.runs (
    id,
    mlflow_run_id,
    experiment_id,
    name,
    status,
    start_time,
    end_time,
    artifact_uri,
    source_type,
    source_name,
    git_commit,
    user_id,
    metrics_snapshot,
    params_snapshot,
    tags_snapshot,
    created_at
)
select
    id,
    mlflow_run_id,
    experiment_id,
    name || ' v' || version_number || ' registry run',
    'FINISHED',
    start_time,
    end_time,
    's3://mlflow-artifacts/model-registry/' || id::text,
    'PROJECT',
    'model-registry-demo-seed',
    'abc1234',
    user_id,
    jsonb_strip_nulls(jsonb_build_object('accuracy', accuracy, 'loss', loss, 'f1_score', f1_score, 'map50', map50)),
    '{"lr": 0.001, "batch_size": 32, "epochs": 50, "optimizer": "Adam"}'::jsonb,
    jsonb_build_object('branch', 'main', 'commit', 'abc1234', 'source', 'demo-seed', 'model_name', name, 'version', version_number),
    start_time
from version_runs
on conflict (id) do update set
    name = excluded.name,
    status = excluded.status,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    artifact_uri = excluded.artifact_uri,
    metrics_snapshot = excluded.metrics_snapshot,
    params_snapshot = excluded.params_snapshot,
    tags_snapshot = excluded.tags_snapshot;

with selected_user as (
    select id
    from users
    order by case when email = 'tester@collabclone.local' then 0 else 1 end, created_at
    limit 1
),
model_version_templates as (
    select * from (
        values
            (1, 'Archived', 0.030, 0.055, 0.040, 21, 'Initial registry baseline'),
            (2, 'Staging', 0.016, 0.028, 0.022, 10, 'Validation candidate with improved metrics'),
            (3, 'Production', 0.000, 0.000, 0.000, 2, 'Production-ready demo version')
    ) as template(version_number, stage, accuracy_delta, loss_delta, f1_delta, days_ago, description)
),
version_payload as (
    select
        (
            substr(md5(m.name || ':model-version:' || t.version_number), 1, 8) || '-' ||
            substr(md5(m.name || ':model-version:' || t.version_number), 9, 4) || '-' ||
            substr(md5(m.name || ':model-version:' || t.version_number), 13, 4) || '-' ||
            substr(md5(m.name || ':model-version:' || t.version_number), 17, 4) || '-' ||
            substr(md5(m.name || ':model-version:' || t.version_number), 21, 12)
        )::uuid as id,
        m.name as mlflow_name,
        t.version_number as mlflow_version,
        (
            substr(md5(m.name || ':registry-version:' || t.version_number), 1, 8) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 9, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 13, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 17, 4) || '-' ||
            substr(md5(m.name || ':registry-version:' || t.version_number), 21, 12)
        )::uuid as run_id,
        t.description,
        t.stage,
        'READY' as status,
        coalesce(m.storage_path, '/models/' || m.id) || '/v' || t.version_number as source,
        m.framework,
        m.task_type,
        m.size_bytes,
        jsonb_strip_nulls(
            jsonb_build_object(
                'accuracy', greatest(0.5, coalesce(m.primary_metric_value, 0.86) - t.accuracy_delta),
                'loss', greatest(0.05, coalesce((m.all_metrics ->> 'loss')::numeric, 0.12) + t.loss_delta),
                'f1_score', greatest(0.45, coalesce((m.all_metrics ->> 'f1_score')::numeric, coalesce(m.primary_metric_value, 0.86) - 0.037) - t.f1_delta),
                'map50', coalesce((m.all_metrics ->> 'map50')::numeric, null)
            )
        ) as metrics,
        jsonb_build_object(
            'source', 'demo-seed',
            'dataset_name', case
                when m.task_type ilike '%text%' then 'Support Ticket Corpus'
                when m.task_type ilike '%tabular%' then 'Customer Churn Analytics'
                when m.task_type ilike '%segmentation%' then 'Cityscapes Demo'
                else 'ImageNet Subset'
            end,
            'dataset_version', 'v1.' || t.version_number,
            'dataset_hash', substr(md5(m.name || ':dataset:' || t.version_number), 1, 7),
            'framework_version', case
                when m.framework ilike '%torch%' or m.framework ilike '%pytorch%' then 'PyTorch 2.3.0'
                when m.framework ilike '%tensorflow%' then 'TensorFlow 2.15'
                when m.framework ilike '%sklearn%' then 'scikit-learn 1.5'
                when m.framework ilike '%huggingface%' then 'Transformers 4.41'
                else m.framework
            end,
            'git_commit', substr(md5(m.name || ':commit:' || t.version_number), 1, 7)
        ) as tags,
        selected_user.id as created_by,
        case when t.stage = 'Production' then selected_user.id else null end as approved_by,
        case when t.stage = 'Production' then now() - interval '1 day' else null end as approved_at,
        now() - (t.days_ago || ' days')::interval as created_at
    from public.models m
    cross join model_version_templates t
    cross join selected_user
)
insert into mlops.model_versions (
    id,
    mlflow_name,
    mlflow_version,
    run_id,
    description,
    stage,
    status,
    source,
    framework,
    task_type,
    size_bytes,
    metrics,
    tags,
    approved_by,
    approved_at,
    created_by,
    created_at,
    updated_at
)
select
    id,
    mlflow_name,
    mlflow_version,
    run_id,
    description,
    stage::mlops_model_stage,
    status::mlops_model_status,
    source,
    framework,
    task_type,
    size_bytes,
    metrics,
    tags,
    approved_by,
    approved_at,
    created_by,
    created_at,
    now()
from version_payload
on conflict (mlflow_name, mlflow_version) do update set
    run_id = excluded.run_id,
    description = excluded.description,
    stage = excluded.stage,
    status = excluded.status,
    source = excluded.source,
    framework = excluded.framework,
    task_type = excluded.task_type,
    size_bytes = excluded.size_bytes,
    metrics = excluded.metrics,
    tags = excluded.tags,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    created_by = excluded.created_by,
    updated_at = now();
