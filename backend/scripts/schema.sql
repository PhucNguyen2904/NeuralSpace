-- =============================================================================
-- NeuralSpace Platform - Full Database Schema
-- Generated from Alembic migration chain (canonical source of truth)
-- Last updated: 2026-07-13
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS mlops;
CREATE SCHEMA IF NOT EXISTS public;

-- ---------------------------------------------------------------------------
-- Enum Types (public schema)
-- ---------------------------------------------------------------------------

CREATE TYPE public.workspace_status AS ENUM (
    'READY',
    'RUNNING',
    'STOPPED',
    'ERROR'
);

CREATE TYPE public.runtime_session_status AS ENUM (
    'CREATED',
    'CONNECTED',
    'REVOKED',
    'EXPIRED'
);

CREATE TYPE public.git_provider_type AS ENUM (
    'github',
    'gitlab',
    'bitbucket'
);

-- ---------------------------------------------------------------------------
-- Enum Types (mlops schema)
-- ---------------------------------------------------------------------------

CREATE TYPE mlops.dataset_type AS ENUM (
    'image',
    'tabular',
    'text',
    'audio',
    'video',
    'custom'
);

CREATE TYPE mlops.dataset_status AS ENUM (
    'active',
    'archived',
    'deprecated'
);

CREATE TYPE mlops.dataset_version_status AS ENUM (
    'draft',
    'validated',
    'deprecated'
);

CREATE TYPE mlops.experiment_lifecycle AS ENUM (
    'active',
    'deleted'
);

CREATE TYPE mlops.run_status AS ENUM (
    'RUNNING',
    'SCHEDULED',
    'FINISHED',
    'FAILED',
    'KILLED'
);

CREATE TYPE mlops.run_source_type AS ENUM (
    'NOTEBOOK',
    'JOB',
    'PROJECT',
    'LOCAL',
    'UNKNOWN'
);

CREATE TYPE mlops.model_stage AS ENUM (
    'None',
    'Staging',
    'Production',
    'Archived'
);

CREATE TYPE mlops.model_status AS ENUM (
    'PENDING_REGISTRATION',
    'READY',
    'FAILED'
);

CREATE TYPE mlops.link_type AS ENUM (
    'train',
    'val',
    'test',
    'eval'
);

CREATE TYPE mlops.approval_target_stage AS ENUM (
    'Staging',
    'Production'
);

CREATE TYPE mlops.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

CREATE TYPE mlops.dvc_profile_scope AS ENUM (
    'global',
    'team',
    'user',
    'workspace'
);

CREATE TYPE mlops.dvc_profile_status AS ENUM (
    'ready',
    'inactive',
    'error',
    'pending_oauth',
    'pending_repo_selection',
    'active',
    'archived'
);

CREATE TYPE mlops.dvc_profile_repo_mode AS ENUM (
    'managed_git',
    'existing_path'
);

-- ---------------------------------------------------------------------------
-- Tables (public schema) — dependency order
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
	id UUID NOT NULL,
	email TEXT,
	full_name TEXT,
	password_hash TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

-- Workspace: project context for external Colab runtimes.
-- Authentication via passcode_hash (generated at create time).
-- No k8s fields — Colab-only architecture.
CREATE TABLE public.workspaces (
	id VARCHAR(20) NOT NULL,
	user_id UUID NOT NULL,
	name VARCHAR(255),
	status public.workspace_status DEFAULT 'READY' NOT NULL,
	access_url TEXT,
	passcode_hash VARCHAR(64),
	dataset_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
	model_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
	started_at TIMESTAMP WITH TIME ZONE,
	stopped_at TIMESTAMP WITH TIME ZONE,
	last_heartbeat TIMESTAMP WITH TIME ZONE,
	last_kernel_activity TIMESTAMP WITH TIME ZONE,	-- lần cuối kernel chạy code (dùng để phát hiện idle)
	auto_kill_at TIMESTAMP WITH TIME ZONE,
	error_message TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_workspaces_dataset_ids_array CHECK (jsonb_typeof(dataset_ids) = 'array'),
	CONSTRAINT ck_workspaces_model_ids_array CHECK (jsonb_typeof(model_ids) = 'array'),
	FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);
CREATE INDEX ix_workspaces_user_id ON public.workspaces (user_id);
CREATE INDEX ix_workspaces_user_id_status ON public.workspaces (user_id, status);
CREATE INDEX ix_workspaces_status_auto_kill_at_running ON public.workspaces (status, auto_kill_at) WHERE status = 'RUNNING';

CREATE TABLE public.workspace_events (
	id BIGSERIAL NOT NULL,
	workspace_id VARCHAR(20) NOT NULL,
	event_type VARCHAR(50) NOT NULL,
	actor VARCHAR(50) NOT NULL,
	details JSONB DEFAULT '{}'::jsonb NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES public.workspaces (id) ON DELETE CASCADE
);
CREATE INDEX ix_workspace_events_workspace_id ON public.workspace_events (workspace_id);
CREATE INDEX ix_workspace_events_workspace_id_created_at_desc ON public.workspace_events (workspace_id, created_at DESC);

CREATE TABLE public.external_runtime_sessions (
	id UUID NOT NULL,
	workspace_id VARCHAR(20) NOT NULL,
	user_id UUID NOT NULL,
	provider VARCHAR(30) DEFAULT 'google_colab' NOT NULL,
	status public.runtime_session_status DEFAULT 'CREATED' NOT NULL,
	token_jti VARCHAR(64),
	capabilities JSONB DEFAULT '[]'::jsonb NOT NULL,
	connected_at TIMESTAMP WITH TIME ZONE,
	last_heartbeat_at TIMESTAMP WITH TIME ZONE,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	revoked_at TIMESTAMP WITH TIME ZONE,
	revoke_reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES public.workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE,
	UNIQUE (token_jti)
);
CREATE INDEX ix_runtime_sessions_user_status ON public.external_runtime_sessions (user_id, status);
CREATE INDEX ix_runtime_sessions_workspace_created ON public.external_runtime_sessions (workspace_id, created_at);

-- storage_connections: rclone-based remote storage (GDrive, S3, MinIO, etc.)
CREATE TABLE public.storage_connections (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	provider VARCHAR(50) NOT NULL,
	remote_name VARCHAR(100) NOT NULL,
	config_path TEXT NOT NULL,
	display_name VARCHAR(255) NOT NULL,
	encrypted_credentials TEXT,
	status VARCHAR(50) DEFAULT 'connected' NOT NULL,
	is_default BOOLEAN DEFAULT 'false' NOT NULL,
	last_sync_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE TABLE public.git_accounts (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	provider public.git_provider_type NOT NULL,
	username VARCHAR(255) NOT NULL,
	access_token VARCHAR(1024) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE TABLE public.git_repositories (
	id UUID NOT NULL,
	git_account_id UUID NOT NULL,
	repo_name VARCHAR(255) NOT NULL,
	repo_url VARCHAR(1024) NOT NULL,
	is_private BOOLEAN DEFAULT 'false' NOT NULL,
	is_tracked BOOLEAN DEFAULT 'false' NOT NULL,
	tracked_branch VARCHAR(255) DEFAULT 'main' NOT NULL,
	last_sync_time TIMESTAMP WITH TIME ZONE,
	sync_status VARCHAR(50),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(git_account_id) REFERENCES public.git_accounts (id) ON DELETE CASCADE
);

CREATE TABLE public.git_sync_preferences (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	auto_sync_experiments BOOLEAN DEFAULT 'true' NOT NULL,
	commit_checkpoints BOOLEAN DEFAULT 'false' NOT NULL,
	create_pr_on_completion BOOLEAN DEFAULT 'true' NOT NULL,
	sync_interval INTEGER DEFAULT '15' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Tables (mlops schema) — dependency order
-- ---------------------------------------------------------------------------

-- mlops.dvc_profiles: cấu hình DVC + Git cho từng user/workspace
CREATE TABLE mlops.dvc_profiles (
	id UUID NOT NULL,
	name VARCHAR(255) NOT NULL,
	scope mlops.dvc_profile_scope DEFAULT 'global' NOT NULL,
	scope_id VARCHAR(64),
	repo_mode mlops.dvc_profile_repo_mode DEFAULT 'managed_git' NOT NULL,
	git_repo_url VARCHAR(500),
	git_branch VARCHAR(100) DEFAULT 'main' NOT NULL,
	repo_path VARCHAR(500) NOT NULL,
	remote_name VARCHAR(100) DEFAULT 'minio' NOT NULL,
	remote_url VARCHAR(500),
	endpoint_url VARCHAR(500),
	is_default BOOLEAN DEFAULT 'false' NOT NULL,
	status mlops.dvc_profile_status DEFAULT 'ready' NOT NULL,
	status_message TEXT,
	git_ssh_url TEXT,
	git_repo_owner VARCHAR(255),
	git_repo_name VARCHAR(255),
	github_installation_id BIGINT,
	github_deploy_key_id BIGINT,
	ssh_key_encrypted BYTEA,
	ssh_public_key TEXT,
	created_by UUID,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_mlops_dvc_profiles_name_scope UNIQUE (name, scope, scope_id),
	FOREIGN KEY(created_by) REFERENCES public.users (id)
);
CREATE INDEX ix_mlops_dvc_profiles_scope ON mlops.dvc_profiles (scope, scope_id);

-- mlops.datasets: tập dữ liệu được quản lý bởi DVC
CREATE TABLE mlops.datasets (
	id UUID NOT NULL,
	name VARCHAR(255) NOT NULL,
	description TEXT,
	type mlops.dataset_type NOT NULL,
	owner_id UUID NOT NULL,
	team_id UUID,
	dvc_profile_id UUID,
	dvc_repo_url VARCHAR(500),
	storage_path VARCHAR(500),
	tags JSONB DEFAULT '[]'::jsonb NOT NULL,
	status mlops.dataset_status DEFAULT 'active' NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (name, owner_id),
	FOREIGN KEY(owner_id) REFERENCES public.users (id),
	FOREIGN KEY(dvc_profile_id) REFERENCES mlops.dvc_profiles (id) ON DELETE SET NULL
);

-- mlops.dataset_versions: phiên bản snapshot của dataset (immutable)
CREATE TABLE mlops.dataset_versions (
	id UUID NOT NULL,
	dataset_id UUID NOT NULL,
	version VARCHAR(50) NOT NULL,
	dvc_md5 VARCHAR(64),
	dvc_commit VARCHAR(40),
	dvc_profile_id UUID,
	git_tag VARCHAR(100),
	size_bytes BIGINT,
	item_count INTEGER,
	schema_snapshot JSONB,
	split_info JSONB,
	storage_path VARCHAR(500),
	metadata_uri VARCHAR(500),
	validation_report_uri VARCHAR(500),
	validation_status VARCHAR(30),
	validation_summary JSONB,
	metadata_snapshot JSONB,
	format VARCHAR(50),
	task_type VARCHAR(50),
	created_by UUID NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	changelog TEXT,
	is_latest BOOLEAN DEFAULT 'false' NOT NULL,
	status mlops.dataset_version_status DEFAULT 'draft' NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_mlops_dataset_versions_dataset_version UNIQUE (dataset_id, version),
	FOREIGN KEY(dataset_id) REFERENCES mlops.datasets (id) ON DELETE CASCADE,
	FOREIGN KEY(dvc_profile_id) REFERENCES mlops.dvc_profiles (id) ON DELETE SET NULL,
	FOREIGN KEY(created_by) REFERENCES public.users (id)
);
CREATE INDEX ix_mlops_dataset_versions_dvc_md5 ON mlops.dataset_versions (dvc_md5);
CREATE INDEX ix_mlops_dataset_versions_dvc_commit ON mlops.dataset_versions (dvc_commit);
CREATE UNIQUE INDEX uq_mlops_dataset_versions_latest_per_dataset ON mlops.dataset_versions (dataset_id) WHERE is_latest = true;

-- mlops.experiments: nhóm các lần chạy (runs) thành thí nghiệm
CREATE TABLE mlops.experiments (
	id UUID NOT NULL,
	mlflow_experiment_id BIGINT NOT NULL,
	name VARCHAR(255) NOT NULL,
	description TEXT,
	owner_id UUID NOT NULL,
	team_id UUID,
	tags JSONB DEFAULT '{}'::jsonb NOT NULL,
	artifact_location VARCHAR(500),
	lifecycle_stage mlops.experiment_lifecycle DEFAULT 'active' NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (mlflow_experiment_id),
	FOREIGN KEY(owner_id) REFERENCES public.users (id)
);

-- mlops.runs: một lần chạy training/eval từ Colab notebook
-- artifact_uri: đường dẫn MinIO lưu model artifacts
CREATE TABLE mlops.runs (
	id UUID NOT NULL,
	mlflow_run_id VARCHAR(32) NOT NULL,
	experiment_id UUID NOT NULL,
	workspace_id VARCHAR(20),
	runtime_session_id UUID,
	name VARCHAR(255),
	status mlops.run_status NOT NULL,
	start_time TIMESTAMP WITHOUT TIME ZONE,
	end_time TIMESTAMP WITHOUT TIME ZONE,
	artifact_uri VARCHAR(500),		-- URI MinIO/S3 chứa model artifacts (e.g. s3://mlflow/...)
	source_type mlops.run_source_type,
	source_name VARCHAR(500),
	git_commit VARCHAR(40),
	user_id UUID NOT NULL,
	metrics_snapshot JSONB,
	params_snapshot JSONB,
	tags_snapshot JSONB,
	dvc_dataset_version_id UUID,
	dvc_md5 VARCHAR(64),
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (mlflow_run_id),
	FOREIGN KEY(experiment_id) REFERENCES mlops.experiments (id),
	FOREIGN KEY(workspace_id) REFERENCES public.workspaces (id) ON DELETE SET NULL,
	FOREIGN KEY(runtime_session_id) REFERENCES public.external_runtime_sessions (id) ON DELETE SET NULL,
	FOREIGN KEY(user_id) REFERENCES public.users (id),
	FOREIGN KEY(dvc_dataset_version_id) REFERENCES mlops.dataset_versions (id)
);
CREATE INDEX ix_mlops_runs_dvc_dataset_version_id ON mlops.runs (dvc_dataset_version_id);
CREATE INDEX ix_mlops_runs_runtime_session_created ON mlops.runs (runtime_session_id, created_at);

-- mlops.run_logs: log output từ Colab runtime theo từng run
CREATE TABLE mlops.run_logs (
	id BIGSERIAL NOT NULL,
	run_id UUID NOT NULL,
	runtime_session_id UUID NOT NULL,
	level VARCHAR(10) NOT NULL,
	message TEXT NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(run_id) REFERENCES mlops.runs (id) ON DELETE CASCADE,
	FOREIGN KEY(runtime_session_id) REFERENCES public.external_runtime_sessions (id) ON DELETE CASCADE
);
CREATE INDEX ix_mlops_run_logs_run_created ON mlops.run_logs (run_id, created_at);

-- mlops.model_versions: phiên bản model được đăng ký từ MLflow
CREATE TABLE mlops.model_versions (
	id UUID NOT NULL,
	mlflow_name VARCHAR(255) NOT NULL,
	mlflow_version INTEGER NOT NULL,
	run_id UUID NOT NULL,
	description TEXT,
	stage mlops.model_stage DEFAULT 'None' NOT NULL,
	status mlops.model_status DEFAULT 'PENDING_REGISTRATION' NOT NULL,
	source VARCHAR(500),
	framework VARCHAR(50),
	task_type VARCHAR(50),
	size_bytes BIGINT,
	metrics JSONB,
	tags JSONB,
	approved_by UUID,
	approved_at TIMESTAMP WITHOUT TIME ZONE,
	created_by UUID NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_mlops_model_versions_mlflow_name_version UNIQUE (mlflow_name, mlflow_version),
	CONSTRAINT ck_mlops_model_versions_prod_requires_approval CHECK ((stage <> 'Production') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
	FOREIGN KEY(run_id) REFERENCES mlops.runs (id),
	FOREIGN KEY(approved_by) REFERENCES public.users (id),
	FOREIGN KEY(created_by) REFERENCES public.users (id)
);
CREATE INDEX ix_mlops_model_versions_stage ON mlops.model_versions (stage);

-- mlops.approval_requests: yêu cầu phê duyệt để promote model lên Staging/Production
CREATE TABLE mlops.approval_requests (
	id UUID NOT NULL,
	model_version_id UUID NOT NULL,
	requested_by UUID NOT NULL,
	requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	target_stage mlops.approval_target_stage NOT NULL,
	status mlops.approval_status DEFAULT 'pending' NOT NULL,
	reviewer_id UUID,
	reviewed_at TIMESTAMP WITHOUT TIME ZONE,
	review_note TEXT,
	auto_approved BOOLEAN DEFAULT 'false' NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(model_version_id) REFERENCES mlops.model_versions (id) ON DELETE CASCADE,
	FOREIGN KEY(requested_by) REFERENCES public.users (id),
	FOREIGN KEY(reviewer_id) REFERENCES public.users (id)
);
CREATE INDEX ix_mlops_approval_requests_model_version_status ON mlops.approval_requests (model_version_id, status);

-- mlops.model_dataset_links: lineage — model version ↔ dataset version
CREATE TABLE mlops.model_dataset_links (
	id UUID NOT NULL,
	model_version_id UUID NOT NULL,
	dataset_version_id UUID NOT NULL,
	link_type mlops.link_type NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	created_by UUID NOT NULL,
	notes TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_mlops_model_dataset_links_model_dataset_type UNIQUE (model_version_id, dataset_version_id, link_type),
	FOREIGN KEY(model_version_id) REFERENCES mlops.model_versions (id) ON DELETE CASCADE,
	FOREIGN KEY(dataset_version_id) REFERENCES mlops.dataset_versions (id) ON DELETE CASCADE,
	FOREIGN KEY(created_by) REFERENCES public.users (id)
);

-- mlops.audit_logs: bảng append-only ghi mọi thao tác thay đổi trong MLOps schema
CREATE TABLE mlops.audit_logs (
	id BIGSERIAL NOT NULL,
	entity_type VARCHAR(50) NOT NULL,
	entity_id UUID NOT NULL,
	action VARCHAR(50) NOT NULL,
	actor_id UUID NOT NULL,
	actor_role VARCHAR(50),
	old_value JSONB,
	new_value JSONB,
	metadata JSONB,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(actor_id) REFERENCES public.users (id)
);
CREATE INDEX ix_mlops_audit_logs_entity_entity_id_created ON mlops.audit_logs (entity_type, entity_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers: audit_logs is append-only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mlops.prevent_audit_logs_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'mlops.audit_logs is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mlops_audit_logs_no_update
BEFORE UPDATE ON mlops.audit_logs
FOR EACH ROW
EXECUTE FUNCTION mlops.prevent_audit_logs_mutation();

CREATE TRIGGER trg_mlops_audit_logs_no_delete
BEFORE DELETE ON mlops.audit_logs
FOR EACH ROW
EXECUTE FUNCTION mlops.prevent_audit_logs_mutation();
