import type { Dataset } from "../../types/dataset";
import type { Model } from "../../types/model";

export const MOCK_DATASETS: Dataset[] = [
  {
    id: "ds_001",
    name: "Iris Dataset",
    type: "tabular",
    description: "Classic iris flower classification dataset",
    size_bytes: 4500,
    item_count: 150,
    label_status: "labeled",
    tags: ["classification", "beginner"],
    created_at: "2024-01-10T00:00:00Z",
    updated_at: "2024-01-10T00:00:00Z",
    created_by: "system",
    storage_path: "/data/iris"
  },
  {
    id: "ds_002",
    name: "COCO 2017 Detection",
    type: "image",
    description: "Object detection benchmark, 80 classes",
    size_bytes: 18700000000,
    item_count: 118287,
    label_status: "labeled",
    tags: ["detection", "coco"],
    created_at: "2024-01-12T00:00:00Z",
    updated_at: "2024-01-15T00:00:00Z",
    created_by: "alice",
    storage_path: "/data/coco2017"
  },
  {
    id: "ds_003",
    name: "Twitter Sentiment",
    type: "text",
    description: "Sentiment analysis dataset, 3 classes",
    size_bytes: 45000000,
    item_count: 80000,
    label_status: "labeled",
    tags: ["nlp", "sentiment"],
    created_at: "2024-01-08T00:00:00Z",
    updated_at: "2024-01-08T00:00:00Z",
    created_by: "bob",
    storage_path: "/data/twitter_sentiment"
  }
];

export const MOCK_MODELS: Model[] = [
  {
    id: "mdl_001",
    name: "ResNet-50 ImageNet",
    description: "ImageNet pretrained model",
    architecture: "ResNet-50",
    framework: "pytorch",
    task_type: "image_classification",
    status: "ready",
    size_bytes: 245000000,
    parameter_count: 25600000,
    primary_metric_name: "accuracy",
    primary_metric_value: 0.924,
    all_metrics: { accuracy: 0.924, top5_accuracy: 0.969 },
    tags: ["cv", "classification"],
    created_by: "alice",
    created_at: "2024-01-14T00:00:00Z",
    updated_at: "2024-01-14T00:00:00Z",
    version: "v1.0",
    storage_path: "/models/resnet50"
  },
  {
    id: "mdl_002",
    name: "BERT Sentiment",
    description: "BERT fine-tuned for sentiment",
    architecture: "BERT-base",
    framework: "huggingface",
    task_type: "text_classification",
    status: "ready",
    size_bytes: 438000000,
    parameter_count: 110000000,
    primary_metric_name: "accuracy",
    primary_metric_value: 0.891,
    all_metrics: { accuracy: 0.891, f1: 0.887 },
    tags: ["nlp", "sentiment"],
    created_by: "bob",
    created_at: "2024-01-13T00:00:00Z",
    updated_at: "2024-01-13T00:00:00Z",
    version: "v2.1",
    storage_path: "/models/bert_sentiment"
  }
];
