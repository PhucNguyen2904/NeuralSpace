# Lineage Query Plan Notes

## 1) Dataset -> downstream models
Canonical query:
```sql
SELECT mv.*, r.*, dv.*
FROM mlops.model_dataset_links mdl
JOIN mlops.model_versions mv ON mv.id = mdl.model_version_id
JOIN mlops.runs r ON r.id = mv.run_id
JOIN mlops.dataset_versions dv ON dv.id = mdl.dataset_version_id
WHERE mdl.dataset_version_id = :dataset_version_id
ORDER BY mv.created_at DESC;
```
Expected plan:
- Index scan on `model_dataset_links(dataset_version_id, ...)`
- Nested loop/Hash join to `model_versions(id)` then `runs(id)`
- Sort by `mv.created_at DESC` (optimize with composite index if hot path)

## 2) Model -> upstream datasets
```sql
SELECT mdl.link_type, dv.*
FROM mlops.model_dataset_links mdl
JOIN mlops.dataset_versions dv ON dv.id = mdl.dataset_version_id
WHERE mdl.model_version_id = :model_version_id;
```
Expected plan:
- Index lookup on unique `model_dataset_links(model_version_id, dataset_version_id, link_type)`
- PK lookup on `dataset_versions(id)`

## 3) Impact analysis (production only)
```sql
SELECT mv.*, r.*
FROM mlops.model_dataset_links mdl
JOIN mlops.model_versions mv ON mv.id = mdl.model_version_id
JOIN mlops.runs r ON r.id = mv.run_id
WHERE mdl.dataset_version_id = :dataset_version_id
  AND mv.stage = 'Production'
ORDER BY mv.created_at DESC;
```
Expected plan:
- Index scan on `mdl.dataset_version_id`
- Filter by `mv.stage` (`ix_mlops_model_versions_stage`)

## Optional extra index
If impact-analysis is frequent, add:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mlops_model_versions_stage_created
ON mlops.model_versions(stage, created_at DESC);
```
