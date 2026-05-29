# CI/CD Secrets Setup (GitHub Actions)

Set in GitHub repo: `Settings -> Secrets and variables -> Actions`.

## Required Secrets
- `PLATFORM_API_BASE_URL`: Base URL of FastAPI platform (e.g. `https://platform.internal`)
- `PLATFORM_API_TOKEN`: Service token with dataset/model write permissions
- `MLFLOW_TRACKING_URI`: MLflow tracking URI (e.g. `http://mlflow.internal:5000`)
- `MINIO_ENDPOINT_URL`: MinIO S3 endpoint (e.g. `http://minio.internal:9000`)
- `AWS_ACCESS_KEY_ID`: MinIO access key
- `AWS_SECRET_ACCESS_KEY`: MinIO secret key
- `PLATFORM_USER_ID`: User UUID for MLflow tags
- `PLATFORM_TEAM_ID`: Team UUID for MLflow tags
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications

## Recommended Variables (non-secret)
- `PLATFORM_DATASET_ID`: Dataset logical ID used in Pipeline A sync
- `DEFAULT_DATASET_VERSION_ID`: Fallback dataset version for scheduled training
- `DEFAULT_MODEL_NAME`: Model name fallback for scheduled/manual training
- `PREVIOUS_DATASET_SIZE_BYTES`: Baseline size for data drift checks

## Notes
- Keep API token scope minimal (dataset version create, model promote/rollback, read model metadata).
- Rotate MinIO and API credentials regularly.
- For production, prefer OIDC/Federated auth over static long-lived secrets.
