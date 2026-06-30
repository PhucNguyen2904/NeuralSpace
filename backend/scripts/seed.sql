-- Seed development data for workspaces

-- Seed Dev User
INSERT INTO users (id, email, full_name, password_hash)
VALUES ('22222222-2222-2222-2222-222222222222', 'tester@collabclone.local', 'NeuralSpace Tester', 'pbkdf2_sha256$260000$tEdSVWDGq0W9jznRxbNvBg==$bzPohfDaOQ84F2oQk8F2sHjelEWm4/ckN9kl1cGJ8K8=')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Datasets (MLOps)
INSERT INTO mlops.datasets (id, name, description, type, owner_id, storage_path, tags, status) VALUES
('f0eabbb3-69e3-46d6-8354-ba803ed7f966', 'Iris Sample Dataset', 'Iris sample CSV migrated from the legacy workspace storage.', 'tabular', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/ds_001/iris_sample.csv', '["tabular", "classification", "migration"]', 'active'),
('610bb1c8-afc5-449d-a6cc-0b147bbeed78', 'YOLOv8 Custom Dataset', 'Object detection sample dataset migrated from MinIO.', 'image', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/ds_002/sample.csv', '["vision", "object-detection", "migration"]', 'active'),
('8e230adb-62b9-40d4-b976-fca6c37a4790', 'Sentiment Tweets Dataset', 'Text classification sample dataset migrated from MinIO.', 'text', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/ds_003/tweets_sample.txt', '["nlp", "sentiment", "migration"]', 'active'),
('e1d307b3-a76b-4030-9960-b60ec9c4877e', 'Audio Manifest Dataset', 'Audio manifest sample dataset migrated from MinIO.', 'audio', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/ds_004/audio_manifest.csv', '["audio", "manifest", "migration"]', 'active'),
('5bfe70df-b933-4043-8b5a-8ba4cbfccbe4', 'Video Manifest Dataset', 'Video manifest sample dataset migrated from MinIO.', 'video', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/ds_005/video_manifest.csv', '["video", "manifest", "migration"]', 'active'),
('065b0a1e-78a0-4b75-a2b8-44d14fb43225', 'Iris Dataset', 'Classic Iris CSV dataset migrated from MinIO.', 'tabular', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/iris_dataset/iris.csv', '["tabular", "classification", "iris"]', 'active'),
('6225ba35-b3d7-46a3-8619-253c70cdd01a', 'COCO 2017 Detection Sample', 'COCO detection sample files migrated from MinIO.', 'image', '22222222-2222-2222-2222-222222222222', 'migration/server/datasets/coco_2017_detection/sample_0001.jpg', '["vision", "detection", "coco"]', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Dataset Versions (MLOps)
INSERT INTO mlops.dataset_versions (id, dataset_id, version, size_bytes, item_count, storage_path, created_by, is_latest, status) VALUES
('621d285a-99e2-4d69-af92-41f05e8e738d', 'f0eabbb3-69e3-46d6-8354-ba803ed7f966', 'v1', 104857600, 150, 'migration/server/datasets/ds_001/iris_sample.csv', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('52cce21b-9439-4570-bcaf-a26ca4b2ba0a', '610bb1c8-afc5-449d-a6cc-0b147bbeed78', 'v1', 52428800, 5000, 'migration/server/datasets/ds_002/sample.csv', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('802508c3-caff-49ec-8cdf-e7c97c5b95c9', '8e230adb-62b9-40d4-b976-fca6c37a4790', 'v1', 18874368, 25000, 'migration/server/datasets/ds_003/tweets_sample.txt', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('b58c9b2a-44d1-42f8-aa53-9b5149932fdd', 'e1d307b3-a76b-4030-9960-b60ec9c4877e', 'v1', 73400320, 1200, 'migration/server/datasets/ds_004/audio_manifest.csv', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('16e18056-f7d6-4cc1-923d-4bb5b43b771a', '5bfe70df-b933-4043-8b5a-8ba4cbfccbe4', 'v1', 188743680, 320, 'migration/server/datasets/ds_005/video_manifest.csv', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('2f3583e1-84af-4880-a18a-244572a5e3bf', '065b0a1e-78a0-4b75-a2b8-44d14fb43225', 'v1', 16384, 150, 'migration/server/datasets/iris_dataset/iris.csv', '22222222-2222-2222-2222-222222222222', true, 'validated'),
('74391d68-19b0-4b1f-8c3e-05c2db627644', '6225ba35-b3d7-46a3-8619-253c70cdd01a', 'v1', 3221225472, 120000, 'migration/server/datasets/coco_2017_detection/sample_0001.jpg', '22222222-2222-2222-2222-222222222222', true, 'validated')
ON CONFLICT (id) DO NOTHING;
