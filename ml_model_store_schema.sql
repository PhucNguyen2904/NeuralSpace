-- ============ SECTION 1: DATABASE & USER SETUP ============
-- Note: CREATE DATABASE and Roles cannot be executed inside a transaction block.

\echo 'Creating application users...'
-- IMPORTANT: Change these passwords before deploying to a production environment!
CREATE USER ml_app_user WITH PASSWORD 'ChangeThisInProd_App_123!';
CREATE USER ml_readonly_user WITH PASSWORD 'ChangeThisInProd_Read_123!';

\echo 'Creating database...'
CREATE DATABASE ml_model_store;

\echo 'Connecting to ml_model_store database...'
\c ml_model_store

\echo 'Configuring schemas and privileges...'
BEGIN;

-- Revoke default public schema privileges to enforce least privilege
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE ml_model_store FROM PUBLIC;

-- Grant connect privileges
GRANT CONNECT ON DATABASE ml_model_store TO ml_app_user;
GRANT CONNECT ON DATABASE ml_model_store TO ml_readonly_user;

-- Grant usage on schema public
GRANT USAGE ON SCHEMA public TO ml_app_user;
GRANT USAGE ON SCHEMA public TO ml_readonly_user;

-- Grant create on schema to app user (so they can create temporary tables if needed, or if app uses migrations)
GRANT CREATE ON SCHEMA public TO ml_app_user;

-- Set default privileges for future objects created by postgres
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ml_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ml_readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ml_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ml_readonly_user;

COMMIT;


-- ============ SECTION 2: EXTENSIONS ============
\echo 'Enabling extensions...'
BEGIN;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
COMMIT;


-- ============ SECTION 3: ENUM TYPES ============
\echo 'Creating ENUM types...'
BEGIN;
CREATE TYPE task_status AS ENUM (
    'PENDING', 'DOWNLOADING', 'VERIFYING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED'
);

CREATE TYPE source_type AS ENUM (
    'huggingface', 'github_release', 'direct_url'
);

CREATE TYPE model_status AS ENUM (
    'ready', 'corrupt', 'deleted'
);
COMMIT;


-- ============ SECTION 4: TABLES ============
\echo 'Creating tables...'
BEGIN;

CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    source_type source_type NOT NULL,
    source_identifier TEXT NOT NULL,
    source_url TEXT,
    storage_path TEXT UNIQUE,
    sha256 CHAR(64) UNIQUE,
    size_bytes BIGINT,
    metadata JSONB DEFAULT '{}',
    status model_status NOT NULL DEFAULT 'ready',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE TABLE download_tasks (
    id VARCHAR(20) PRIMARY KEY,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    status task_status NOT NULL DEFAULT 'PENDING',
    source_type source_type NOT NULL,
    source_identifier TEXT NOT NULL,
    source_url TEXT,
    priority SMALLINT NOT NULL DEFAULT 1,
    progress_pct SMALLINT DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    downloaded_bytes BIGINT DEFAULT 0,
    total_bytes BIGINT,
    current_file TEXT,
    temp_file_path TEXT,
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count SMALLINT NOT NULL DEFAULT 0,
    max_retries SMALLINT NOT NULL DEFAULT 3,
    celery_task_id VARCHAR(50),
    request_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id VARCHAR(20) NOT NULL REFERENCES download_tasks(id) ON DELETE CASCADE,
    old_status task_status,
    new_status task_status NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant privileges on explicitly created tables immediately 
-- (in case they don't inherit from default privileges)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ml_app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ml_readonly_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ml_app_user;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ml_readonly_user;

COMMIT;


-- ============ SECTION 5: INDEXES ============
\echo 'Creating indexes...'
BEGIN;

CREATE INDEX idx_download_tasks_pending_priority 
    ON download_tasks(status, priority DESC, created_at) 
    WHERE status = 'PENDING';

CREATE INDEX idx_download_tasks_status_created 
    ON download_tasks(status, created_at DESC);

CREATE INDEX idx_download_tasks_celery_task_id 
    ON download_tasks(celery_task_id) 
    WHERE celery_task_id IS NOT NULL;

CREATE UNIQUE INDEX idx_models_sha256 
    ON models(sha256) 
    WHERE sha256 IS NOT NULL;

CREATE INDEX idx_models_tags 
    ON models USING gin(tags);

CREATE INDEX idx_models_name_fts 
    ON models USING gin(to_tsvector('english', name));

CREATE INDEX idx_models_metadata 
    ON models USING gin(metadata jsonb_path_ops);

CREATE INDEX idx_task_audit_logs_task_created 
    ON task_audit_logs(task_id, created_at DESC);

COMMIT;


-- ============ SECTION 6: FUNCTIONS & TRIGGERS ============
\echo 'Creating functions and triggers...'
BEGIN;

-- Trigger function for auto-updating `updated_at`
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_download_tasks_updated_at
    BEFORE UPDATE ON download_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger function for auto-inserting audit logs
CREATE OR REPLACE FUNCTION audit_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO task_audit_logs (task_id, old_status, new_status)
        VALUES (NEW.id, NULL, NEW.status);
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO task_audit_logs (task_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_download_tasks_audit
    AFTER INSERT OR UPDATE ON download_tasks
    FOR EACH ROW
    EXECUTE FUNCTION audit_task_status_change();

COMMIT;


-- ============ SECTION 7: SEED DATA ============
\echo 'Inserting seed data for development...'
BEGIN;

-- Seed Models
INSERT INTO models (id, name, source_type, source_identifier, source_url, storage_path, sha256, size_bytes, tags)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Mistral-7B-v0.1', 'huggingface', 'mistralai/Mistral-7B-v0.1', 'https://huggingface.co/mistralai/Mistral-7B-v0.1', '/data/models/mistralai/Mistral-7B-v0.1', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 14460000000, ARRAY['llm', '7b', 'mistral']),
    ('22222222-2222-2222-2222-222222222222', 'ResNet-50 v2', 'direct_url', 'resnet-50-v2', 'https://example.com/models/resnet50.tar.gz', '/data/models/resnet50', '8cf0e7f7793d5a23f5b80ee135cf52cebb29b4ce88dcb4c70503023fcbc013d5', 102000000, ARRAY['vision', 'resnet', 'classification']);

-- Seed Download Tasks
INSERT INTO download_tasks (id, model_id, status, source_type, source_identifier, priority, progress_pct, request_metadata)
VALUES 
    ('dl_a1b2c3d4e5', NULL, 'PENDING', 'github_release', 'ggerganov/llama.cpp/ggml-model-q4_0.bin', 5, 0, '{"file_patterns": ["*.bin"]}'),
    ('dl_f6g7h8i9j0', '11111111-1111-1111-1111-111111111111', 'DOWNLOADING', 'huggingface', 'mistralai/Mistral-7B-v0.1', 3, 45, '{"hf_token_hint": "required"}'),
    ('dl_k1l2m3n4o5', '22222222-2222-2222-2222-222222222222', 'COMPLETED', 'direct_url', 'resnet-50-v2', 1, 100, '{}');

COMMIT;


-- ============ FINAL VERIFICATION ============
\echo 'Verifying created objects...'

\echo 'Checking Tables:'
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

\echo 'Checking Extensions:'
SELECT extname 
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pg_trgm', 'btree_gin');

\echo 'Checking Seed Data:'
SELECT count(*) AS total_models FROM models;
SELECT count(*) AS total_tasks FROM download_tasks;
SELECT count(*) AS total_audit_logs FROM task_audit_logs;

\echo '======================================================='
\echo 'Database schema setup for ml_model_store completed successfully.'
\echo '======================================================='
