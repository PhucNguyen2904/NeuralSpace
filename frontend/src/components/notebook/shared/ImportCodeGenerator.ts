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
  const mountPath = resolveModelMountPath(model);
  const loaders: Record<string, string> = {
    pytorch: generatePyTorchCode(),
    tensorflow: generateTensorFlowCode(),
    onnx: generateONNXCode(),
    huggingface: generateHuggingFaceCode(model),
    sklearn: generateSklearnCode()
  };

  const loader = loaders[model.framework] ?? generateGenericModelCode();

  return `# Model: ${model.name}\n# Architecture: ${model.architecture} | Framework: ${model.framework}\n# Task: ${model.task_type} | Size: ${formatBytes(model.size_bytes)}\n# Mounted at (expected): ${mountPath}\nMODEL_PATH = "${mountPath}"\n\n${generateModelPathResolver(model, mountPath)}\n\n${loader}`;
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

function generatePyTorchCode(): string {
  return `import torch\n\nif MODEL_DIR is None:\n    print("[WARN] Model path not found. Skipping PyTorch load test.")\nelse:\n    weight_files = sorted([p for p in MODEL_DIR.rglob("*") if p.suffix.lower() in {".pt", ".pth", ".bin"}])\n    if weight_files:\n        model = torch.load(str(weight_files[0]), map_location='cpu')\n        print(f"Loaded: {weight_files[0]}")\n        print(type(model))\n    else:\n        print("[WARN] No PyTorch weights found under resolved model path.")`;
}

function generateTensorFlowCode(): string {
  return `import tensorflow as tf\n\nif MODEL_DIR is None:\n    print("[WARN] Model path not found. Skipping TensorFlow load test.")\nelse:\n    saved_model = MODEL_DIR / "saved_model.pb"\n    if saved_model.exists():\n        model = tf.saved_model.load(str(MODEL_DIR))\n        print(f"Loaded SavedModel from: {MODEL_DIR}")\n    else:\n        print("[WARN] saved_model.pb not found in resolved model path.")`;
}

function generateONNXCode(): string {
  return `import onnxruntime as ort\n\nif MODEL_DIR is None:\n    print("[WARN] Model path not found. Skipping ONNX load test.")\nelse:\n    onnx_files = sorted(MODEL_DIR.rglob("*.onnx"))\n\n    if not onnx_files:\n        print("[WARN] No .onnx file found under resolved model path.")\n    else:\n        selected_model = None\n\n        # Validate candidates first to avoid noisy stack traces from corrupted files.\n        for candidate in onnx_files:\n            try:\n                session = ort.InferenceSession(str(candidate))\n                selected_model = str(candidate)\n                print(f"[OK] Loaded ONNX: {selected_model}")\n                print("Providers:", session.get_providers())\n                break\n            except Exception as e:\n                print(f"[WARN] Skip invalid ONNX: {candidate.name} -> {type(e).__name__}")\n\n        if selected_model is None:\n            print("[WARN] All discovered .onnx files are invalid/corrupted.")\n            print("[INFO] Creating a minimal smoke-test ONNX model so you can continue system testing.")\n\n            try:\n                import onnx\n                from onnx import helper, TensorProto\n                import numpy as np\n\n                smoke_path = MODEL_DIR / "smoke_test.onnx"\n\n                x = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 3])\n                y = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 3])\n                one = helper.make_tensor("one", TensorProto.FLOAT, [1, 3], [1.0, 1.0, 1.0])\n                add = helper.make_node("Add", inputs=["x", "one"], outputs=["y"])\n\n                graph = helper.make_graph([add], "smoke_graph", [x], [y], [one])\n                model = helper.make_model(graph, producer_name="workspace_smoke_test")\n                onnx.save(model, str(smoke_path))\n\n                session = ort.InferenceSession(str(smoke_path))\n                output = session.run(None, {"x": np.array([[2.0, 3.0, 4.0]], dtype=np.float32)})\n\n                print(f"[OK] Smoke model created: {smoke_path}")\n                print("[OK] Smoke inference output:", output[0])\n            except Exception as e:\n                print("[ERROR] Could not create fallback smoke ONNX model.")\n                print(f"[ERROR] {type(e).__name__}: {e}")`;
}

function generateHuggingFaceCode(model: Model): string {
  const modelClass = model.task_type === "text_generation" ? "AutoModelForCausalLM" : "AutoModelForSequenceClassification";
  return `from transformers import AutoTokenizer, ${modelClass}\n\nif MODEL_DIR is None:\n    print("[WARN] Model path not found. Skipping HuggingFace load test.")\nelse:\n    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))\n    model = ${modelClass}.from_pretrained(str(MODEL_DIR))\n    print(model.__class__.__name__)`;
}

function generateSklearnCode(): string {
  return `import joblib\n\nif MODEL_DIR is None:\n    print("[WARN] Model path not found. Skipping sklearn load test.")\nelse:\n    files = sorted([p for p in MODEL_DIR.rglob("*") if p.suffix.lower() in {".joblib", ".pkl"}])\n    if files:\n        model = joblib.load(str(files[0]))\n        print(f"Loaded: {files[0]}")\n        print(type(model))\n    else:\n        print("[WARN] No sklearn artifact found under resolved model path.")`;
}

function generateGenericModelCode(): string {
  return `if MODEL_DIR is None:\n    print("[WARN] Model path not found.")\nelse:\n    print("Resolved model path:", MODEL_DIR)\n    print("Top-level entries:", sorted([p.name for p in MODEL_DIR.iterdir()]))`;
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

export function resolveModelMountPath(model: Model): string {
  return `/workspace/models/${sanitizeName(model.name)}`;
}

function generateModelPathResolver(model: Model, mountPath: string): string {
  const safeName = sanitizeName(model.name);
  return `from pathlib import Path\n\n_MODEL_CANDIDATES = [\n    Path(MODEL_PATH),\n    Path("${mountPath}"),\n    Path("/workspace/models/${safeName}"),\n    Path("/workspace/models"),\n]\n\nMODEL_DIR = next((p for p in _MODEL_CANDIDATES if p.exists() and p.is_dir() and any(p.rglob("*"))), None)\n\nif MODEL_DIR is None:\n    models_root = Path("/workspace/models")\n    if models_root.exists():\n        subdirs = [d.name for d in models_root.iterdir() if d.is_dir()]\n        print(f"[WARN] Model '${model.name}' is not mounted in this workspace. Available dirs: {subdirs}")\n    else:\n        print("[WARN] /workspace/models does not exist in this runtime.")\nelse:\n    print(f"Resolved model path: {MODEL_DIR}")`;
}

function generateDatasetPathResolver(dataset: Dataset, mountPath: string): string {
  const safeId = sanitizeName(dataset.id);
  const safeName = sanitizeName(dataset.name);
  return `from pathlib import Path\n\n_DATASET_CANDIDATES = [\n    Path(DATASET_PATH),\n    Path("${mountPath}"),\n    Path("/workspace/datasets/${safeId}"),\n    Path("/workspace/datasets/${safeName}"),\n    Path("/workspace/input/${safeId}"),\n]\n\nDATASET_DIR = next((p for p in _DATASET_CANDIDATES if p.exists()), None)\n\nif DATASET_DIR is None:\n    datasets_root = Path("/workspace/datasets")\n    if datasets_root.exists():\n        subdirs = [d.name for d in datasets_root.iterdir() if d.is_dir()]\n        print(f\"[WARN] Dataset '${dataset.id}' is not mounted in this workspace. Available: {subdirs}\")\n    else:\n        print(\"[WARN] /workspace/datasets does not exist in this runtime.\")\nelse:\n    print(f"Resolved dataset path: {DATASET_DIR}")`;
}
