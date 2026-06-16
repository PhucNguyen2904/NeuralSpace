begin;

with public_model_versions as (
    select
        m.id as registry_model_id,
        m.name,
        coalesce(nullif(substring(m.version from '^v([0-9]+)'), '')::int, 1) as keep_mlflow_version
    from public.models m
),
keep_model_versions as (
    select
        mv.id,
        mv.mlflow_name,
        mv.mlflow_version,
        pmv.registry_model_id,
        'v' || mv.mlflow_version::text as registry_version
    from mlops.model_versions mv
    join public_model_versions pmv
        on pmv.name = mv.mlflow_name
       and pmv.keep_mlflow_version = mv.mlflow_version
),
deleted_links as (
    delete from mlops.model_dataset_links mdl
    where not exists (
        select 1 from keep_model_versions kmv where kmv.id = mdl.model_version_id
    )
       or mdl.notes like 'Supplementary lineage link using existing dataset/model assets:%'
    returning 1
),
deleted_versions as (
    delete from mlops.model_versions mv
    where exists (select 1 from public.models pm where pm.name = mv.mlflow_name)
      and not exists (select 1 from keep_model_versions kmv where kmv.id = mv.id)
    returning run_id
),
updated_kept_versions as (
    update mlops.model_versions mv
    set tags = coalesce(mv.tags, '{}'::jsonb)
        || jsonb_build_object(
            'registry_model_id', kmv.registry_model_id,
            'registry_version', kmv.registry_version
        ),
        description = case
            when coalesce(mv.description, '') like '%(lineage aligned with public.models %' then mv.description
            else coalesce(nullif(mv.description, ''), 'Synced from public model registry')
                || ' (lineage aligned with public.models ' || kmv.registry_version || ')'
        end
    from keep_model_versions kmv
    where mv.id = kmv.id
    returning mv.id
),
synced_public_model_versions as (
    update public.models pm
    set version = kmv.registry_version,
        updated_at = now()
    from keep_model_versions kmv
    where pm.name = kmv.mlflow_name
    returning pm.id
),
dataset_map as (
    select *
    from (
        values
            ('BERT Sentiment', 'Sentiment Tweets Dataset'),
            ('ResNet-50 ImageNet', 'COCO 2017 Detection Sample'),
            ('ResNet50 Smoke Test', 'COCO 2017 Detection Sample'),
            ('UNet Segmentation', 'COCO 2017 Detection Sample'),
            ('XGBoost Churn', 'Iris Dataset'),
            ('resnet50-custom', 'COCO 2017 Detection Sample')
    ) as item(model_name, dataset_name)
),
desired_links as (
    select
        kmv.id as model_version_id,
        dv.id as dataset_version_id,
        mv.created_by
    from keep_model_versions kmv
    join mlops.model_versions mv on mv.id = kmv.id
    join dataset_map dm on dm.model_name = kmv.mlflow_name
    join mlops.datasets d on d.name = dm.dataset_name
    join mlops.dataset_versions dv on dv.dataset_id = d.id and dv.is_latest = true
),
deleted_wrong_remaining_links as (
    delete from mlops.model_dataset_links mdl
    where exists (select 1 from keep_model_versions kmv where kmv.id = mdl.model_version_id)
      and not exists (
          select 1
          from desired_links dl
          where dl.model_version_id = mdl.model_version_id
            and dl.dataset_version_id = mdl.dataset_version_id
            and mdl.link_type = 'train'
      )
    returning 1
),
inserted_links as (
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
            substr(md5('aligned-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 1, 8) || '-' ||
            substr(md5('aligned-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 9, 4) || '-' ||
            substr(md5('aligned-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 13, 4) || '-' ||
            substr(md5('aligned-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 17, 4) || '-' ||
            substr(md5('aligned-model-dataset-link:' || model_version_id::text || ':' || dataset_version_id::text), 21, 12)
        )::uuid,
        model_version_id,
        dataset_version_id,
        'train'::mlops_link_type,
        now(),
        created_by,
        'Aligned lineage with public.datasets/public.models current versions'
    from desired_links
    on conflict (model_version_id, dataset_version_id, link_type) do update set
        notes = excluded.notes
    returning 1
),
synced_dataset_paths as (
    update mlops.datasets md
    set storage_path = pd.storage_path,
        updated_at = now()
    from public.datasets pd
    where pd.name = md.name
    returning md.id
),
synced_dataset_version_paths as (
    update mlops.dataset_versions dv
    set storage_path = pd.storage_path,
        schema_snapshot = coalesce(dv.schema_snapshot, '{}'::jsonb)
            || jsonb_build_object(
                'source', 'public.datasets',
                'public_dataset_id', pd.id,
                'public_storage_path', pd.storage_path
            )
    from mlops.datasets md
    join public.datasets pd on pd.name = md.name
    where dv.dataset_id = md.id
    returning dv.id
),
updated_runs as (
    update mlops.runs r
    set dvc_dataset_version_id = dl.dataset_version_id,
        dvc_md5 = dv.dvc_md5
    from mlops.model_versions mv
    join desired_links dl on dl.model_version_id = mv.id
    join mlops.dataset_versions dv on dv.id = dl.dataset_version_id
    where r.id = mv.run_id
    returning r.id
),
fixed_colab_template as (
    update mlops.runs r
    set tags_snapshot = jsonb_set(
            jsonb_set(
                coalesce(r.tags_snapshot, '{}'::jsonb),
                '{colab_lineage,inputs}',
                jsonb_build_array(jsonb_build_object(
                    'role', 'training_dataset',
                    'asset_id', 'ds_003',
                    'asset_type', 'dataset'
                )),
                true
            ),
            '{colab_lineage,outputs}',
            jsonb_build_array(jsonb_build_object(
                'role', 'fine_tuned_model',
                'asset_id', 'mdl_002',
                'asset_type', 'model'
            )),
            true
        )
    where r.name = 'Colab lineage template'
    returning 1
),
fixed_colab_yolo as (
    update mlops.runs r
    set tags_snapshot = jsonb_set(
            jsonb_set(
                coalesce(r.tags_snapshot, '{}'::jsonb),
                '{colab_lineage,inputs}',
                jsonb_build_array(jsonb_build_object(
                    'role', 'training_dataset',
                    'asset_id', 'ds_002',
                    'asset_type', 'dataset'
                )),
                true
            ),
            '{colab_lineage,outputs}',
            jsonb_build_array(jsonb_build_object(
                'role', 'fine_tuned_model',
                'asset_id', 'mdl_003',
                'asset_type', 'model'
            )),
            true
        )
    where r.name = 'yolo_'
    returning 1
)
select
    (select count(*) from deleted_links) as deleted_links,
    (select count(*) from deleted_versions) as deleted_model_versions,
    (select count(*) from updated_kept_versions) as updated_kept_versions,
    (select count(*) from synced_public_model_versions) as synced_public_model_versions,
    (select count(*) from deleted_wrong_remaining_links) as deleted_wrong_remaining_links,
    (select count(*) from inserted_links) as upserted_links,
    (select count(*) from synced_dataset_paths) as synced_datasets,
    (select count(*) from synced_dataset_version_paths) as synced_dataset_versions,
    (select count(*) from updated_runs) as updated_runs,
    (select count(*) from fixed_colab_template) as fixed_colab_template,
    (select count(*) from fixed_colab_yolo) as fixed_colab_yolo;

with deleted_orphan_runs as (
    delete from mlops.runs r
    where not exists (select 1 from mlops.model_versions mv where mv.run_id = r.id)
      and not (coalesce(r.tags_snapshot, '{}'::jsonb) ? 'colab_lineage')
    returning 1
)
select count(*) as deleted_orphan_runs from deleted_orphan_runs;

commit;
