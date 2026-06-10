BEGIN;

CREATE SCHEMA IF NOT EXISTS public_before_mlflow_schema_merge;

-- Move conflicting public tables out of the way. They are kept as rollback backup.
ALTER TABLE IF EXISTS public.alembic_version SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.datasets SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.experiments SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.metrics SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.params SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.runs SET SCHEMA public_before_mlflow_schema_merge;
ALTER TABLE IF EXISTS public.tags SET SCHEMA public_before_mlflow_schema_merge;

-- Move related public sequences for backed-up legacy tables.
ALTER SEQUENCE IF EXISTS public.experiments_experiment_id_seq SET SCHEMA public_before_mlflow_schema_merge;

-- Move MLflow tables into public. Conflicting names now resolve to MLflow versions.
ALTER TABLE mlflow.alembic_version SET SCHEMA public;
ALTER TABLE mlflow.datasets SET SCHEMA public;
ALTER TABLE mlflow.experiment_tags SET SCHEMA public;
ALTER TABLE mlflow.experiments SET SCHEMA public;
ALTER TABLE mlflow.input_tags SET SCHEMA public;
ALTER TABLE mlflow.inputs SET SCHEMA public;
ALTER TABLE mlflow.latest_metrics SET SCHEMA public;
ALTER TABLE mlflow.metrics SET SCHEMA public;
ALTER TABLE mlflow.model_version_tags SET SCHEMA public;
ALTER TABLE mlflow.model_versions SET SCHEMA public;
ALTER TABLE mlflow.params SET SCHEMA public;
ALTER TABLE mlflow.registered_model_aliases SET SCHEMA public;
ALTER TABLE mlflow.registered_model_tags SET SCHEMA public;
ALTER TABLE mlflow.registered_models SET SCHEMA public;
ALTER TABLE mlflow.runs SET SCHEMA public;
ALTER TABLE mlflow.tags SET SCHEMA public;
ALTER TABLE mlflow.trace_info SET SCHEMA public;
ALTER TABLE mlflow.trace_request_metadata SET SCHEMA public;
ALTER TABLE mlflow.trace_tags SET SCHEMA public;

-- Move MLflow sequences into public.
ALTER SEQUENCE IF EXISTS mlflow.experiments_experiment_id_seq SET SCHEMA public;

DROP SCHEMA IF EXISTS mlflow;

COMMIT;
