import type { Dataset } from "../../../types/dataset";
import type { Model } from "../../../types/model";

export function generateDatasetCode(dataset: Dataset): string {
  const mountPath = `/workspace/datasets/${sanitizeName(dataset.name)}`;
  const loaders: Record<string, string> = {
    tabular: generateTabularCode(mountPath),
    image: generateImageCode(mountPath),
    text: generateTextCode(mountPath),
    audio: generateAudioCode(mountPath)
  };

  const loader = loaders[dataset.type] ?? generateGenericCode(mountPath);

  return `# Dataset: ${dataset.name}\n# Type: ${dataset.type} | Size: ${formatBytes(dataset.size_bytes)}\n# Mounted at: ${mountPath}\nDATASET_PATH = "${mountPath}"\n\n${loader}`;
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

function generateTabularCode(path: string): string {
  return `import os\nimport pandas as pd\n\ncsv_files = [f for f in os.listdir(DATASET_PATH) if f.endswith('.csv')]\nprint(f"Found {len(csv_files)} csv files")\n\nif csv_files:\n    df = pd.read_csv(os.path.join(DATASET_PATH, csv_files[0]))\n    print(df.shape)\n    display(df.head())`;
}

function generateImageCode(path: string): string {
  return `from pathlib import Path\n\nimage_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}\nimage_files = [p for p in Path(DATASET_PATH).rglob('*') if p.suffix.lower() in image_exts]\nprint(f"Total images: {len(image_files)}")`;
}

function generateTextCode(path: string): string {
  return `from pathlib import Path\n\ntext_files = list(Path(DATASET_PATH).rglob('*.txt')) + list(Path(DATASET_PATH).rglob('*.json'))\nprint(f"Text files: {len(text_files)}")\nif text_files:\n    print(text_files[0])`;
}

function generateAudioCode(path: string): string {
  return `from pathlib import Path\n\naudio_exts = {'.wav', '.mp3', '.flac', '.ogg'}\naudio_files = [p for p in Path(DATASET_PATH).rglob('*') if p.suffix.lower() in audio_exts]\nprint(f"Audio files: {len(audio_files)}")`;
}

function generateGenericCode(path: string): string {
  return `import os\nfor root, _, files in os.walk(DATASET_PATH):\n    print(root, len(files))`;
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
