import type { Dataset } from "../../../types/dataset";
import type { Model } from "../../../types/model";

export function generateDatasetCode(dataset: Dataset, mountedPath?: string): string {
  const mountPath = resolveDatasetMountPath(dataset, mountedPath);
  const loaders: Record<string, string> = {
    tabular: generateTabularCode(),
    image: generateImageCode(),
    text: generateTextCode(),
    audio: generateAudioCode()
  };

  const loader = loaders[dataset.type] ?? generateGenericCode();

  return `# Dataset: ${dataset.name}\n# Dataset ID: ${dataset.id}\n# Type: ${dataset.type} | Size: ${formatBytes(dataset.size_bytes)}\n# Mounted at (expected): ${mountPath}\nDATASET_PATH = "${mountPath}"\n\n${generateDatasetPathResolver(dataset, mountPath)}\n\n${loader}`;
}

export function generateModelCode(model: Model): string {
  const mountPath = `/workspace/models/${sanitizeName(model.name)}`;
  const loaders: Record<string, string> = {
    pytorch: generatePyTorchCode(mountPath),
    tensorflow: generateTensorFlowCode(mountPath),
    onnx: generateONNXCode(mountPath),
    huggingface: generateHuggingFaceCode(model, mountPath),
    sklearn: generateSklearnCode(mountPath)
  };

  const loader = loaders[model.framework] ?? generateGenericModelCode(mountPath);

  return `# Model: ${model.name}\n# Architecture: ${model.architecture} | Framework: ${model.framework}\n# Task: ${model.task_type} | Size: ${formatBytes(model.size_bytes)}\n# Mounted at: ${mountPath}\nMODEL_PATH = "${mountPath}"\n\n${loader}`;
}

export function generateUploadCode(fileName: string, uploadPath: string): string {
  const ext = `.${fileName.split(".").pop()?.toLowerCase() ?? ""}`;
  const fullPath = `/workspace/${uploadPath}`;
  const readers: Record<string, string> = {
    ".csv": "import pandas as pd\\ndf = pd.read_csv(FILE_PATH)\\nprint(df.shape)\\ndf.head()",
    ".tsv": "import pandas as pd\\ndf = pd.read_csv(FILE_PATH, sep='\\\\t')\\nprint(df.shape)\\ndf.head()",
    ".xlsx": "import pandas as pd\\ndf = pd.read_excel(FILE_PATH)\\nprint(df.shape)\\ndf.head()",
    ".json": "import json\\nwith open(FILE_PATH, 'r', encoding='utf-8') as f:\\n    data = json.load(f)\\nprint(type(data))",
    ".txt": "with open(FILE_PATH, 'r', encoding='utf-8') as f:\\n    content = f.read()\\nprint(content[:500])",
    ".pt": "import torch\\nobj = torch.load(FILE_PATH, map_location='cpu')\\nprint(type(obj))",
    ".pkl": "import pickle\\nwith open(FILE_PATH, 'rb') as f:\\n    obj = pickle.load(f)\\nprint(type(obj))"
  };

  const defaultReader = "with open(FILE_PATH, 'rb') as f:\\n    data = f.read()\\nprint(f'Size: {len(data)} bytes')";
  return `# Uploaded file: ${fileName}\\nFILE_PATH = "${fullPath}"\\n\\n${readers[ext] ?? defaultReader}`;
}

function generateTabularCode(): string {
  return `import pandas as pd\n\nif DATASET_DIR is None:\n    print("[WARN] Dataset is not mounted in this workspace. Skipping tabular preview.")\nelse:\n    csv_files = sorted(DATASET_DIR.rglob("*.csv"))\n    print(f"Found {len(csv_files)} csv files")\n\n    if csv_files:\n        df = pd.read_csv(csv_files[0])\n        print(f"Preview file: {csv_files[0]}")\n        print(df.shape)\n        display(df.head())\n    else:\n        print("[DEV] No CSV files found in resolved dataset path.")`;
}

function generateImageCode(): string {
  return `if DATASET_DIR is None:\n    print("[WARN] Dataset is not mounted in this workspace. Skipping image scan.")\nelse:\n    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}\n    image_files = [p for p in DATASET_DIR.rglob("*") if p.suffix.lower() in image_exts]\n    print(f"Total images: {len(image_files)}")\n    if not image_files:\n        print("[DEV] No image files found. Verify dataset mount/extraction.")`;
}

function generateTextCode(): string {
  return `if DATASET_DIR is None:\n    print("[WARN] Dataset is not mounted in this workspace. Skipping text scan.")\nelse:\n    text_files = list(DATASET_DIR.rglob("*.txt")) + list(DATASET_DIR.rglob("*.json"))\n    print(f"Text files: {len(text_files)}")\n    if text_files:\n        print(f"Preview file: {text_files[0]}")`;
}

function generateAudioCode(): string {
  return `if DATASET_DIR is None:\n    print("[WARN] Dataset is not mounted in this workspace. Skipping audio scan.")\nelse:\n    audio_exts = {".wav", ".mp3", ".flac", ".ogg"}\n    audio_files = [p for p in DATASET_DIR.rglob("*") if p.suffix.lower() in audio_exts]\n    print(f"Audio files: {len(audio_files)}")`;
}

function generateGenericCode(): string {
  return `import os\nif DATASET_DIR is None:\n    print("[WARN] Dataset is not mounted in this workspace. Skipping filesystem walk.")\nelse:\n    for root, _, files in os.walk(DATASET_DIR):\n        print(root, len(files))`;
}

function generatePyTorchCode(path: string): string {
  return `import os\nimport torch\n\nweight_files = [f for f in os.listdir(MODEL_PATH) if f.endswith(('.pt', '.pth', '.bin'))]\nif weight_files:\n    model = torch.load(os.path.join(MODEL_PATH, weight_files[0]), map_location='cpu')\n    print(type(model))`;
}

function generateTensorFlowCode(path: string): string {
  return `import os\nimport tensorflow as tf\n\nif os.path.exists(os.path.join(MODEL_PATH, 'saved_model.pb')):\n    model = tf.saved_model.load(MODEL_PATH)\n    print('Loaded SavedModel')`;
}

function generateONNXCode(path: string): string {
  return `import os\nimport onnxruntime as ort\n\nonnx_files = [f for f in os.listdir(MODEL_PATH) if f.endswith('.onnx')]\nif onnx_files:\n    session = ort.InferenceSession(os.path.join(MODEL_PATH, onnx_files[0]))\n    print(session.get_providers())`;
}

function generateHuggingFaceCode(model: Model, path: string): string {
  const modelClass = model.task_type === "text_generation" ? "AutoModelForCausalLM" : "AutoModelForSequenceClassification";
  return `from transformers import AutoTokenizer, ${modelClass}\n\ntokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)\nmodel = ${modelClass}.from_pretrained(MODEL_PATH)\nprint(model.__class__.__name__)`;
}

function generateSklearnCode(path: string): string {
  return `import os\nimport joblib\n\nfiles = [f for f in os.listdir(MODEL_PATH) if f.endswith(('.joblib', '.pkl'))]\nif files:\n    model = joblib.load(os.path.join(MODEL_PATH, files[0]))\n    print(type(model))`;
}

function generateGenericModelCode(path: string): string {
  return "import os\\nprint(os.listdir(MODEL_PATH))";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function resolveDatasetMountPath(dataset: Dataset, mountedPath?: string): string {
  if (mountedPath && mountedPath.startsWith("/workspace/")) return mountedPath;
  if (dataset.storage_path && dataset.storage_path.startsWith("/workspace/")) return dataset.storage_path;
  return `/workspace/datasets/${sanitizeName(dataset.id)}`;
}

function generateDatasetPathResolver(dataset: Dataset, mountPath: string): string {
  const safeId = sanitizeName(dataset.id);
  const safeName = sanitizeName(dataset.name);
  return `from pathlib import Path\n\n_DATASET_CANDIDATES = [\n    Path(DATASET_PATH),\n    Path("${mountPath}"),\n    Path("/workspace/datasets/${safeId}"),\n    Path("/workspace/datasets/${safeName}"),\n    Path("/workspace/input/${safeId}"),\n]\n\nDATASET_DIR = next((p for p in _DATASET_CANDIDATES if p.exists()), None)\n\nif DATASET_DIR is None:\n    datasets_root = Path("/workspace/datasets")\n    if datasets_root.exists():\n        subdirs = [d.name for d in datasets_root.iterdir() if d.is_dir()]\n        print(f\"[WARN] Dataset '${dataset.id}' is not mounted in this workspace. Available: {subdirs}\")\n    else:\n        print(\"[WARN] /workspace/datasets does not exist in this runtime.\")\nelse:\n    print(f"Resolved dataset path: {DATASET_DIR}")`;
}
