-- ============================================================
-- Script setup PostgreSQL cho môi trường LOCAL (non-Docker)
-- Chạy file này bằng superuser postgres trong pgAdmin hoặc psql
-- ============================================================

-- 1. Tạo user ứng dụng (nếu chưa có)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ml_app_user') THEN
        CREATE USER ml_app_user WITH PASSWORD 'ChangeThisInProd_App_123!';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ml_readonly_user') THEN
        CREATE USER ml_readonly_user WITH PASSWORD 'ChangeThisInProd_Read_123!';
    END IF;
END
$$;

-- 2. Tạo database (chạy ngoài transaction)
-- Nếu lỗi "database already exists" thì bỏ qua dòng này
CREATE DATABASE ml_model_store OWNER ml_app_user;

-- 3. Kết nối vào database ml_model_store rồi chạy phần còn lại
-- \c ml_model_store

-- 4. Cấp quyền
GRANT CONNECT ON DATABASE ml_model_store TO ml_app_user;
GRANT CONNECT ON DATABASE ml_model_store TO ml_readonly_user;
