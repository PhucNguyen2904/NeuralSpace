-- Create user if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ml_app_user') THEN
    CREATE ROLE ml_app_user WITH LOGIN PASSWORD 'ChangeThisInProd_App_123!';
  ELSE
    ALTER ROLE ml_app_user WITH PASSWORD 'ChangeThisInProd_App_123!';
  END IF;
END
$$;

-- Create database if not exists
SELECT 'CREATE DATABASE ml_model_store OWNER ml_app_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ml_model_store')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ml_model_store TO ml_app_user;
